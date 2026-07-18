"use client";

import type { ReactElement } from "react";

import pkg from "@/package.json";
import { PantheonHeader } from "@/components/PantheonHeader";

import "./landing.css";

// The marketing landing, ported HTML → JSX from the pre-migration public/index.html.
// It renders the ONE shared PantheonHeader (full variant) instead of the old inline
// nav + two inline <script> hydrations (/api/me identity swap + iframe CTA rewriter),
// which PantheonHeader/useMe now own. The Tier-1 section buttons are anchor links
// (`href:"#<id>"`) that native-scroll to the matching in-page section ids below.
const SECTIONS = [
  { id: "what", label: "What it is", href: "#what" },
  { id: "codex", label: "The Codex", href: "#codex" },
  { id: "modes", label: "Four modes", href: "#modes" },
  { id: "storage", label: "Storage", href: "#storage" },
  { id: "identity", label: "Identity", href: "#identity" },
  { id: "stoictags", label: "StoicTags", href: "#stoictags" },
  { id: "security", label: "Security", href: "#security" },
];

/** Inline branded mentions — styled by `.lp .stoachain/.ouronet` (the ™ is a ::after). */
function Stoa(): ReactElement {
  return <span className="stoachain">StoaChain</span>;
}
function Ouro(): ReactElement {
  return <span className="ouronet">Ouronet</span>;
}

