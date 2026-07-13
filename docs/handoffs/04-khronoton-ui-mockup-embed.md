# Handoff 04 — Embed the Khronoton UI mockup as the inline `/admin/khronoton` page

**For:** the Mnemosyne (localhost) agent.
**From:** the Khronoton package agent.
**Type:** small, reversible UI embed of a **static mockup** — visual review only, NOT a live wiring.

## Why
`@ancientpantheon/khronoton-core@0.2.0` shipped the headless **engine** (`/server` subpath): store + atomic claim-before-fire, executor, tick, `startKhronotonLoop`, `installSchema`. Still to build (planned **0.3.0**) is the **experience layer** — new subpaths `/handlers` (framework-agnostic API routes), `/provider` + `/hooks` + `/ui` + `/ui.css`, mirroring how `@ancientpantheon/codex` is packaged and recolored.

Before that build, the ancient admin wants to **see and give feedback** on the look/flow. A self-contained HTML mockup exists (cronoton list, two-pane builder, fire-history observe view, public read-only view, + a live consumer-theme switcher demonstrating the `--khr-*` recolor mechanism). This handoff embeds it inline at `/admin/khronoton` so it's reviewable in Mnemosyne's admin shell.

## Source of the mockup (single self-contained file)
`D:/_Claude/AncientPantheon/Khronoton/preview/index.html` — one file, all CSS/JS/mock-data inline, no external assets. Same machine, so just copy it.

> **Updated 2026-07-13 (v2):** the mockup was rebuilt to reproduce the Hub's create builder **field-for-field** (exact palette + every label/helper): full header (Description, Server-resolver options, Externally-fireable, Runtime-arg-keys + helper), and complete Config / Payload / Gas Payer / Signatures / Execute tabs + all 7 schedule modes; the Observe/Public fire history is now **paginated at 50/page** (137 generated sample fires, working First/Prev/Next/Last). **If you already embedded v1, just re-copy the file** (step 1) to refresh — no code change needed.

## Steps
1. **Copy the mockup into Mnemosyne's public dir:**
   ```
   cp D:/_Claude/AncientPantheon/Khronoton/preview/index.html \
      D:/_Claude/AncientPantheon/Mnemosyne/public/khronoton-mockup.html
   ```
   (Next serves it at `/khronoton-mockup.html`, no auth — it's the raw mockup.)

2. **Frame it inline in the existing (Ancient-gated) page.** Edit `app/admin/khronoton/KhronotonPage.client.tsx` — keep `"use client"`, keep the `AdminGate` wrapper and the default export; replace ONLY the placeholder `KhronotonSection` body with an iframe:
   ```tsx
   function KhronotonSection(): ReactElement {
     return (
       <section className="mnemo-admin-card" style={{ padding: 0, overflow: "hidden" }}>
         <div style={{ padding: "14px 18px", borderBottom: "1px solid var(--mnemo-border, #2a241c)" }}>
           <h2 className="mnemo-admin-h2" style={{ margin: 0 }}>Autonomous transactions</h2>
           <p className="mnemo-admin-muted" style={{ margin: "4px 0 0" }}>
             Mockup preview of the planned Khronoton UI (<code>@ancientpantheon/khronoton-core/ui</code>).
             Use the tabs + <em>consumer theme</em> switcher inside the frame. Not yet wired to the live engine.
           </p>
         </div>
         <iframe
           title="Khronoton UI mockup"
           src="/khronoton-mockup.html"
           style={{ width: "100%", height: "82vh", border: "none", display: "block", background: "#0a0a0f" }}
         />
       </section>
     );
   }
   ```
   Leave `KhronotonPage()` (the `AdminGate`-wrapped export) exactly as is.

3. **Run dev on port 3011** (3005 is the prod/standalone build; 3006–3010 are occupied — 3011 is next free):
   ```
   npx next dev --webpack -p 3011
   ```
   The current 3005 is a `output: "standalone"` production build and will NOT reflect this source change until rebuilt — use dev to review, or rebuild + restart the standalone later.

## Verify
- `http://localhost:3011/khronoton-mockup.html` → the raw mockup renders (public, no auth). Note: the screenshot tool may time out on the "running" badge's infinite pulse animation, but it renders fine in a real browser.
- `http://localhost:3011/admin/khronoton` → after Ancient login, the mockup shows inline in the admin card.

## What the ancient admin is reviewing (feedback targets)
- **4 views** via the top nav: `Cronotons` (list) · `Create` (two-pane Pact builder + Config/Payload/GasPayer/Signatures/Execute tabs + 7 schedule modes) · `Observe` (one cronoton's metadata + fire-history: LIVE/TEST modes, success/nothing/failure/running badges, request keys, `⚠ hash` fingerprint-drift, manual-batch progress, `explorer ↗` verify links) · `Public view` (read-only transparency + explorer verify links).
- **The `consumer theme` dropdown** (top-right): Khronoton base → Mnemosyne recolor → Aletheia → Light. The *same components* repaint by overriding `--khr-*` CSS variables — the "consumers add their own colors on top" mechanism, exactly like Mnemosyne recolors `@ancientpantheon/codex` via `body .codex-ui` overrides.

## Boundaries
- This is a **static mockup** (mock data, no network). Do NOT wire it to any engine/store — that's the 0.3.0 `/ui` + `/handlers` build in the Khronoton repo.
- When the real `@ancientpantheon/khronoton-core/ui` ships, replace the iframe with the real `<KhronotonProvider adapter={…}>` + components mount (same pattern as `app/admin/codex/MnemosyneCodex.tsx`).
- Reversible: delete `public/khronoton-mockup.html` and restore the placeholder `KhronotonSection` to undo.
