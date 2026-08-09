import type {
  ChainRuntime,
  ChainClient,
  DirtyReadResult,
  ListenResult,
} from "@ancientpantheon/khronoton-core/server";

import { getGatedPythiaClient, withConnectorSelfHeal } from "@/lib/pythia/connectorClient";
import {
  resolveServerTransport,
  pactBaseUrl,
  type ResolvedTransport,
} from "@/lib/transport/serverTransport";

/**
 * Route a Khronoton `ChainRuntime` through PYTHIA instead of a direct node.
 *
 * Mnemosyne has ONE on-chain connection: Pythia. Its embedded Khronoton fires
 * autonomously, and — like every other on-chain path — those fires (and their
 * pre-flight dirty-reads and confirmations) must flow through Pythia, never
 * straight to a chainweb node (`organs/06` §6/§6a).
 *
 * This mirrors Pythia's own `meterChainRuntime` (which wraps `createClient` to
 * meter submit), but instead of metering a local ledger it FORWARDS the client's
 * three calls to Pythia's gateway via the server-side keyed `getGatedPythiaClient()`
 * (so Mnemosyne's own fires are attributed to `mnemosyne`):
 *   - `dirtyRead(tx)` → Pythia `/stoachain/read` (a keyless Pact `local`; gas).
 *   - `submit(tx)`    → Pythia `/stoachain/send` (the SIGNED broadcast — metered).
 *   - `listen(desc)`  → poll Pythia `/stoachain/poll` until the tx is FINAL.
 *
 * The injected `url` is IGNORED — there is no node to dial.
 *
 * LIMITATION (documented, load-bearing): Pythia's `/poll` reports mined-status
 * only (`pending|final` + depth/blockHeight), NOT the on-chain result. So a fire
 * that MINES is reported here as `status:"success"`; a mined-but-failed fire is
 * not distinguished (the executor's own recovery/timeout handling still applies).
 * Closing this needs Pythia's `/poll` to return the command result — until then
 * this is the faithful maximum for a node-less consumer. Metering (submit) is
 * unaffected: it counts the moment the send reaches `/stoachain/send`.
 */

/** The subset of `@ancientpantheon/pythia-client` this wrapper drives. */
export interface PythiaChainGateway {
  read(input: { code: string; data?: object }): Promise<unknown>;
  send(input: { cmds: unknown[] }): Promise<unknown>;
  poll(input: { requestKeys: string[] }): Promise<unknown>;
}

export interface PythiaRoutedRuntimeOptions {
  /** Supply the gateway (tests). Defaults to the server keyed gated client. */
  getGateway?: () => PythiaChainGateway;
  /** Resolve the live transport mode (tests). Defaults to admin-settings-backed
   *  `resolveServerTransport` — so the admin Network Fallback governs fires too. */
  resolveTransport?: () => ResolvedTransport;
  /** Delay between `/poll` attempts while awaiting finality. Default 3s. */
  pollIntervalMs?: number;
  /** Hard ceiling on the listen poll-loop so it can never run away if the outer
   *  `listenWithTimeout` is bypassed. Default 120s. */
  maxListenMs?: number;
  /** Injected sleeper (tests). Defaults to `setTimeout`. */
  sleep?: (ms: number) => Promise<void>;
  /** Injected clock (tests). Defaults to `Date.now`. */
  now?: () => number;
  /** Body-level self-heal wrapper (§7e). Defaults to `withConnectorSelfHeal`; tests
   *  inject a pass-through. */
  selfHeal?: <T>(fn: () => Promise<T>) => Promise<T>;
}

const DEFAULT_POLL_INTERVAL_MS = 3_000;
const DEFAULT_MAX_LISTEN_MS = 120_000;

function firstRequestKey(sendResult: unknown): string {
  const keys = (sendResult as { requestKeys?: unknown } | null)?.requestKeys;
  const rk = Array.isArray(keys) ? keys[0] : undefined;
  return typeof rk === "string" ? rk : "";
}

export function routeChainRuntimeThroughPythia(
  base: ChainRuntime,
  opts: PythiaRoutedRuntimeOptions = {},
): ChainRuntime {
  const getGateway = opts.getGateway ?? (() => getGatedPythiaClient() as unknown as PythiaChainGateway);
  const resolveTransport = opts.resolveTransport ?? (() => resolveServerTransport());
  const pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const maxListenMs = opts.maxListenMs ?? DEFAULT_MAX_LISTEN_MS;
  const selfHeal = opts.selfHeal ?? withConnectorSelfHeal;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());

  return {
    ...base,
    createClient(url: string): ChainClient {
      // Break-glass: while the admin Network Fallback is on `direct-node`, this
      // fire (and its dirty-read + confirmation) talks straight to the configured
      // Stoa node — UNMETERED — via the base runtime's real node client. Resolved
      // per-fire so an admin flip takes effect on the next fire.
      const transport = resolveTransport();
      if (transport.mode === "direct-node") {
        return base.createClient(pactBaseUrl(transport.nodeUrl));
      }
      // Default (pythia mode): meter the SEND through Pythia, but pass the
      // pre-fire SIMULATE (dirtyRead) straight through to the node — exactly as
      // Pythia's own `meterChainRuntime` does. The simulate needs the command's
      // declared signers (a `keys-all` guard fails without them), and Pythia's
      // `/read` strips signers; it is unmetered plumbing (`organs/06` §6) either way.
      const nodeClient = base.createClient(url);
      return {
        dirtyRead(tx: unknown): Promise<DirtyReadResult> {
          return nodeClient.dirtyRead(tx);
        },

        async submit(tx: unknown): Promise<{ requestKey: string }> {
          // §7e: self-heal a dead ephemeral key (body OR throw) + retry once. The
          // gateway is re-resolved inside the thunk so the retry binds to the
          // rebuilt connector.
          const res = await selfHeal(() => getGateway().send({ cmds: [tx] }));
          const requestKey = firstRequestKey(res);
          if (!requestKey) {
            throw new Error("Pythia /stoachain/send returned no requestKey");
          }
          return { requestKey };
        },

        async listen(desc: unknown): Promise<ListenResult> {
          const requestKey = (desc as { requestKey?: unknown } | null)?.requestKey;
          if (typeof requestKey !== "string" || !requestKey) {
            throw new Error("listen: descriptor is missing a requestKey");
          }
          const deadline = now() + maxListenMs;
          for (;;) {
            const pr = (await selfHeal(() => getGateway().poll({ requestKeys: [requestKey] }))) as {
              results?: Record<string, { status?: string }>;
            };
            const status = pr?.results?.[requestKey]?.status;
            if (status === "final") {
              // Mined. Pythia's poll cannot report the on-chain result status, so
              // a mined fire is treated as success (see the module LIMITATION note).
              return { result: { status: "success" }, reqKey: requestKey };
            }
            if (now() >= deadline) {
              // Preserve the key so the executor can recover an ambiguous fire.
              throw new Error(
                `Pythia poll did not reach finality within ${maxListenMs}ms for ${requestKey}`,
              );
            }
            await sleep(pollIntervalMs);
          }
        },
      };
    },
  };
}
