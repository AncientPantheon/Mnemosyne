import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Source-contract for the deploy panel UI (app/admin/update-deploy/UpdateDeployPage.client.tsx
// + app/admin/admin.css). The panel mounts a browser-only tree (EventSource, timers,
// window.location.reload), untestable in this node-env vitest, so each assertion pins a
// concrete regression against the §05 deploy-panel standard: the status endpoint / auto-attach
// going away (a deploy this browser did not trigger becomes invisible), the step counter being
// synthesized instead of parsed, the timer or the pacman heartbeat freezing, the stall watchdog
// losing its threshold or its copy, the auto-reload firing on a FAILED deploy (which would wipe
// the log the operator needs), the box readout losing a field, the green "up to date" chip
// regressing to a bogus arrow, or the confirmation row replacing the Deploy button again.

const root = process.cwd();
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

describe("deploy panel §05 — the progress display (source contract)", () => {
  const client = () => read("app", "admin", "update-deploy", "UpdateDeployPage.client.tsx");
  const css = () => read("app", "admin", "admin.css");

  it("reads /api/admin/deploy/status and auto-attaches to `active`, guarded against double-attach", () => {
    const src = client();
    // §5d: a deploy triggered by another operator, an agent's spool request or a previous
    // session must still be observable here. Without the guard a re-render or a second
    // status poll would open a second EventSource on the same log (duplicated output).
    expect(src).toMatch(/fetch\(\s*["']\/api\/admin\/deploy\/status["']/);
    expect(src).toMatch(/\bactive\b/);
    expect(src).toMatch(/attachedRef/);
    expect(src).toMatch(/if \(attachedRef\.current\)/);
  });

  it("starts the elapsed clock from active.startedAt, not from page-open time", () => {
    const src = client();
    // A late-joining browser must show the deploy's TRUE elapsed time (§2).
    expect(src).toMatch(/Date\.parse\([^)]*startedAt[^)]*\)/);
    expect(src).toMatch(/startedAtRef/);
  });

  it("parses the builder's real `Step N/M` out of the streamed chunks, latest match wins", () => {
    const src = client();
    // §5a: the step counter is REAL progress from BuildKit's output — never synthesized.
    expect(src).toContain("Step\\s+(\\d+)\\/(\\d+)");
    expect(src).toMatch(/matchAll\(/);
    expect(src).toMatch(/length - 1\]/);
  });

  it("ticks a client-driven 1s timer formatted `8m18s` so motion survives a network stall", () => {
    const src = client();
    expect(src).toMatch(/setInterval\([^,]+,\s*1000\)/);
    expect(src).toMatch(/clearInterval\(/);
    // `<mins>m<secs>s` — the §5a format.
    expect(src).toMatch(/\}m\$\{[\s\S]{0,80}\}s/);
  });

  it("stalls the display after 20s of silence with the ⚠ copy, and clears it on the next chunk", () => {
    const src = client();
    // 20s is >= 3x the server's 6s heartbeat (§3/§5c) — jitter must never false-alarm.
    expect(src).toMatch(/20_?000/);
    expect(src).toMatch(/no output for/);
    expect(src).toMatch(/the host deployer may have stopped/);
    // The watchdog is driven by the timestamp of the last chunk, reset when one arrives.
    expect(src).toMatch(/lastChunkAtRef\.current = Date\.now\(\)/);
  });

  it("loops the pacman heartbeat in pure CSS, with a stalled state that pauses and reddens it", () => {
    const styles = css();
    // §5b: no JS timer and no data dependency — the animation must be smooth regardless.
    expect(styles).toMatch(/@keyframes\s+[\w-]*pac[\w-]*/i);
    expect(styles).toMatch(/animation:[^;]*infinite/);
    // §5c: the stall is the moment the operator learns the deploy is stuck.
    expect(styles).toMatch(/animation-play-state:\s*paused/);
    expect(styles).toMatch(/is-stalled/);
    expect(client()).toMatch(/is-stalled/);
  });

  it("auto-reloads ONLY on success, after a visible countdown", () => {
    const src = client();
    expect(src).toMatch(/location\.reload\(\)/);
    expect(src).toMatch(/reloading this page in/);
    const success = src.slice(src.indexOf('s === "success"'));
    const elseAt = success.indexOf("} else {");
    expect(elseAt).toBeGreaterThan(0);
    // The countdown is armed in the success branch...
    expect(success.slice(0, elseAt)).toMatch(/setReloadIn\(/);
    // ...and NEVER in the failure branch: a failed deploy stays on screen with its log.
    expect(success.slice(elseAt)).not.toMatch(/setReloadIn\(/);
  });

  it("renders the five §1b readout fields, degrading each missing one to `unknown`", () => {
    const src = client();
    for (const label of ["Mode", "Live color", "Loopback port", "Container", "Version"]) {
      expect(src).toContain(label);
    }
    // The container cannot discover its own identity; absent env → null → "unknown", never a crash.
    expect(src).toMatch(/["']unknown["']/);
  });

  it("explains the blue-green port juggle by name, and swaps in the dev-mode wording", () => {
    const src = client();
    // Mnemosyne's real loopback ports (deploy/host/mnemosyne-deploy.sh): blue 3005, green 3006.
    expect(src).toMatch(/3005/);
    expect(src).toMatch(/3006/);
    expect(src).toMatch(/80\/443/);
    expect(src).toMatch(/never change/);
    // §6: localhost gets a real action, not a dead button.
    expect(src).toMatch(/@latest/);
    expect(src).toMatch(/restart the dev server/);
  });

  it("shows a green `up to date` chip on a current row, but keeps the arrow for an unreachable probe", () => {
    const src = client();
    expect(src).toMatch(/up to date/);
    // Independent per-probe degradation (§1a): a null `available` is "unreachable", NOT "up to date".
    expect(src).toMatch(/available !== null && !updateAvailable/);
    expect(src).toMatch(/unreachable/);
    expect(css()).toMatch(/\.mnemo-admin-badge--ok\s*\{/);
  });

  it("renders the confirmation BELOW the Deploy button — the button stays put", () => {
    const src = client();
    const btn = src.indexOf("{buttonLabel}");
    const confirm = src.indexOf("mnemo-admin-confirm");
    expect(btn).toBeGreaterThan(-1);
    expect(confirm).toBeGreaterThan(btn);
    // The confirm block is a conditional render whose alternate is `null` — the old shape
    // (`arming ? <confirm/> : <button/>`) made the button jump away on click.
    // `{arming ? ( … ) : null}` — the parenthesised JSX form (a prose mention of the
    // shape in a comment must not satisfy this).
    const armed = /\{arming \?\s*\(([\s\S]*?)\)\s*: null\}/.exec(src);
    expect(armed).not.toBeNull();
    expect(armed?.[1]).toContain("mnemo-admin-confirm");
    expect(armed?.[1]).not.toContain("{buttonLabel}");
    expect(src).not.toMatch(/phase === "arming"/);
  });

  it("pairs any use of the `hidden` attribute with an explicit [hidden] override (the §7 trap)", () => {
    const src = client();
    // A class with a `display:` value defeats `hidden`, rendering the confirm permanently.
    if (/<[^>]*\shidden(\s|=|\/|>)/.test(src)) {
      expect(css()).toMatch(/\[hidden\]\s*\{[^}]*display:\s*none/);
    } else {
      // Conditional rendering instead — nothing to trap.
      expect(src).toMatch(/\{arming \?/);
    }
  });

  it("keeps the buffer reset on (re)connect so the mid-deploy container swap cannot duplicate the log", () => {
    const src = client();
    // §2: every reconnect replays from offset 0 — dropping this reset doubles the whole log.
    expect(src).toMatch(/onopen\s*=\s*\(\)\s*=>/);
    expect(src).toMatch(/setLog\(""\)/);
    // Terminal auto-scroll stays wired to the log buffer.
    expect(src).toMatch(/scrollTop = [\w.]*scrollHeight/);
  });
});
