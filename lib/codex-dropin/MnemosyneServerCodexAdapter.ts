/**
 * MnemosyneServerCodexAdapter — the @ancientpantheon/codex-ouronet CodexAdapter
 * that persists Mnemosyne's OWN operator codex SERVER-SIDE (master-key sealed)
 * instead of browser localStorage.
 *
 * Ported from AncientHoldings' HubServerCodexAdapter. Runs in the browser (the
 * package's CodexProvider only calls the adapter client-side). Every write
 * proxies to `/api/admin/codex`, which seals the snapshot under the Mnemosyne
 * Master Key. The package's per-entity writers each touch one slice; since our
 * backend stores the whole snapshot atomically, each per-entity writer patches
 * an in-memory copy and re-saves the full snapshot — semantically equivalent to
 * saveAll per the package's adapter contract.
 *
 * The whole snapshot is serialized to `backup` (a JSON string) and sealed. Any
 * per-entry secrets inside the snapshot are ALREADY encrypted by the package
 * under the codex password before they reach us, so this adapter never sees or
 * handles plaintext key material — the master-key seal is a second at-rest layer.
 *
 * "Create on the spot": with no snapshot yet, loadAll() returns emptySnapshot()
 * — the codex-ui mounts empty and the admin populates it live; each add/delete
 * flows straight back through saveAll → the sealed store. No upload, ever.
 */

import { emptySnapshot } from "@ancientpantheon/codex-ouronet/adapters";
import type {
  CodexAdapter,
  CodexSnapshot,
} from "@ancientpantheon/codex-ouronet/adapters";
import type {
  IStoaChainSeed,
  IOuroAccount,
  IPureKeypair,
  AddressBookEntry,
  WatchListEntry,
  UiSettings,
  IConsumerSettings,
  ICodexIdentity,
  DeviceVariant,
} from "@ancientpantheon/codex-ouronet/types";

/** The ancient-gated sealed-snapshot plane (GET → backup, POST { backup }, DELETE). */
const SNAPSHOT_URL = "/api/admin/codex";

export class MnemosyneServerCodexAdapter implements CodexAdapter {
  readonly name = "mnemosyne-server";
  private readonly deviceVariant: DeviceVariant;
  private snap: CodexSnapshot | null = null;

  constructor(deviceVariant: DeviceVariant = "main") {
    this.deviceVariant = deviceVariant;
  }

  // ── snapshot read/write ───────────────────────────────────────────────
  async loadAll(): Promise<CodexSnapshot> {
    const res = await fetch(SNAPSHOT_URL, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!res.ok) {
      throw new Error(`${this.name}: load failed (HTTP ${res.status})`);
    }
    const body = (await res.json()) as { backup?: string | null };
    this.snap = body.backup
      ? (JSON.parse(body.backup) as CodexSnapshot)
      : emptySnapshot(this.deviceVariant);
    return this.snap;
  }

  async saveAll(snapshot: CodexSnapshot): Promise<void> {
    this.snap = snapshot;
    const res = await fetch(SNAPSHOT_URL, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      // The whole snapshot is the opaque `backup` blob the sealed store persists.
      body: JSON.stringify({ backup: JSON.stringify(snapshot) }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`${this.name}: save failed (HTTP ${res.status}) ${detail}`);
    }
  }

  /** Ensure we have a working snapshot to patch before a per-slice write. */
  private async current(): Promise<CodexSnapshot> {
    if (this.snap) return this.snap;
    return this.loadAll();
  }

  // ── per-entity convenience writes (patch slice → full save) ───────────
  async saveStoaChainSeeds(seeds: IStoaChainSeed[]): Promise<void> {
    await this.saveAll({ ...(await this.current()), kadenaSeeds: seeds });
  }

  async saveOuroAccounts(accounts: IOuroAccount[]): Promise<void> {
    await this.saveAll({ ...(await this.current()), ouroAccounts: accounts });
  }

  async savePureKeypairs(keypairs: IPureKeypair[]): Promise<void> {
    await this.saveAll({ ...(await this.current()), pureKeypairs: keypairs });
  }

  async saveAddressBook(entries: AddressBookEntry[]): Promise<void> {
    await this.saveAll({ ...(await this.current()), addressBook: entries });
  }

  async saveWatchList(entries: WatchListEntry[]): Promise<void> {
    await this.saveAll({ ...(await this.current()), watchList: entries });
  }

  async saveUiSettings(settings: UiSettings): Promise<void> {
    await this.saveAll({ ...(await this.current()), uiSettings: settings });
  }

  async saveConsumerSettings(
    consumerSettings: Record<string, IConsumerSettings>,
  ): Promise<void> {
    await this.saveAll({ ...(await this.current()), consumerSettings });
  }

  async saveCodexIdentity(identity: ICodexIdentity | undefined): Promise<void> {
    await this.saveAll({ ...(await this.current()), codexIdentity: identity });
  }

  // ── metadata ──────────────────────────────────────────────────────────
  async touch(
    deviceVariant: DeviceVariant,
  ): Promise<{ lastUpdatedAt: string; lastUpdatedDevice: DeviceVariant }> {
    const lastUpdatedAt = new Date().toISOString();
    await this.saveAll({
      ...(await this.current()),
      lastUpdatedAt,
      lastUpdatedDevice: deviceVariant,
    });
    return { lastUpdatedAt, lastUpdatedDevice: deviceVariant };
  }

  async getSchemaVersion(): Promise<number> {
    return (await this.current()).schemaVersion;
  }

  async setSchemaVersion(v: number): Promise<void> {
    await this.saveAll({ ...(await this.current()), schemaVersion: v });
  }

  // ── encrypted UI-settings sidecar (unused; package tolerates absence) ──
  // The whole snapshot is already sealed server-side under the master key, so
  // there is no separate encrypted UI-settings sidecar. Params are required by
  // the CodexAdapter interface but intentionally unused.
  /* eslint-disable @typescript-eslint/no-unused-vars */
  async loadUiSettingsEncrypted(_password: string): Promise<UiSettings | null> {
    return null;
  }

  async saveUiSettingsEncrypted(
    _settings: UiSettings,
    _password: string,
  ): Promise<void> {
    /* no-op */
  }
  /* eslint-enable @typescript-eslint/no-unused-vars */

  // ── destructive ───────────────────────────────────────────────────────
  async clearAll(): Promise<void> {
    const res = await fetch(SNAPSHOT_URL, {
      method: "DELETE",
      credentials: "same-origin",
    });
    if (!res.ok) {
      throw new Error(`${this.name}: clear failed (HTTP ${res.status})`);
    }
    this.snap = emptySnapshot(this.deviceVariant);
  }
}
