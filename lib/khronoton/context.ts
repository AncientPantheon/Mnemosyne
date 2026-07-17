import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  AUTO_GAS_CEILING,
  LISTEN_TIMEOUT_MS,
  MANUAL_BATCH_INTERVAL_SECONDS,
  MANUAL_BATCH_MAX,
  MANUAL_BATCH_MIN,
  SINGLE_TX_GAS_GUARD,
  TICK_BATCH_LIMIT,
  TICK_INTERVAL_MS,
} from "@ancientpantheon/khronoton-core/server";
import type {
  AuditEvent,
  Config,
  OnAudit,
  ResolveFireMode,
} from "@ancientpantheon/khronoton-core/server";
import type { TickCtx } from "@ancientpantheon/khronoton-core/server";

import { getKhronotonDb, khronotonDir } from "./db";
import { createMnemosyneKeyResolver } from "./keyResolver";
import { getChainRuntime } from "./runtime";

/**
 * Assembly of the six Khronoton injection seams for Mnemosyne (handoff 05):
 * db (better-sqlite3 on the data volume), resolver (sealed operator codex),
 * runtime (the packaged StoaChain adapter), onAudit (JSONL trail beside the db),
 * resolveFireMode (always 'live' — Mnemosyne schedules real transactions), and
 * the FULL 6-field Config (TickCtx requires every field; package defaults,
 * tick cadence overridable via KHRONOTON_TICK_MS).
 *
 * ONE shared ctx serves both the tick loop (instrumentation.ts) and the admin
 * API handlers, so they see the same db handle and the same seams.
 */

/** Append-only JSONL audit trail beside the database; console mirrors failures. */
function auditLog(event: AuditEvent): void {
  const line = JSON.stringify({ at: new Date().toISOString(), ...event });
  try {
    const dir = khronotonDir();
    mkdirSync(dir, { recursive: true });
    appendFileSync(join(dir, "audit.jsonl"), `${line}\n`);
  } catch {
    // The audit trail must never break a fire; fall through to console only.
  }
  if (event.result === "failure" || event.result === "error") {
    console.warn(`[khronoton audit] ${line}`);
  }
}

export function buildKhronotonConfig(): Config {
  const tickOverride = Number(process.env.KHRONOTON_TICK_MS);
  return {
    tickIntervalMs:
      Number.isFinite(tickOverride) && tickOverride > 0 ? tickOverride : TICK_INTERVAL_MS,
    listenTimeoutMs: LISTEN_TIMEOUT_MS,
    autoGasCeiling: AUTO_GAS_CEILING,
    singleTxGasGuard: SINGLE_TX_GAS_GUARD,
    tickBatchLimit: TICK_BATCH_LIMIT,
    manualBatch: {
      min: MANUAL_BATCH_MIN,
      max: MANUAL_BATCH_MAX,
      intervalSeconds: MANUAL_BATCH_INTERVAL_SECONDS,
    },
  };
}

const onAudit: OnAudit = auditLog;
const resolveFireMode: ResolveFireMode = () => "live";

const g = globalThis as unknown as { __mnemosyneKhronotonCtx?: Promise<TickCtx> };

/** The shared engine context — built once per process, reused by loop + handlers. */
export function getKhronotonContext(): Promise<TickCtx> {
  if (g.__mnemosyneKhronotonCtx) return g.__mnemosyneKhronotonCtx;
  g.__mnemosyneKhronotonCtx = (async (): Promise<TickCtx> => ({
    db: getKhronotonDb(),
    resolver: createMnemosyneKeyResolver(),
    runtime: await getChainRuntime(),
    onAudit,
    resolveFireMode,
    config: buildKhronotonConfig(),
  }))();
  return g.__mnemosyneKhronotonCtx;
}