export default function LandingPage(): ReactElement {
  return (
    <div className="lp">
      <PantheonHeader
        variant="full"
        version={pkg.version}
        sections={SECTIONS}
        memorableAction={{ label: "Launch Codex ↗", href: "/codex" }}
      />

      {/* ──────────────────── HERO ──────────────────── */}
      <section id="top" className="lp-section lp-section--hero">
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

          <p className="lp-small lp-muted lp-mt">
            Mnemosyne — Greek goddess of memory, mother of the nine Muses.
          </p>

          {/* The mother-tongue / human-language pitch */}
          <div className="pitch-box lp-measure-3">
            <p className="lp-sub">
              Secure your cryptographic vault with seed words composed in{" "}
              <strong>your own language</strong> — your mother tongue, your dialect,
              your private vocabulary. The first crypto system that doesn&apos;t force
              you to memorize words from someone else&apos;s dictionary.
            </p>
            <p className="lp-sub lp-small">
              No fixed English wordlist. No 2048 prescribed nouns. Compose your seed
              from any glyph in any writing system — Latin, Cyrillic, Greek,
              diacritics, mathematical symbols, anything that lives in the{" "}
              <a href="/docs/dalos-character-set.html">Dalos Character Set</a>.
              Memorize a phrase that actually means something to you. Keep your vault
              in your head.
            </p>
            <p className="lp-small">
              <a href="/docs/dalos-character-set.html">
                <strong>How free-form seed words work →</strong>
              </a>
            </p>
          </div>
        </div>
      </section>

      <div className="lp-divider"></div>

      {/* ──────────────────── WHAT IT IS ──────────────────── */}
      <section id="what" className="lp-section">
        <div className="lp-measure-6">
          <h2 className="lp-h2 lp-center">What Mnemosyne is</h2>
          <p className="lp-center lp-sub lp-measure-3">
            Mnemosyne is a Software-as-a-Service platform (a cloud-hosted service you
            reach through a web browser) that stores your Codex encrypted-at-rest and
            serves it to Codex Consumer apps under a unified credential.
          </p>
          <p className="lp-center lp-sub lp-measure-3 lp-mb">
            Architecturally, Mnemosyne converges on the same zero-knowledge
            cloud-storage pattern that Bitwarden landed on for password management —
            encrypted blob server-side, decryption keys never visible to the operator,
            multi-wrap envelope for credential rotation. Different problem, same shape
            — and arriving there independently is reassuring: the design space has a
            clean local optimum and this is it.
          </p>

          <div className="lp-grid lp-grid--3 lp-mb">
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

          {/* Bidirectional sync explanation */}
          <div className="sidebar lp-measure-4">
            <div className="sidebar-title">
              How Mnemosyne talks to Codex Consumers
            </div>
            <p className="lp-sub lp-small">
              You can manage your Codex directly through Mnemosyne (add seed words,
              mint accounts, store keys, edit your address book) <strong>or</strong>{" "}
              through any Codex Consumer app that uses your Codex. The two stay in
              sync, but in different directions:
            </p>
            <ul className="lp-small">
              <li>
                <strong>Mnemosyne → Consumers:</strong> modifications you make here
                appear <em>automatically</em> on every Codex Consumer using your
                Codex. No upload prompt — the changes are already there the next time
                the consumer reads.
              </li>
              <li>
                <strong>Consumers → Mnemosyne:</strong> modifications you make on a
                Codex Consumer (e.g. OuronetUI) cause that app&apos;s interface to
                prompt you: &quot;upload your modified Codex to Mnemosyne.&quot; You
                confirm; the changes propagate.
              </li>
            </ul>
            <p className="lp-muted lp-xs">
              This asymmetry is deliberate. Mnemosyne is the authoritative store, so
              pulls from it are trusted. Pushes from consumers are user-confirmed
              because consumers run in less-trusted environments (browser extensions,
              partner apps, third-party tools).
            </p>
          </div>

          <h3 className="lp-h3 lp-center lp-mt">What Mnemosyne is NOT</h3>
          <div className="lp-grid lp-grid--2 lp-measure-4">
            <div className="lp-card lp-card--xs">
              <p className="lp-sub lp-small">
                <span className="pill pill-warn">Not</span> a decentralized protocol
                — v0.1 is a centralized Software-as-a-Service. Decentralization
                happens in layers (see <a href="#storage">Storage</a>).
              </p>
            </div>
            <div className="lp-card lp-card--xs">
              <p className="lp-sub lp-small">
                <span className="pill pill-warn">Not</span> a custodial wallet in the
                regulatory sense. The cryptographic design makes it{" "}
                <em>technically</em> non-custodial.
              </p>
            </div>
            <div className="lp-card lp-card--xs">
              <p className="lp-sub lp-small">
                <span className="pill pill-warn">Not</span> a replacement for{" "}
                <code>@stoachain/ouronet-codex</code>. It&apos;s a new adapter for the
                existing package.
              </p>
            </div>
            <div className="lp-card lp-card--xs">
              <p className="lp-sub lp-small">
                <span className="pill pill-warn">Not</span> an identity provider for
                non-Codex purposes at v0.1. Single sign-on flows and broader identity
                uses are future possibilities.
              </p>
            </div>
          </div>
        </div>
      </section>

      <div className="lp-divider"></div>

      {/* ──────────────────── WHAT IS THE CODEX ──────────────────── */}
      <section id="codex" className="lp-section lp-section--alt">
        <div className="lp-measure-6">
          <h2 className="lp-h2 lp-center">What is the Codex?</h2>
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
      </section>

      <div className="lp-divider"></div>

      {/* ──────────────────── FOUR MODES ──────────────────── */}
      <section id="modes" className="lp-section">
        <div className="lp-measure-6">
          <h2 className="lp-h2 lp-center">The identity modes</h2>
          <p className="lp-center lp-sub lp-measure-3">
            The ladder runs from maximum sovereignty to maximum convenience.{" "}
            <strong>Mode 1 is the secure base everyone gets</strong> — login is proof
            you <em>possess a key</em>, never a server-side password. Each mode above
            it only <em>adds</em> a more familiar (and weaker) door on top; it never
            removes a strong one. You can never end up less secure than Mode 1. Switch
            modes later without re-encrypting the Codex.
          </p>
          <p className="lp-center lp-muted lp-small lp-measure-3 lp-mb">
            v0.1 ships Modes 1–3. Mode 4 (phone/SMS) is deferred to v0.2.
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
                No username, no password, no email, no phone. The only ways in are
                things you <em>possess</em>: a <strong>device passkey</strong>{" "}
                (fingerprint / PIN / security key) for daily login, your{" "}
                <strong>Standard key</strong> to set up a new device, and{" "}
                <strong>either seed</strong> to recover. Two independent seeds — a
                daily key and a cold guardian key — so losing one is survivable. Adding
                a new device needs <em>both</em> keys, so a single stolen key
                can&apos;t plant a standing backdoor.
              </p>
              <table className="mode-card-table lp-xs">
                <tbody>
                  <tr>
                    <th>Login</th>
                    <td>device passkey · or Standard key</td>
                  </tr>
                  <tr>
                    <th>Recovery</th>
                    <td>either seed (Seed-A or Seed-B)</td>
                  </tr>
                  <tr>
                    <th>Custody</th>
                    <td>
                      <span className="pill pill-good">strict self-custody</span>
                    </td>
                  </tr>
                  <tr>
                    <th>For</th>
                    <td>everyone — crypto-natives, privacy-conscious users</td>
                  </tr>
                </tbody>
              </table>
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
                Adds the username + password login that mainstream users expect.
                It&apos;s a <strong>convenience door, never a recovery root</strong> —
                and honestly the <em>weakest</em> door in your Codex, so we say so
                plainly. All of Mode 1&apos;s strong doors stay fully present; forget
                the password and you reset it with a seed, never via the operator.
              </p>
              <table className="mode-card-table lp-xs">
                <tbody>
                  <tr>
                    <th>Login</th>
                    <td>
                      Mode 1 doors <em>or</em> username + password
                    </td>
                  </tr>
                  <tr>
                    <th>Recovery</th>
                    <td>either seed</td>
                  </tr>
                  <tr>
                    <th>Custody</th>
                    <td>
                      <span className="pill pill-good">strict self-custody</span>
                    </td>
                  </tr>
                  <tr>
                    <th>For</th>
                    <td>consumer onboarding, web2 familiarity</td>
                  </tr>
                </tbody>
              </table>
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
                one-shot Email Recovery Secret — save it like any important credential.
                &quot;Forgot access&quot; then works for real, without exposing
                anything the operator can decrypt. Email is for recovery, not login.
              </p>
              <table className="mode-card-table lp-xs">
                <tbody>
                  <tr>
                    <th>Login</th>
                    <td>Mode 1/2 doors</td>
                  </tr>
                  <tr>
                    <th>Recovery</th>
                    <td>
                      either seed <em>or</em> email magic link + Email Recovery Secret
                    </td>
                  </tr>
                  <tr>
                    <th>Custody</th>
                    <td>
                      <span className="pill">hybrid (user-held paths)</span>
                    </td>
                  </tr>
                  <tr>
                    <th>For</th>
                    <td>users who want a seed-free recovery option</td>
                  </tr>
                </tbody>
              </table>
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
                SMS Recovery Secret, and personal-facts recovery (mother&apos;s maiden
                name, first pet, plus a chosen secret word) for the most accessible
                onboarding. The Demiourgos Streaming Platform preset will use this with
                full autopilot. Running an SMS stack is operationally heavy, so it
                ships once the streaming platform genuinely needs phone onboarding.
              </p>
              <table className="mode-card-table lp-xs">
                <tbody>
                  <tr>
                    <th>Login</th>
                    <td>Mode 1/2 doors (phone is recovery-only)</td>
                  </tr>
                  <tr>
                    <th>Recovery</th>
                    <td>either seed / email / SMS Recovery Secret / facts</td>
                  </tr>
                  <tr>
                    <th>Custody</th>
                    <td>
                      <span className="pill pill-warn">
                        hybrid, accessibility-leaning
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <th>For</th>
                    <td>Demiourgos Streaming Platform, non-technical users</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Cumulative table */}
          <div className="lp-mt lp-card">
            <h4 className="lp-h4">Each mode only adds doors</h4>
            <p className="lp-sub lp-small">
              Every mode keeps all of Mode 1&apos;s strong doors (passkey + seeds) and
              only adds weaker, more convenient alternatives on top — never removing
              one. Adding a mode adds new wraps of your Codex Key; removing one (after
              a 24-hour cooling-off) deletes only those extra wraps. Your two seeds are
              always recovery roots and can never be removed. The encrypted Codex blob
              is byte-identical across all your mode changes.
            </p>
            <div className="scroll-x">
              <table>
                <thead>
                  <tr>
                    <th>Mode</th>
                    <th>Identifier(s)</th>
                    <th>Login doors</th>
                    <th>Recovery surfaces</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span
                        className="mode-badge"
                        style={{
                          width: "1.8rem",
                          height: "1.8rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        Ⅰ
                      </span>
                    </td>
                    <td>CodexID</td>
                    <td>passkey, Standard key</td>
                    <td>Seed-A, Seed-B</td>
                  </tr>
                  <tr>
                    <td>
                      <span
                        className="mode-badge"
                        style={{
                          width: "1.8rem",
                          height: "1.8rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        Ⅱ
                      </span>
                    </td>
                    <td>CodexID, username</td>
                    <td>passkey, Standard key, username+password</td>
                    <td>Seed-A, Seed-B</td>
                  </tr>
                  <tr>
                    <td>
                      <span
                        className="mode-badge"
                        style={{
                          width: "1.8rem",
                          height: "1.8rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        Ⅲ
                      </span>
                    </td>
                    <td>CodexID, username, email</td>
                    <td>passkey, Standard key, username+password</td>
                    <td>Seed-A, Seed-B, email-secret</td>
                  </tr>
                  <tr style={{ opacity: 0.6 }}>
                    <td>
                      <span
                        className="mode-badge"
                        style={{
                          width: "1.8rem",
                          height: "1.8rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        Ⅳ
                      </span>
                    </td>
                    <td>
                      + phone <span className="pill pill-warn">v0.2</span>
                    </td>
                    <td>(same — phone is recovery-only)</td>
                    <td>+ SMS-secret, facts</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <div className="lp-divider"></div>

      {/* ──────────────────── ONBOARDING ──────────────────── */}
      <section id="onboarding" className="lp-section lp-section--alt">
        <div className="lp-measure-6">
          <h2 className="lp-h2 lp-center">How you onboard</h2>
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
      </section>

      <div className="lp-divider"></div>

      {/* ──────────────────── STORAGE ──────────────────── */}
      <section id="storage" className="lp-section">
        <div className="lp-measure-6">
          <h2 className="lp-h2 lp-center">Three-layer storage architecture</h2>
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

          {/* Arweave intro sidebar */}
          <div className="sidebar lp-measure-4 lp-mt">
            <div className="sidebar-title">
              What is Arweave, and why we chose it for permanence
            </div>
            <p className="lp-sub lp-small">
              Arweave is a decentralized data-storage protocol with a single, unusual
              promise: <strong>pay once, stored forever</strong>. There&apos;s no
              monthly bill, no annual renewal, no risk of your storage provider going
              under and taking your data with them. The protocol&apos;s economics are
              designed around a 200-year endowment that funds the network&apos;s
              storage operators indefinitely.
            </p>
            <p className="lp-sub lp-small">
              For Mnemosyne, that property makes Arweave the right tool for the
              optional permanence layer. Storing your Codex there means:
            </p>
            <ul className="lp-small">
              <li>
                <span className="lp-classical">•</span> The encrypted blob outlives
                Mnemosyne. If <strong>AncientHoldings GmbH</strong> as an operator ever
                ceases to exist, your Codex still does.
              </li>
              <li>
                <span className="lp-classical">•</span> No subscription liability.
                You&apos;re not renting space; you bought it.
              </li>
              <li>
                <span className="lp-classical">•</span> Multiple gateways can serve your
                blob (<code>arweave.net</code>, <code>ar.io</code>, others). You&apos;re
                not bound to any single distribution point.
              </li>
              <li>
                <span className="lp-classical">•</span> Combined with the <Stoa />{" "}
                pointer (Layer 3), Arweave becomes a <em>verifiable</em> backup — not
                just &quot;some blob somewhere claiming to be yours.&quot;
              </li>
            </ul>
            <p className="lp-muted lp-xs">
              Arweave is optional, not default. The base Mnemosyne service stores your
              Codex in its own database (Layer 1) — fast, free, deletable. Arweave is
              what you reach for when you want belt-and-suspenders permanence.
            </p>
          </div>

          <div className="lp-mt lp-card lp-measure-4">
            <h4 className="lp-h4">Why three layers, not one?</h4>
            <ul className="lp-small">
              <li>
                <strong>L1 alone</strong> = standard cloud service. Fast, cheap, but
                Mnemosyne dying = data lost.
              </li>
              <li>
                <strong>L1 + L2</strong> = backup story. But no way to <em>trust</em>{" "}
                that a fetched L2 blob is the right one.
              </li>
              <li>
                <strong>L1 + L2 + L3</strong> = full trust anchor. The chain proves
                which Arweave blob is canonically yours.
              </li>
            </ul>
            <p className="lp-sub lp-small">
              The chain pointer is what makes Arweave a <em>backup</em> rather than just{" "}
              <em>another place data sits</em>. Without L3, an attacker could publish
              decoy blobs and a recovering user would have no way to tell which one was
              theirs.
            </p>
          </div>
        </div>
      </section>

      <div className="lp-divider"></div>

      {/* ──────────────────── IDENTITY ──────────────────── */}
      <section id="identity" className="lp-section lp-section--alt">
        <div className="lp-measure-6">
          <h2 className="lp-h2 lp-center">
            Codex Identity — the double-Apollo construction
          </h2>
          <p className="lp-center lp-sub lp-measure-3 lp-mb">
            Every Codex has a public identity on the <Stoa />. It&apos;s a{" "}
            <em>pair</em> of Apollo-curve keys — a Standard key for daily operations
            and a Smart key that serves as both a cold guardian and a second recovery
            root. Each comes from its own independent seed.
          </p>

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

          <div className="lp-mt lp-card lp-measure-4">
            <h4 className="lp-h4">Off-chain Schnorr verification</h4>
            <p className="lp-sub lp-small">
              Apollo signatures are verified off-chain by Mnemosyne&apos;s web app and
              backend. This enables cross-domain identity proofs without chain calls:
            </p>
            <ul className="lp-small">
              <li>
                <span className="lp-classical">•</span> Visit a new Codex Consumer
                (e.g., OuronetUI at <code>wallet.ouro.network</code>) — sign a challenge
                with Standard, consumer verifies against on-chain pubkey, accepts your
                Codex Identity.
              </li>
              <li>
                <span className="lp-classical">•</span> Issue session tokens bound to
                Standard pubkey.
              </li>
              <li>
                <span className="lp-classical">•</span> Prove identity in
                StoicTag-based messaging.
              </li>
              <li>
                <span className="lp-classical">•</span> Sign-in-with-Codex-Identity on
                third-party services.
              </li>
            </ul>
          </div>
        </div>
      </section>

      <div className="lp-divider"></div>

      {/* ──────────────────── STOICTAGS ──────────────────── */}
      <section id="stoictags" className="lp-section">
        <div className="lp-measure-5">
          <h2 className="lp-h2 lp-center">
            StoicTags — human-readable account names
          </h2>
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
      </section>

      <div className="lp-divider"></div>

      {/* ──────────────────── SECURITY ──────────────────── */}
      <section id="security" className="lp-section lp-section--alt">
        <div className="lp-measure-6">
          <h2 className="lp-h2 lp-center">
            Security &amp; custody — what the operator can &amp; cannot do
          </h2>
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
      </section>

      <div className="lp-divider"></div>

      {/* ──────────────────── ROADMAP / STATUS ──────────────────── */}
      <section id="roadmap" className="lp-section">
        <div className="lp-measure-6">
          <h2 className="lp-h2 lp-center">Status &amp; roadmap</h2>
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
      </section>

      {/* ──────────────────── FOOTER ──────────────────── */}
      <footer className="lp-footer">
        <div className="lp-measure-6">
          <p className="lp-sub lp-small">
            Part of the <Stoa />/<Ouro /> ecosystem. Built by{" "}
            <a href="https://ancientholdings.eu">AncientHoldings GmbH</a>.
          </p>
          <div className="lp-footer-links lp-mt">
            <a href="https://github.com/orgs/OuroborosNetwork/repositories">
              GitHub — OuroborosNetwork
            </a>
            <a href="https://github.com/OuroborosNetwork/Mnemosyne">
              Mnemosyne repository
            </a>
            <a href="https://ancientholdings.eu">AncientHoldings.eu</a>
          </div>
          <p className="lp-xs lp-muted lp-mt">
            codex.ancientholdings.eu · design-lock 2026-05-28
          </p>
        </div>
      </footer>
    </div>
  );
}
