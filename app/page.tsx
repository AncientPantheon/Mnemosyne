"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactElement, ReactNode } from "react";

import pkg from "@/package.json";
import { PantheonHeader } from "@/components/PantheonHeader";

import "./landing.css";

// The marketing landing is a fixed-stage HARD PAGE-TURN deck (pantheonic §4): the `.lp`
// root fills the viewport, the shared PantheonHeader (full variant) sits sticky on top,
// and the `.lp-stage` shows exactly ONE `.lp-page` at a time — wheel/keys/touch flip
// discretely to the next page like a book. The original long-scroll section content is
// preserved VERBATIM here, only regrouped into the topic→page map below (Onboarding folds
// under The Codex; Roadmap folds under Security). All pages render in the DOM (inactive
// ones `aria-hidden`) so the content stays crawlable; the active one is revealed by
// translating `.lp-pages`. Fixed height is scoped to `.lp` only, so /admin and /codex keep
// their normal scroll.

/** Inline branded mentions — styled by `.lp .stoachain/.ouronet` (the ™ is a ::after). */
function Stoa(): ReactElement {
  return <span className="stoachain">StoaChain</span>;
}
function Ouro(): ReactElement {
  return <span className="ouronet">Ouronet</span>;
}

/** A single deck page: which topic it belongs to (drives Tier-1 active state), the
 *  topic's Tier-1 label, the page's Tier-2 sub-label, and its content node. */
interface DeckPage {
  topicId: string;
  subLabel: string;
  /** Rendered once, uniformly, at the top of the page (`.lp-page-title`). */
  title: string;
  node: ReactNode;
}

/** The seven Tier-1 topics, in deck order. Each topic owns one or more consecutive
 *  pages in PAGES; Documentation is a separate Tier-1 LINK (not a stage page). */
const TOPICS: { id: string; label: string }[] = [
  { id: "what", label: "What it is" },
  { id: "codex", label: "The Codex" },
  { id: "modes", label: "Four Modes" },
  { id: "storage", label: "Storage" },
  { id: "identity", label: "Identity" },
  { id: "stoictags", label: "StoicTags" },
  { id: "security", label: "Security" },
];

/** The flat deck. Content is regrouped from the original sections, VERBATIM. */
const PAGES: DeckPage[] = [
  // ──────────────────────────── 1. WHAT IT IS ────────────────────────────
  {
    topicId: "what",
    subLabel: "",
    title: "What it is",
    node: (
      <div className="lp-measure-5 lp-center">
        {/* Codex Identity display with braces */}
        <div className="identity-display">
          <div className="identity-line">
            <div className="identity-half">
              <span className="id-prefix">₱.</span>
              <span className="id-payload">мIĂ…óYэ</span>
            </div>
            <span className="halves-separator">:</span>
            <div className="identity-half">
              <span className="id-prefix">Π.</span>
              <span className="id-payload">ПÍ…FgЫ</span>
            </div>
          </div>
          <div className="braces-line">
            <div className="brace-section">
              <div className="brace-u"></div>
              <div className="brace-label">Standard key</div>
              <span className="brace-sublabel">
                160 glyphs after the prefix · 1024 bits · from Seed-A
              </span>
            </div>
            <span></span>
            <div className="brace-section">
              <div className="brace-u"></div>
              <div className="brace-label">Smart key</div>
              <span className="brace-sublabel">
                160 glyphs after the prefix · 1024 bits · from Seed-B
              </span>
            </div>
          </div>
        </div>

        <h1 className="lp-h1 lp-tagline">
          The one stop location for your <Stoa />/<Ouro /> Codex Management
        </h1>
        <p className="lp-sub lp-measure-3">
          A cloud-hosted vault for the <Stoa />/<Ouro /> ecosystem. The Codex is
          your single instrument for managing every cryptographic asset on chain;
          Mnemosyne is where that Codex lives, syncs across devices, and reaches
          every Codex Consumer app you use.
        </p>

        <div className="lp-actions">
          <a href="/codex" className="lp-btn lp-btn--primary">
            Launch Codex
          </a>
          <a href="#codex" className="lp-btn lp-btn--ghost">
            What is the Codex?
          </a>
          <a href="#modes" className="lp-btn lp-btn--ghost">
            Pick your mode
          </a>
        </div>

        <p className="lp-center lp-sub lp-small lp-measure-3 lp-mt">
          Secure your vault with seed words in <strong>your own language</strong> —
          no fixed English wordlist, any glyph in the{" "}
          <a href="/docs/dalos-character-set.html">Dalos Character Set</a>. Memorize a
          phrase that actually means something to you.
        </p>

        {/* The three pillars */}
        <div className="lp-grid lp-grid--3 lp-mt">
          <div className="lp-card">
            <div className="lp-glyph">Ⅰ</div>
            <h3 className="lp-h3">Privacy by construction</h3>
            <p className="lp-sub lp-small">
              The operator cannot decrypt your Codex with anything it holds.
              Cryptographic impossibility for self-custody modes, documented
              operator-trust trade-offs for accessibility-first modes.
            </p>
          </div>
          <div className="lp-card">
            <div className="lp-glyph">Ⅱ</div>
            <h3 className="lp-h3">Permanence on opt-in</h3>
            <p className="lp-sub lp-small">
              Pay once to pin your encrypted Codex to Arweave. The <Stoa /> stores
              the pointer. Even if Mnemosyne disappears entirely, you recover with
              just your seed and a chain read.
            </p>
          </div>
          <div className="lp-card">
            <div className="lp-glyph">Ⅲ</div>
            <h3 className="lp-h3">Portability across consumers</h3>
            <p className="lp-sub lp-small">
              One Codex, many apps. OuronetUI, AncientHoldings, the upcoming
              Demiourgos Streaming Platform — every Codex Consumer reads the same
              Codex. Switch devices freely.
            </p>
          </div>
        </div>
      </div>
    ),
  },

  // ──────────────────────────── 2. THE CODEX ────────────────────────────
  {
    topicId: "codex",
    subLabel: "Seeds & Accounts",
    title: "The Codex — Seeds & Accounts",
    node: (
      <div className="lp-measure-6">
        <p className="lp-center lp-sub lp-measure-3 lp-mb">
          The Codex is the single entity that holds <em>everything</em>{" "}
          cryptographic you have on <Stoa /> and <Ouro />. One file. One vault.
          Encrypted on disk, decrypted only in your browser. Everything an account,
          key, or identity needs to be controlled lives here.
        </p>

        <div className="lp-grid lp-grid--2 lp-measure-5">
          <div className="lp-card lp-card--sm">
            <div className="lp-glyph lp-glyph--sm">①</div>
            <h3 className="lp-h3">Unlimited seed words</h3>
            <p className="lp-sub lp-small">
              Store as many seed sets as you need. <strong>Koala</strong> (24-word),{" "}
              <strong>Chainweaver</strong> (12-word), and{" "}
              <strong>Eckowallet</strong> seeds are all supported.
            </p>
          </div>
          <div className="lp-card lp-card--sm">
            <div className="lp-glyph lp-glyph--sm">②</div>
            <h3 className="lp-h3">
              Unlimited <Ouro /> accounts
            </h3>
            <p className="lp-sub lp-small">
              Standard accounts (<code>Ѻ.xxx</code>) and Smart accounts (
              <code>Σ.xxx</code>) alike. Mint as many as you need; the Codex tracks
              them all.
            </p>
          </div>
          <div className="lp-card lp-card--sm">
            <div className="lp-glyph lp-glyph--sm">③</div>
            <h3 className="lp-h3">
              Unlimited <Stoa /> keys + accounts
            </h3>
            <p className="lp-sub lp-small">
              Store any number of <Stoa /> public keys and their corresponding{" "}
              <code>k:</code> accounts. You can also <em>observe</em> any other
              named <Stoa /> account (<code>k:</code>, <code>c:</code>,{" "}
              <code>u:</code>, <code>w:</code>) for read-only viewing.
            </p>
          </div>
          <div className="lp-card lp-card--sm">
            <div className="lp-glyph lp-glyph--sm">④</div>
            <h3 className="lp-h3">Flexible key derivation</h3>
            <p className="lp-sub lp-small">
              Add keys to a seed word set continuously (positions 0, 1, 2, …) or
              jump straight to any specific position you need. Your seed sets are not
              fixed-shape — they grow as you do.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    topicId: "codex",
    subLabel: "Keys & Tools",
    title: "The Codex — Keys & Tools",
    node: (
      <div className="lp-measure-6">
        <div className="lp-grid lp-grid--2 lp-measure-5">
          <div className="lp-card lp-card--sm">
            <div className="lp-glyph lp-glyph--sm">⑤</div>
            <h3 className="lp-h3">Pure keys (no seed required)</h3>
            <p className="lp-sub lp-small">
              Store standalone Stoa keypairs that aren&apos;t derived from any seed
              phrase. The keypair IS the entity — useful for one-off accounts,
              ephemeral signers, and system keys like the CodexGuard.
            </p>
          </div>
          <div className="lp-card lp-card--sm">
            <div className="lp-glyph lp-glyph--sm">⑥</div>
            <h3 className="lp-h3">Address book</h3>
            <p className="lp-sub lp-small">
              As many <Ouro /> and <Stoa /> accounts as you want to remember —
              friends, business contacts, common destinations. Tagged, searchable,
              ready when you need them.
            </p>
          </div>
          <div className="lp-card lp-card--sm">
            <div className="lp-glyph lp-glyph--sm">⑦</div>
            <h3 className="lp-h3">Codex Consumer settings</h3>
            <p className="lp-sub lp-small">
              Each recognised Codex Consumer (OuronetUI, AncientHoldings, future
              apps) stores its own settings inside your Codex — interface
              preferences, node choices, feature flags. One Codex, many apps,
              consistent preferences everywhere.
            </p>
          </div>
          <div className="lp-card lp-card--sm">
            <div className="lp-glyph lp-glyph--sm">⑧</div>
            <h3 className="lp-h3">Your unified cryptographic instrument</h3>
            <p className="lp-sub lp-small">
              The Codex is the single entity holding every cryptographic asset you
              have on <Stoa />/<Ouro />. Architecturally, the same model could be
              extended to support any other seed derivation scheme and any other
              blockchain&apos;s address types — but for v0.1 the scope is <Stoa />/
              <Ouro />.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    topicId: "codex",
    subLabel: "Onboarding",
    title: "The Codex — Onboarding",
    node: (
      <div className="lp-measure-6">
        <p className="lp-center lp-sub lp-measure-3 lp-mb">
          Three paths into Mnemosyne, orthogonal to your mode choice. The wizard
          adapts.
        </p>

        <div className="lp-grid lp-grid--3 lp-mb">
          <div className="lp-card">
            <div className="lp-glyph">Α</div>
            <h3 className="lp-h3">A. New Codex</h3>
            <p className="lp-sub lp-small">
              You have nothing yet. The wizard generates everything from scratch —
              Codex Identity, CodexPrime Standard <Ouro /> Account, on-chain
              registration, the lot.
            </p>
          </div>
          <div className="lp-card">
            <div className="lp-glyph">Β</div>
            <h3 className="lp-h3">B. Import from browser</h3>
            <p className="lp-sub lp-small">
              You already have an OuronetUI Codex in your browser. The wizard reads
              it, adds the Mnemosyne-only pieces (Codex Identity, CodexGuard),
              uploads. The hard-cutoff migration preset uses this.
            </p>
          </div>
          <div className="lp-card">
            <div className="lp-glyph">Γ</div>
            <h3 className="lp-h3">C. Import from JSON</h3>
            <p className="lp-sub lp-small">
              You have a JSON backup of a Codex (OuronetUI export or Mnemosyne
              export). Upload, decrypt locally, re-encrypt under Mnemosyne, done.
            </p>
          </div>
        </div>

        <div className="lp-card lp-measure-4">
          <h4 className="lp-h4">The three wizard primitives</h4>
          <p className="lp-sub lp-small">
            Every Codex creation walks you through these three choices. Each has an
            &quot;I-don&apos;t-care-just-do-it&quot; autopilot variant and a
            &quot;I-want-to-pick-this-myself&quot; custom variant.
          </p>
          <ol className="lp-small">
            <li>
              <strong>1. Codex Identity seed</strong> — generates your Apollo address
              (<code>₱.STANDARD:Π.SMART</code>). Autopilot: 24 random Dalos words.
              Custom: bring your own words, bitstring, bitmap, base-10 or base-49
              scalar.
            </li>
            <li>
              <strong>
                2. CodexPrime Standard <Ouro /> Account seed
              </strong>{" "}
              — generates your primary account. Autopilot: reuse Primitive 1&apos;s
              seed via the Dalos curve. Custom: provide a separate seed.
            </li>
            <li>
              <strong>3. CodexGuard + Duo Pure Prime</strong> — generates the three
              Stoa keys (1 for on-chain operations, 2 backing your CodexPrime
              account). Autopilot: pure-mode random generation. Custom: derive from a
              Koala Seed (positions #0, #1, #2 marked undeletable).
            </li>
          </ol>
        </div>
      </div>
    ),
  },

  // ──────────────────────────── 3. FOUR MODES ────────────────────────────
  {
    topicId: "modes",
    subLabel: "",
    title: "Four Modes",
    node: (
      <div className="lp-measure-6">
        <p className="lp-center lp-sub lp-measure-3 lp-mb">
          The ladder runs from maximum sovereignty to maximum convenience.{" "}
          <strong>Mode 1 is the secure base everyone gets</strong> — login proves you{" "}
          <em>possess a key</em>, never a server-side password. Each mode above only{" "}
          <em>adds</em> a more familiar (and weaker) door; it never removes a strong
          one. Switch modes later without re-encrypting the Codex. v0.1 ships Modes
          1–3; Mode 4 (phone/SMS) is deferred to v0.2.
        </p>

        <div className="lp-grid lp-grid--2">
          {/* Mode 1 */}
          <div className="lp-card mode-card">
            <div className="mode-head">
              <div className="mode-badge">Ⅰ</div>
              <div>
                <h3 className="lp-h3">Sovereign</h3>
                <p className="lp-muted lp-small">
                  The secure base — key possession, zero personal information
                </p>
              </div>
            </div>
            <p className="lp-sub lp-small mode-card-description">
              No username, password, email, or phone. The only ways in are things you{" "}
              <em>possess</em>: a device passkey for daily login, your Standard key to
              set up a new device, and either seed to recover. Two independent seeds,
              so losing one is survivable.
            </p>
            <p className="lp-xs mode-card-tradeoff">
              <span className="pill pill-good">strict self-custody</span> · for
              everyone
            </p>
          </div>

          {/* Mode 2 */}
          <div className="lp-card mode-card">
            <div className="mode-head">
              <div className="mode-badge">Ⅱ</div>
              <div>
                <h3 className="lp-h3">+Password</h3>
                <p className="lp-muted lp-small">A familiar web2 door, opt-in</p>
              </div>
            </div>
            <p className="lp-sub lp-small mode-card-description">
              Adds the username + password login mainstream users expect — a{" "}
              <strong>convenience door, never a recovery root</strong>, and honestly
              the <em>weakest</em> door in your Codex. All of Mode 1&apos;s strong
              doors stay; forget the password and you reset it with a seed, never via
              the operator.
            </p>
            <p className="lp-xs mode-card-tradeoff">
              <span className="pill pill-good">strict self-custody</span> · web2
              familiarity
            </p>
          </div>

          {/* Mode 3 */}
          <div className="lp-card mode-card">
            <div className="mode-head">
              <div className="mode-badge">Ⅲ</div>
              <div>
                <h3 className="lp-h3">+Email</h3>
                <p className="lp-muted lp-small">Recover without your seed</p>
              </div>
            </div>
            <p className="lp-sub lp-small mode-card-description">
              Adds an email-based recovery path. At signup, Mnemosyne emails you a
              one-shot Email Recovery Secret; &quot;Forgot access&quot; then works
              without exposing anything the operator can decrypt. Email is for
              recovery, not login.
            </p>
            <p className="lp-xs mode-card-tradeoff">
              <span className="pill">hybrid (user-held paths)</span> · seed-free
              recovery
            </p>
          </div>

          {/* Mode 4 */}
          <div className="lp-card mode-card" style={{ opacity: 0.7 }}>
            <div className="mode-head">
              <div className="mode-badge">Ⅳ</div>
              <div>
                <h3 className="lp-h3">
                  +Phone{" "}
                  <span
                    className="pill pill-warn"
                    style={{ verticalAlign: "middle" }}
                  >
                    v0.2
                  </span>
                </h3>
                <p className="lp-muted lp-small">
                  Grandma-tier accessibility — deferred to v0.2
                </p>
              </div>
            </div>
            <p className="lp-sub lp-small mode-card-description">
              <strong>Not in v0.1.</strong> The planned addition: phone identity, an
              SMS Recovery Secret, and personal-facts recovery for the most accessible
              onboarding. Deferred to v0.2 — running an SMS stack is operationally
              heavy, so it ships once the streaming platform genuinely needs it.
            </p>
            <p className="lp-xs mode-card-tradeoff">
              <span className="pill pill-warn">hybrid, accessibility-leaning</span> ·
              non-technical users
            </p>
          </div>
        </div>

        <p className="lp-center lp-muted lp-small lp-measure-3 lp-mt">
          Every mode keeps all of Mode 1&apos;s strong doors (passkey + seeds) and
          only adds weaker, more convenient alternatives — never removing one. Your
          two seeds are always recovery roots and can never be removed; the encrypted
          Codex blob is byte-identical across all your mode changes.
        </p>
      </div>
    ),
  },

  // ──────────────────────────── 4. STORAGE ────────────────────────────
  {
    topicId: "storage",
    subLabel: "Three-layer architecture",
    title: "Three-layer storage architecture",
    node: (
      <div className="lp-measure-6">
        <p className="lp-center lp-sub lp-measure-3 lp-mb">
          Mnemosyne separates the storage layer from the trust anchor. Your encrypted
          Codex lives in the database (always) and optionally on Arweave (opt-in,
          paid). The <Stoa /> stores the immutable identity entry plus a pointer to
          your latest Arweave backup.
        </p>

        <div className="lp-measure-4">
          <div className="layer-block">
            <div className="layer-head">
              <span className="pill">Layer 3</span>
              <h3 className="lp-h3" style={{ margin: 0 }}>
                <Stoa /> — immutable trust anchor
              </h3>
            </div>
            <p className="lp-sub lp-small">
              The <code>ouronet-ns.CODEX</code> Pact module on <Stoa />. Holds your
              Codex Identity registration (immutable), your CodexGuard (rotatable),
              and pointers to all your Arweave backups (append-only history).
            </p>
            <p className="lp-muted lp-xs">
              Cost: tiny gas per pointer update. Trust anchor: CodexGuard signs all
              mutations. Censorship-resistant: any Mnemosyne-compatible client can
              read.
            </p>
          </div>

          <div className="layer-block">
            <div className="layer-head">
              <span className="pill">Layer 2</span>
              <h3 className="lp-h3" style={{ margin: 0 }}>
                Arweave — optional permanent backup
              </h3>
            </div>
            <p className="lp-sub lp-small">
              Per-Codex encrypted blob, paid once via Bundlr/Irys, stored forever.
              The <Stoa /> pointer tells the world which Arweave tx-id is canonically
              yours.
            </p>
            <p className="lp-muted lp-xs">
              Cost: one-time AR payment per upload, no recurring. Encryption: same
              Codex Key that wraps L1. Use case: disaster recovery if Mnemosyne ever
              disappears.
            </p>
          </div>

          <div className="layer-block">
            <div className="layer-head">
              <span className="pill">Layer 1</span>
              <h3 className="lp-h3" style={{ margin: 0 }}>
                Mnemosyne database — hot path
              </h3>
            </div>
            <p className="lp-sub lp-small">
              Live encrypted blob, mutated on every Codex change. Server-side
              PostgreSQL. Single concatenated format: wraps + encrypted Codex in one
              binary file.
            </p>
            <p className="lp-muted lp-xs">
              Cost: Mnemosyne operational. Deletable on user request (the European
              General Data Protection Regulation&apos;s &quot;right to be
              forgotten&quot; actually works here).
            </p>
          </div>
        </div>

        <p className="lp-center lp-muted lp-xs lp-measure-3 lp-mt">
          Why three layers? L1 alone is a standard cloud service (fast, but its
          operator dying means data lost); L2 adds a backup; only L3&apos;s chain
          pointer proves <em>which</em> Arweave blob is canonically yours.{" "}
          <a href="/docs">Full storage architecture →</a>
        </p>
      </div>
    ),
  },

  // ──────────────────────────── 5. IDENTITY ────────────────────────────
  {
    topicId: "identity",
    subLabel: "Standard & Smart keys",
    title: "Codex Identity — Standard & Smart keys",
    node: (
      <div className="lp-measure-6">
        <p className="lp-center lp-sub lp-measure-3 lp-mb">
          Every Codex has a public identity on the <Stoa />. It&apos;s a{" "}
          <em>pair</em> of Apollo-curve keys — a Standard key for daily operations
          and a Smart key that serves as both a cold guardian and a second recovery
          root. Each comes from its own independent seed.
        </p>

        <div className="lp-grid lp-grid--2 lp-mb">
          <div className="lp-card">
            <h3 className="lp-h3">Standard key — the daily key</h3>
            <ul className="lp-small">
              <li>• From Seed-A; wraps your Codex Key (a recovery root)</li>
              <li>
                • Used to bootstrap a new device, then a passkey takes over for daily
                login
              </li>
              <li>• Authorizes daily-use operations</li>
              <li>• Treat as the burnable daily key — Smart is the deeper backstop</li>
            </ul>
          </div>
          <div className="lp-card">
            <h3 className="lp-h3">Smart key — the &quot;Guardian&quot;</h3>
            <ul className="lp-small">
              <li>• From Seed-B; kept cold (printed, vaulted, cold storage)</li>
              <li>
                • A <strong>second recovery root</strong> — either seed alone recovers
                the Codex
              </li>
              <li>
                • Required <em>together with Standard</em> to enroll a new device or
                cosign sensitive ops
              </li>
              <li>
                • So losing one seed is survivable; one stolen key can&apos;t plant a
                backdoor device
              </li>
            </ul>
          </div>
        </div>

        <div className="lp-card lp-measure-4">
          <h4 className="lp-h4">What requires Smart cosign?</h4>
          <div className="lp-grid lp-grid--2 lp-small">
            <div>
              <p>
                <strong>One factor authorizes (unlock + daily ops):</strong>
              </p>
              <p className="lp-muted lp-xs">
                any passkey · or Standard key · or Smart key
              </p>
              <ul>
                <li>• Unlock + view Codex contents</li>
                <li>• Add/remove address book entries</li>
                <li>• Add/remove regular accounts and seeds</li>
                <li>• Rotate an existing Mode 2 password (change its value)</li>
                <li>• Update Arweave backup pointer</li>
              </ul>
            </div>
            <div>
              <p>
                <strong>Standard + Smart cosign required:</strong>
              </p>
              <p className="lp-muted lp-xs">
                anything that expands the trust surface
              </p>
              <ul>
                <li>
                  • <strong>Enroll a new device</strong> (add a passkey)
                </li>
                <li>
                  • <strong>Add a new CK door</strong> (incl. the Mode 2 password)
                </li>
                <li>• Rotate the CodexGuard / Duo Pure Prime keys</li>
                <li>• Add/remove identity modes</li>
                <li>• Claim or release a StoicTag</li>
                <li>• Codex-level destructive operations</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    ),
  },
  {
    topicId: "identity",
    subLabel: "Dual-Apollo details",
    title: "Codex Identity — Dual-Apollo details",
    node: (
      <div className="lp-measure-6">
        {/* Apollo curve sidebar */}
        <div className="sidebar lp-measure-4">
          <div className="sidebar-title">
            Our own cryptography — the Apollo Elliptic Curve
          </div>
          <p className="lp-sub lp-small">
            The Codex Identity is built on the <strong>Apollo Elliptic Curve</strong>{" "}
            — our own cryptographic curve, designed and implemented for the <Stoa />/
            <Ouro /> ecosystem and shipped as part of the{" "}
            <code>@stoachain/dalos-crypto</code> package. Apollo gives us the
            derivation properties we need (deterministic keypairs from arbitrary
            entropy, Schnorr signatures, address-format glyphs) without depending on
            any external curve library.
          </p>
          <p className="lp-sub lp-small">
            Apollo addresses use distinct prefix glyphs: <code>₱.</code> for
            Standard, <code>Π.</code> for Smart. A complete Codex Identity therefore
            reads <code>₱.STANDARD:Π.SMART</code> — two pubkeys, one identifier,
            mirroring <Stoa />&apos;s own Standard/Smart account model.
          </p>
          <p className="lp-muted lp-xs">
            Apollo signatures are verified off-chain (in Mnemosyne&apos;s web app and
            backend). On-chain signing uses the Stoa-native ED25519 curve via the
            CodexGuard key. The two curves serve different layers and don&apos;t
            compete.
          </p>
          <p className="lp-xs">
            Deep dive:{" "}
            <a href="/docs/apollo-curve.html">The Apollo Elliptic Curve →</a>
            {" · "}
            <a href="/docs/dalos-character-set.html">
              The Dalos Character Set →
            </a>
          </p>
        </div>

        {/* Entropy comparison sidebar */}
        <div className="sidebar lp-measure-4">
          <div className="sidebar-title">
            The number of possible Codex Identities
          </div>
          <p className="lp-sub lp-small">
            With 2048 bits of entropy per Codex Identity (1024 per Apollo half), the
            total number of distinct possible Codex Identities is{" "}
            <code>
              2<sup>2048</sup>
            </code>{" "}
            — roughly{" "}
            <code>
              10<sup>616</sup>
            </code>
            .
          </p>
          <p className="lp-sub lp-small">
            For context: the observable universe contains an estimated{" "}
            <code>
              10<sup>80</sup>
            </code>{" "}
            atoms. The number of possible Codex Identities exceeds the number of
            atoms in the observable universe by a factor of{" "}
            <code>
              10<sup>536</sup>
            </code>
            .
          </p>
          <p className="lp-sub lp-small">
            Put differently: if every atom in the observable universe were itself an
            entire observable universe, and every atom in <em>those</em> universes
            were themselves observable universes, and you repeated this nesting six
            more times — the total atom count would still fall vastly short of the
            Codex Identity space.
          </p>
          <p className="lp-muted lp-xs">
            Random collision between two Codex Identities is not &quot;extremely
            improbable&quot; — it is unphysical. The space is too large for the
            universe to fit examples of, let alone two that match.
          </p>
        </div>

        <p className="lp-center lp-muted lp-xs lp-measure-3 lp-mt">
          Apollo signatures verify off-chain in Mnemosyne&apos;s app and backend,
          enabling cross-domain identity proofs (sign-in-with-Codex, session tokens,
          StoicTag messaging) without chain calls.{" "}
          <a href="/docs/apollo-curve.html">Off-chain Schnorr verification →</a>
        </p>
      </div>
    ),
  },

  // ──────────────────────────── 6. STOICTAGS ────────────────────────────
  {
    topicId: "stoictags",
    subLabel: "StoicTags",
    title: "StoicTags — human-readable names",
    node: (
      <div className="lp-measure-5">
        <p className="lp-center lp-sub lp-measure-3 lp-mb">
          Optional convenience: tie a name like <code>§bytales</code> to one of your{" "}
          <Ouro /> Accounts. Lives on the <Stoa />. Codex-agnostic — works without
          Mnemosyne entirely. Anyone can register; cost-gated by a STOA fee, no
          operator gatekeeping.
        </p>

        <div className="lp-grid lp-grid--3 lp-measure-4 lp-mb">
          <div className="lp-card lp-card--sm lp-center">
            <div className="lp-glyph lp-glyph--sm">§</div>
            <p className="lp-sub lp-small">
              <strong>
                One per <Ouro /> Account
              </strong>{" "}
              — strict bijection enforced on chain
            </p>
          </div>
          <div className="lp-card lp-card--sm lp-center">
            <div className="lp-glyph lp-glyph--sm">𝔸</div>
            <p className="lp-sub lp-small">
              <strong>Any Dalos glyph</strong>, 3–256 in length — your name in your
              language
            </p>
          </div>
          <div className="lp-card lp-card--sm lp-center">
            <div className="lp-glyph lp-glyph--sm">↻</div>
            <p className="lp-sub lp-small">
              <strong>Releasable</strong> by the current account owner — frees the
              name for re-registration
            </p>
          </div>
        </div>

        <div className="lp-center">
          <a href="/docs/stoictags.html" className="lp-btn lp-btn--outline">
            Read the full StoicTags documentation →
          </a>
          <p className="lp-xs lp-muted lp-mt">
            Three-layer stack (StoicTag → <Ouro /> Account → Payment Key) · Character
            set details · Typing <code>§</code> per OS · Pact module reference
          </p>
        </div>
      </div>
    ),
  },

  // ──────────────────────────── 7. SECURITY ────────────────────────────
  {
    topicId: "security",
    subLabel: "Guarantees",
    title: "Security & custody — Guarantees",
    node: (
      <div className="lp-measure-6">
        <p className="lp-center lp-sub lp-measure-3 lp-mb">
          Cryptographic guarantees are real. Operational risks are standard for the
          zero-knowledge cloud-storage pattern and accepted as part of the trade-off.
        </p>

        <div className="scroll-x lp-measure-5 lp-card lp-card--xs">
          <table>
            <thead>
              <tr>
                <th>Action</th>
                <th>Self-custody modes (1, 2)</th>
                <th>Hybrid modes (3, 4)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Decrypt your Codex from server data alone</td>
                <td>
                  <span className="pill pill-good">Impossible</span>
                </td>
                <td>
                  <span className="pill pill-good">Impossible</span> (Modes 1–3) /{" "}
                  <span className="pill pill-warn">Possible if facts weak</span>{" "}
                  (Mode 4)
                </td>
              </tr>
              <tr>
                <td>Initiate a password reset on your behalf</td>
                <td>
                  <span className="pill pill-good">Impossible</span> — would require
                  forging a Schnorr signature
                </td>
                <td>
                  <span className="pill pill-warn">Possible</span> if operator
                  controls email or SMS channel
                </td>
              </tr>
              <tr>
                <td>Tamper with Codex contents undetectably</td>
                <td>
                  <span className="pill">Detected on next decrypt</span>{" "}
                  (authenticated encryption)
                </td>
                <td>Same</td>
              </tr>
              <tr>
                <td>Refuse to serve you (denial of service)</td>
                <td>
                  <span className="pill pill-warn">Possible</span> — but you have your
                  seed; self-host or migrate
                </td>
                <td>Same</td>
              </tr>
              <tr>
                <td>Brute-force your password from the verifier</td>
                <td>
                  <span className="pill pill-good">N/A in Mode 1</span> (no password)
                  · <span className="pill pill-warn">Theoretically</span> in Mode 2 —
                  Argon2id makes it slow for weak passwords, infeasible for strong
                </td>
                <td>Same as Mode 2</td>
              </tr>
              <tr>
                <td>See which Codices exist</td>
                <td>
                  <span className="pill pill-warn">Yes</span> — metadata isn&apos;t
                  encrypted, only payload
                </td>
                <td>Same</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="lp-mt lp-grid lp-grid--3">
          <div className="lp-card">
            <h4 className="lp-h4">AES-256-GCM</h4>
            <p className="lp-sub lp-small">
              Authenticated encryption for the Codex blob. Standard. Unbreakable in
              any relevant time horizon without the Codex Key.
            </p>
          </div>
          <div className="lp-card">
            <h4 className="lp-h4">Argon2id</h4>
            <p className="lp-sub lp-small">
              Modern password-hashing function. Tunable to be slow and
              memory-expensive. Winner of the 2015 Password Hashing Competition.
            </p>
          </div>
          <div className="lp-card">
            <h4 className="lp-h4">Apollo + Schnorr</h4>
            <p className="lp-sub lp-small">
              Our own elliptic curve with Schnorr signatures, verified off-chain. Two
              halves (Standard + Smart) enable tiered authorization without needing
              on-chain Apollo verification.
            </p>
          </div>
        </div>
      </div>
    ),
  },
  {
    topicId: "security",
    subLabel: "Roadmap",
    title: "Security & custody — Status & roadmap",
    node: (
      <div className="lp-measure-6">
        <p className="lp-center lp-sub lp-measure-3 lp-mb">
          Mnemosyne is in the design-locked phase. Implementation begins after v0.3.0
          of the <code>@stoachain/ouronet-codex</code> package ships.
        </p>

        <div className="roadmap-list lp-measure-4">
          <div className="lp-card lp-card--xs roadmap-row">
            <span className="pill pill-good">in progress</span>
            <div>
              <strong>Phase 0 — Design lock</strong>
              <span className="lp-muted lp-small">
                {" "}
                • 4 modes, 3-layer storage, double-Apollo identity, StoicTags,{" "}
                <code>ouronet-ns.CODEX</code> Pact module
              </span>
            </div>
          </div>
          <div className="lp-card lp-card--xs roadmap-row">
            <span className="pill">next</span>
            <div>
              <strong>Phase 1 — Codex package v0.3.0</strong>
              <span className="lp-muted lp-small">
                {" "}
                • IPrimePureKey, IStoicTag, Guardians, Arweave actions, schema
                migration
              </span>
            </div>
          </div>
          <div className="lp-card lp-card--xs roadmap-row">
            <span className="pill">queued</span>
            <div>
              <strong>Phase 2 — Mnemosyne v0.1 scaffold</strong>
              <span className="lp-muted lp-small">
                {" "}
                • backend, frontend, auth, Codex CRUD
              </span>
            </div>
          </div>
          <div className="lp-card lp-card--xs roadmap-row">
            <span className="pill">queued</span>
            <div>
              <strong>Phase 3 — OuronetUI integration</strong>
              <span className="lp-muted lp-small">
                {" "}
                • hard-cutoff migration from devwallet.ouronetwork.io to
                wallet.ouro.network
              </span>
            </div>
          </div>
          <div className="lp-card lp-card--xs roadmap-row">
            <span className="pill">later</span>
            <div>
              <strong>
                Phase 4+ — Demiourgos Streaming Platform integration, Arweave
                snapshots, on-chain pointers
              </strong>
            </div>
          </div>
        </div>
      </div>
    ),
  },
];

/** The first page index for each topic — the target of its Tier-1 button. */
const TOPIC_FIRST_PAGE: Record<string, number> = TOPICS.reduce(
  (acc, t) => {
    acc[t.id] = PAGES.findIndex((p) => p.topicId === t.id);
    return acc;
  },
  {} as Record<string, number>,
);

const WHEEL_THRESHOLD = 10;
// A wheel gesture keeps emitting events (trackpad momentum lasts ~1s); only the FIRST
// event after a pause this long counts as a new gesture, so one flick = one flip.
const GESTURE_GAP_MS = 180;
const SWIPE_THRESHOLD = 40;

export default function LandingPage(): ReactElement {
  const [pageIndex, setPageIndex] = useState(0);
  const stageRef = useRef<HTMLDivElement>(null);
  const lastWheel = useRef(0);

  const goTo = useCallback((i: number): void => {
    setPageIndex(Math.max(0, Math.min(PAGES.length - 1, i)));
  }, []);
  const next = useCallback((): void => {
    setPageIndex((p) => Math.min(PAGES.length - 1, p + 1));
  }, []);
  const prev = useCallback((): void => {
    setPageIndex((p) => Math.max(0, p - 1));
  }, []);

  // Hard page-turn input: one wheel gesture / one key / one swipe = exactly one page.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const onWheel = (e: WheelEvent): void => {
      const now = Date.now();
      const gap = now - lastWheel.current;
      lastWheel.current = now;
      // Let the active page scroll its own overflow FIRST (a page taller than the
      // stage on a short viewport). Only when it is at the scroll edge in the wheel's
      // direction does the wheel turn the deck — so overflow content is never trapped.
      const active = stage.querySelector<HTMLElement>('.lp-page[aria-hidden="false"]');
      if (active) {
        const atTop = active.scrollTop <= 0;
        const atBottom =
          active.scrollTop + active.clientHeight >= active.scrollHeight - 1;
        if ((e.deltaY > 0 && !atBottom) || (e.deltaY < 0 && !atTop)) return;
      }
      e.preventDefault();
      // Same (momentum) gesture → no further flip until the flick actually ends.
      if (gap < GESTURE_GAP_MS) return;
      if (e.deltaY > WHEEL_THRESHOLD) next();
      else if (e.deltaY < -WHEEL_THRESHOLD) prev();
    };

    // In-content hash CTAs (e.g. the hero's "What is the Codex?" → #codex) turn the
    // deck to that topic — the deck has no scroll anchors, so a raw #hash is inert.
    const onClick = (e: MouseEvent): void => {
      const anchor = (e.target as HTMLElement | null)?.closest?.('a[href^="#"]');
      const id = anchor?.getAttribute("href")?.slice(1) ?? "";
      if (id && Object.prototype.hasOwnProperty.call(TOPIC_FIRST_PAGE, id)) {
        e.preventDefault();
        goTo(TOPIC_FIRST_PAGE[id]);
      }
    };

    const onKeyDown = (e: KeyboardEvent): void => {
      switch (e.key) {
        case "ArrowDown":
        case "PageDown":
        case " ":
          e.preventDefault();
          next();
          break;
        case "ArrowUp":
        case "PageUp":
          e.preventDefault();
          prev();
          break;
        case "Home":
          e.preventDefault();
          goTo(0);
          break;
        case "End":
          e.preventDefault();
          goTo(PAGES.length - 1);
          break;
        default:
          break;
      }
    };

    let touchStartY = 0;
    const onTouchStart = (e: TouchEvent): void => {
      touchStartY = e.touches[0]?.clientY ?? 0;
    };
    const onTouchEnd = (e: TouchEvent): void => {
      const endY = e.changedTouches[0]?.clientY ?? touchStartY;
      const dy = endY - touchStartY;
      if (Math.abs(dy) > SWIPE_THRESHOLD) {
        if (dy < 0) next();
        else prev();
      }
    };

    stage.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("keydown", onKeyDown);
    stage.addEventListener("touchstart", onTouchStart, { passive: true });
    stage.addEventListener("touchend", onTouchEnd, { passive: true });
    stage.addEventListener("click", onClick);
    return () => {
      stage.removeEventListener("wheel", onWheel);
      window.removeEventListener("keydown", onKeyDown);
      stage.removeEventListener("touchstart", onTouchStart);
      stage.removeEventListener("touchend", onTouchEnd);
      stage.removeEventListener("click", onClick);
    };
  }, [next, prev, goTo]);

  // On navigation, show the newly-active page from its TOP — so a topic heading always
  // sits at the top of the stage, even if that page had been scrolled before.
  useEffect(() => {
    const active = stageRef.current?.querySelector<HTMLElement>(
      '.lp-page[aria-hidden="false"]',
    );
    if (active) active.scrollTop = 0;
  }, [pageIndex]);

  const currentTopic = PAGES[pageIndex].topicId;

  // Tier-1: the seven topics jump to their first page; Documentation is an external link.
  const sections = useMemo(
    () => [
      ...TOPICS.map((t) => ({
        id: t.id,
        label: t.label,
        onSelect: () => goTo(TOPIC_FIRST_PAGE[t.id]),
        active: currentTopic === t.id,
      })),
      { id: "docs", label: "Documentation", href: "/docs" },
    ],
    [currentTopic, goTo],
  );

  // Tier-2: the current topic's pages (only when the topic spans more than one page).
  const subviews = useMemo(() => {
    const topicPages = PAGES.map((p, i) => ({ page: p, index: i })).filter(
      ({ page }) => page.topicId === currentTopic,
    );
    if (topicPages.length < 2) return [];
    return topicPages.map(({ page, index }) => ({
      id: `${page.topicId}-${index}`,
      label: page.subLabel,
      onSelect: () => goTo(index),
      active: index === pageIndex,
    }));
  }, [currentTopic, pageIndex, goTo]);

  return (
    <div className="lp">
      <PantheonHeader
        variant="full"
        version={pkg.version}
        sections={sections}
        subviews={subviews}
        memorableAction={{ label: "Launch Codex ↗", href: "/codex" }}
      />

      <div className="lp-stage" ref={stageRef}>
        <div
          className="lp-pages"
          style={{ transform: `translateY(-${pageIndex * 100}%)` }}
        >
          {PAGES.map((p, i) => {
            const isActive = i === pageIndex;
            return (
              <section
                key={`${p.topicId}-${i}`}
                className="lp-page"
                aria-hidden={!isActive}
                inert={!isActive}
              >
                <div className="lp-page-inner">
                  <h2 className="lp-page-title">{p.title}</h2>
                  {p.node}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <footer className="lp-foot">
        <span>
          Part of the <Stoa />/<Ouro /> ecosystem · Built by{" "}
          <a href="https://ancientholdings.eu">AncientHoldings GmbH</a>
        </span>
        <a href="https://github.com/orgs/OuroborosNetwork/repositories">
          GitHub — OuroborosNetwork
        </a>
        <a href="https://github.com/OuroborosNetwork/Mnemosyne">
          Mnemosyne repository
        </a>
        <span className="lp-muted">codex.ancientholdings.eu · design-lock 2026-05-28</span>
      </footer>
    </div>
  );
}
