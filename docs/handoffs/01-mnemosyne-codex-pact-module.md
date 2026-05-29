# Handoff: `mnemosyne.CODEX` Pact module

**Audience:** another agent (Cursor, Claude, or human) tasked with writing the Pact module that backs Mnemosyne's on-chain Codex Identity registry + Arweave upload tracker.

**Author:** Claude (Opus, 2026-05-28); originally drafted earlier in the day, **rewritten 2026-05-28 (PM) to reflect**:
- Double-Apollo CodexID (Standard + Smart halves)
- ADMIN-only insert for codex-identities
- Separation of identity (immutable except CodexGuard) from Arweave tracking (append-only)
- Simplified schema per owner's refined design

**Status:** design-locked at the spec level; implementation not yet started.

**Deployment target:** Stoa chain (Kadena-fork operated by the AncientHodler ecosystem). Namespace `mnemosyne` (create if not present), module name `CODEX`.

---

## 1. Why this module exists

Mnemosyne is a cloud-hosted Codex management service. Each codex is identified by a **double-Apollo Codex Identity** (a Standard + Smart Apollo pubkey pair derived from a 2048-bit user-controlled seed). The on-chain `mnemosyne.CODEX` module stores:

1. **Identity registry** — the immutable Codex Identity entry for every codex registered with Mnemosyne (Apollo pubkeys + Kadena CodexGuard keyset for on-chain authorization).
2. **Arweave upload tracker** — append-only audit log of every Arweave backup ever uploaded for any codex, allowing recovery from L2 (Arweave) when L1 (Mnemosyne DB) is unavailable.

The encrypted codex blob itself is NOT stored on-chain. Storage layers (see `Mnemosyne/docs/v0.1-design.md` §3.4):

- **L1** — Mnemosyne PostgreSQL (always present, hot path)
- **L2** — Arweave (opt-in, user-paid via Bundlr/Irys, addressed by `arweave-tx-id`)
- **L3** — this Pact module (always present, immutable trust anchor)

Full architectural context: `Mnemosyne/docs/v0.1-design.md` and `Mnemosyne/docs/v0.1-onboarding-and-modes.md`.

---

## 2. Namespace + module skeleton

```pact
(namespace 'mnemosyne)

(module CODEX IMMUTABLE-GOV
  "On-chain Codex Identity registry + Arweave upload tracker for Mnemosyne. \
   \ ADMIN-only registration (Mnemosyne operator performs all inserts on \
   \ user's behalf). Owner-gated mutations via Kadena CodexGuard keyset. \
   \ Apollo signatures are NOT verified on-chain (Pact lacks Apollo verifier); \
   \ those checks happen off-chain at the SPA + Mnemosyne backend layers."

  ;; ─── Governance ─────────────────────────────────────────────────
  (defcap IMMUTABLE-GOV ()
    @doc "Frozen governance. The module is upgrade-impossible by design \
          \ once deployed; bugfixes ship as a new module version under \
          \ a new module name (e.g. CODEX-V2)."
    (enforce false "mnemosyne.CODEX governance is frozen by design"))

  ;; ─── (schemas, tables, capabilities, functions below) ───────────
)
```

The `IMMUTABLE-GOV` pattern is intentional. We're storing user-controlled identity records — there must be no admin-rotatable governance that could overwrite or censor entries. The Pact module is `enforce false` for governance; bugfixes ship as `CODEX-V2`.

(Note: ADMIN capability for inserts is separate from MODULE governance. ADMIN can register new codex identities; ADMIN cannot upgrade the module code or change its behavior. See §4.)

---

## 3. Schemas + tables

### 3.1 `codex-identities` (primary table — identity registry)

**One row per registered codex. All fields IMMUTABLE except `codex-guard`.**

```pact
(defschema codex-identity-row
  @doc "Identity row for one Mnemosyne-registered codex. All fields are \
        \ IMMUTABLE post-registration EXCEPT codex-guard, which is rotatable \
        \ via rotate-codex-guard (gated by current CODEX-OWNER capability)."

  codex-id:string
    @doc "Full composite address: '₱.STANDARD-pubkey.N.SMART-pubkey'. \
          \ Same value as the table key (repeated as a field for in-row \
          \ access during reads/writes that don't have the key separately). \
          \ IMMUTABLE."

  codex-id-standard:string
    @doc "The Standard half of the codex address: '₱.STANDARD-pubkey'. \
          \ Denormalized substring of codex-id for query convenience. \
          \ IMMUTABLE."

  codex-id-smart:string
    @doc "The Smart half of the codex address: 'N.SMART-pubkey'. \
          \ Denormalized substring of codex-id for query convenience. \
          \ IMMUTABLE."

  public-standard:string
    @doc "Raw canonical encoding of the Standard Apollo pubkey (the bytes \
          \ a verifier needs to check a Standard-signed Schnorr signature \
          \ off-chain). IMMUTABLE."

  public-smart:string
    @doc "Raw canonical encoding of the Smart Apollo pubkey. Used for \
          \ off-chain dual-sign verification of sensitive operations. \
          \ IMMUTABLE."

  codex-guard:guard
    @doc "Kadena keyset guard derived from the codex's CodexGuard key \
          \ (one of the three Kadena keys generated at signup; see \
          \ v0.1-onboarding-and-modes.md §1 glossary). Authorizes all \
          \ on-chain mutations to this row + writes to arweave-tracker. \
          \ MUTABLE via rotate-codex-guard (requires current codex-guard \
          \ to sign the rotation; off-chain dual-Apollo cosign enforced \
          \ by Mnemosyne backend before tx is constructed)."

  registered-at:time
    @doc "Block time when register-codex-identity was called. IMMUTABLE."

  registered-by:string
    @doc "Free-form string identifying the registering admin (e.g. \
          \ 'mnemosyne-operator-prod-v1.0.0'). For observability only; \
          \ ADMIN is what actually authorized the insert. IMMUTABLE.")

(deftable codex-identities:{codex-identity-row})
```

### 3.2 `arweave-tracker` (secondary table — Arweave upload audit log)

**Append-only. No row is ever updated or deleted.**

```pact
(defschema arweave-tracker-row
  @doc "One row per Arweave backup upload for any codex. IMMUTABLE once \
        \ inserted. Inserts gated by the codex's CODEX-OWNER capability."

  codex-id:string
    @doc "Foreign-key reference to codex-identities.codex-id. Allows \
          \ enumeration of all uploads for a given codex via (select). \
          \ MUST match an existing codex-identities row (enforced by \
          \ the writer function)."

  arweave-tx-id:string
    @doc "Arweave transaction id (43-char base64url format: ^[A-Za-z0-9_-]{43}$). \
          \ Stored both in the table key (as suffix) and as a field for \
          \ read-result convenience."

  upload-time:time
    @doc "Block time when this upload row was inserted."

  uploaded-bytes:integer
    @doc "Size in bytes of the encrypted codex blob that was uploaded to \
          \ Arweave at this tx-id. Useful for the SPA to display upload \
          \ history with size info, and for cost-accounting on the \
          \ Mnemosyne operator side.")

(deftable arweave-tracker:{arweave-tracker-row})
;; Key format: "<codex-id>|<arweave-tx-id>"
;; To enumerate a codex's uploads: (select arweave-tracker (where "codex-id" (= codex-id-value)))
;; Note: Pact `select` is O(table-size). Acceptable for v0.1 (small history); \
;; revisit with a sequence-number-based key scheme if scale demands.
```

### 3.3 `stoictags` (third table — human-readable name registry)

**One row per registered StoicTag. All fields IMMUTABLE except the optional release operation, which deletes the row entirely (release does not mutate fields, it removes the record).**

```pact
(defschema stoictag-row
  @doc "A human-readable name (StoicTag) tied to exactly one Ouronet \
        \ account address. Format convention: prefixed with '§' when \
        \ displayed (e.g. '§bytales'), but the prefix glyph is NOT \
        \ stored on chain — only the bare name 'bytales' lives in \
        \ tag-name. The single glyph '§' is used for both Standard and \
        \ Smart accounts; the account-address field carries the actual \
        \ Ouronet account address (which itself indicates Standard \
        \ Ѻ. vs Smart Σ. prefix). One StoicTag per account; one \
        \ account per StoicTag (bijection). \
        \
        \ StoicTags are codex-agnostic — the chain has no awareness of \
        \ which codex (if any) registered the tag or controls the account. \
        \ Anyone holding the account's keys can register/release, whether \
        \ those keys live in a Mnemosyne codex, an OuronetUI codex, a CLI \
        \ tool, or anywhere else. StoicTags work without Mnemosyne entirely."

  tag-name:string
    @doc "The bare name without '§' prefix. Same value as the table key. \
          \ Format: [a-z0-9.-]{3,30}. Lowercase only. IMMUTABLE."

  account-address:string
    @doc "The Ouronet account address (either Standard Ѻ.xxx or Smart \
          \ Σ.xxx) that this StoicTag resolves to. Account MUST be \
          \ activated on Stoa chain at registration time. IMMUTABLE."

  registered-at:time
    @doc "Block time when register-stoictag was called. IMMUTABLE.")

(deftable stoictags:{stoictag-row})
;; Key = tag-name (e.g. "bytales")
```

### 3.4 `stoictags-by-account` (fourth table — reverse-lookup index)

**Enforces the "one StoicTag per account" rule via Pact's `insert` collision semantics. Maintained in sync with `stoictags` table by the writer functions.**

```pact
(defschema stoictag-by-account-row
  @doc "Reverse lookup index: account-address → tag-name. Lets the SPA \
        \ answer 'does this account have a StoicTag?' without scanning \
        \ the stoictags table. Also enforces the one-stoictag-per-account \
        \ invariant via insert collision (an account that already has a \
        \ row here cannot register a second StoicTag)."

  account-address:string
    @doc "The Ouronet account address. Same value as the table key. \
          \ IMMUTABLE."

  tag-name:string
    @doc "The StoicTag name registered to this account. IMMUTABLE.")

(deftable stoictags-by-account:{stoictag-by-account-row})
;; Key = account-address (the full Ouronet account string)
```

### 3.5 Schema design rationale

- **Identity table is fully immutable except for the guard.** This makes the identity row a true permanent record of "this CodexID is registered, here's its public material, here's who currently controls it." No history-mutation games possible.
- **CodexGuard rotation** is the ONLY mutating operation on the identity row. Even that requires the current guard's signature, so it's self-recursive (you must control the codex to change who controls the codex).
- **No `arweave-tx-id` denormalized in the main table.** The "latest Arweave backup" is a derived value computed by reading the tracker rows for a codex and taking the most recent. This removes the need for `update-arweave-pointer`-style mutations on the identity row entirely.
- **Arweave tracker is append-only.** Past uploads are evidence; they're never rewritten. If a user wants to "forget" a past upload, they can ignore it client-side — but the chain record remains.
- **StoicTags are cost-gated, not admin-gated.** Unlike codex registration (admin-only to prevent squatting), StoicTags allow anyone to register but require a STOA payment. The cost is the sole spam-gate; no operator gatekeeping. Fee value set via module-level constant (see §10).
- **StoicTags are codex-agnostic.** The chain stores no reference to a codex on StoicTag rows. Any client that controls an account's keys can register a StoicTag for that account, whether those keys live in a Mnemosyne codex, an OuronetUI codex, a CLI tool, or any future client. StoicTag registration + resolution + release works without Mnemosyne entirely. Mnemosyne is a convenient SPA for the flow but not a structural dependency.
- **Bijection between StoicTag name and account address** is enforced cryptographically by the two tables: the primary `stoictags` table enforces "one row per name" via insert; the secondary `stoictags-by-account` table enforces "one row per account" via insert. A registration that violates either invariant fails atomically.
- **StoicTag release is allowed** (unlike codex identity, which is permanent). Whoever currently controls the tagged account (satisfies its on-chain guard) can release the name, freeing it for re-registration by anyone (including a different account). Release deletes both rows atomically. No fee refund — the original registration fee is sunk.

---

## 4. Capabilities

```pact
(defcap ADMIN ()
  @doc "Mnemosyne operator admin. Only the holder of this keyset can \
        \ register new codex identities. Users do NOT directly call \
        \ register-codex-identity; Mnemosyne (the operator) submits all \
        \ registrations on the user's behalf after verifying the user's \
        \ identity at the SPA + backend layer.
        \
        \ Rationale for admin-only insertion:
        \ 1. Prevents Apollo-address-squatting by bots/attackers
        \ 2. Keeps the table clean (Mnemosyne can verify identity-mode \
        \    completion before registering)
        \ 3. Sponsors gas (user pays nothing for registration)
        \
        \ The admin keyset is defined by 'mnemosyne-admin' (read from \
        \ env at deployment time)."
  (enforce-keyset 'mnemosyne-admin))

(defcap CODEX-OWNER (codex-id:string)
  @doc "Authorizes operations against an existing codex identity row. \
        \ Composes the row's codex-guard, which is a Kadena keyset built \
        \ from the codex's CodexGuard key. The owner is anyone who can \
        \ unlock the codex and access the CodexGuard's private half.
        \
        \ Used by: rotate-codex-guard, record-arweave-upload"
  (with-read codex-identities codex-id { "codex-guard" := g }
    (enforce-guard g)))

(defcap STOICTAG-ACCOUNT-OWNER (account-address:string)
  @doc "Authorizes operations on a StoicTag tied to a given account. \
        \ Composes the on-chain guard of the Ouronet account at \
        \ account-address (looked up via the coin module or its Stoa \
        \ equivalent). The owner of the StoicTag is whoever currently \
        \ controls the account it points to — NOT necessarily the codex \
        \ that originally registered it (account ownership may have \
        \ transferred via key rotation).
        \
        \ Used by: register-stoictag, release-stoictag"
  ;; TODO implementer: replace `coin` with the actual Stoa-chain token
  ;; module name if different. The pattern is: read the account's stored
  ;; guard from the token module, then enforce-guard on it.
  (let ((acct-guard (at 'guard (coin.details account-address))))
    (enforce-guard acct-guard)))
```

**Note on dual-Apollo cosign:**

Operations like `rotate-codex-guard` semantically require dual-Apollo cosign (Standard + Smart) per `v0.1-onboarding-and-modes.md` §3.3. However, Apollo signatures cannot be verified inside Pact (no Apollo verifier in the language). The dual-cosign requirement is enforced **off-chain** by:

1. The Mnemosyne SPA (must collect both signatures before constructing the tx)
2. The Mnemosyne backend (re-verifies both signatures before relaying to chain)

The chain only sees the Kadena CodexGuard signature. A bypass is possible if a user submits txs directly to Stoa without going through Mnemosyne — they'd sign with just CodexGuard and chain would accept. This is documented as an explicit trust assumption: dual-Apollo cosign defense applies when txs go through Mnemosyne's gateway. Users who self-relay accept the reduced security in exchange for operator independence.

---

## 5. Functions

### 5.1 `register-codex-identity` — ADMIN-only insertion

```pact
(defun register-codex-identity:string
  ( codex-id:string
    codex-id-standard:string
    codex-id-smart:string
    public-standard:string
    public-smart:string
    codex-guard:guard
    registered-by:string )
  @doc "Register a new codex identity. ADMIN-only — Mnemosyne operator \
        \ calls this on the user's behalf after verifying their identity \
        \ at the SPA + backend layer. Fails if codex-id is already \
        \ registered (Pact insert semantics enforce uniqueness)."

  (with-capability (ADMIN)
    ;; Validation: codex-id must be the concatenation of the two halves
    ;; in the canonical address format. Helps prevent admin-side typos.
    (enforce (= codex-id (format "{}.{}" [codex-id-standard codex-id-smart]))
      "codex-id must equal codex-id-standard + '.' + codex-id-smart")

    (enforce (!= codex-id-standard "") "codex-id-standard must not be empty")
    (enforce (!= codex-id-smart "") "codex-id-smart must not be empty")
    (enforce (!= public-standard "") "public-standard must not be empty")
    (enforce (!= public-smart "") "public-smart must not be empty")

    ;; NOTE: The address-format glyphs (Apollo Standard prefix, Apollo Smart
    ;; prefix) are produced by the dalos-crypto package's Apollo curve
    ;; primitives. The Mnemosyne SPA + backend verify the format off-chain
    ;; using those primitives before calling register-codex-identity.
    ;; Pact-side, we trust the ADMIN cap (which gates this function) to
    ;; only submit pre-validated inputs. No glyph validation needed here.

    (insert codex-identities codex-id
      { "codex-id":           codex-id
      , "codex-id-standard":  codex-id-standard
      , "codex-id-smart":     codex-id-smart
      , "public-standard":    public-standard
      , "public-smart":       public-smart
      , "codex-guard":        codex-guard
      , "registered-at":      (at "block-time" (chain-data))
      , "registered-by":      registered-by
      })
    (format "Codex Identity {} registered" [codex-id])))
```

### 5.2 `rotate-codex-guard` — CodexGuard rotation (dual-guard enforcement)

```pact
(defun rotate-codex-guard:string
  ( codex-id:string
    new-codex-guard:guard )
  @doc "Rotate the codex-guard keyset to a new value. Requires the \
        \ tx to be signed by BOTH the OLD codex-guard (proves authority \
        \ to change) AND the NEW codex-guard (proves the new keyset is \
        \ willing, well-formed, and not a typo/dead key). Mnemosyne \
        \ backend SHOULD additionally verify dual-Apollo (Standard + Smart) \
        \ cosign before constructing this tx, but chain enforces only the \
        \ Kadena guard signatures."

  ;; Old guard enforcement via the CODEX-OWNER capability (reads stored guard)
  (with-capability (CODEX-OWNER codex-id)
    ;; New guard enforcement — both keysets must sign the tx
    (enforce-guard new-codex-guard)

    (update codex-identities codex-id
      { "codex-guard": new-codex-guard })
    (format "Codex {} guard rotated" [codex-id])))
```

**Note on the dual-guard pattern**: this is the standard Pact rotation idiom. The tx envelope must carry signatures for BOTH the keys backing the old `codex-guard` AND the keys backing the `new-codex-guard`. If either set of signatures is missing or invalid, the rotation fails atomically. This prevents:

- Accidentally rotating to a dead keyset (typo in the new pubkey) — caught because the new guard's keys aren't actually present in the tx
- Accidentally rotating without authorization — caught because the old guard isn't satisfied

### 5.3 `record-arweave-upload` — append a new tracker row

```pact
(defun record-arweave-upload:string
  ( codex-id:string
    arweave-tx-id:string
    uploaded-bytes:integer )
  @doc "Record that an Arweave backup was uploaded for this codex. \
        \ Authorized by codex-guard (CODEX-OWNER). Inserts a new row in \
        \ arweave-tracker. Fails if the same (codex-id, arweave-tx-id) \
        \ pair was already recorded (insert collision)."

  (with-capability (CODEX-OWNER codex-id)
    (enforce (validate-arweave-tx-id arweave-tx-id)
      "invalid arweave-tx-id format")
    (enforce (> uploaded-bytes 0)
      "uploaded-bytes must be positive")

    (let ((tracker-key (format "{}|{}" [codex-id arweave-tx-id])))
      (insert arweave-tracker tracker-key
        { "codex-id":       codex-id
        , "arweave-tx-id":  arweave-tx-id
        , "upload-time":    (at "block-time" (chain-data))
        , "uploaded-bytes": uploaded-bytes
        }))
    (format "Upload recorded: {} -> {}" [codex-id arweave-tx-id])))

(defun validate-arweave-tx-id:bool (tx-id:string)
  @doc "Verify the input matches the standard Arweave transaction id \
        \ format per the Arweave HTTP API specification: \
        \   - exactly 43 characters long \
        \   - base64url charset only: [A-Za-z0-9_-] \
        \   - no padding characters \
        \ Reference: https://docs.arweave.org/developers/server/http-api \
        \
        \ Implementer notes: Pact has no native regex. Use whichever \
        \ approach is cleanest on the target Pact version: \
        \   - per-char fold using str-to-list + char comparison \
        \   - take/drop loop with is-base64url-char helper \
        \   - any built-in string-charset primitive if available \
        \ The validation MUST be complete (length + charset). Length-only \
        \ is NOT acceptable for v0.1 — the owner explicitly wants standard \
        \ Arweave format validation on-chain.")

;; Helper (implementer may inline or restructure as needed):
(defun is-base64url-char:bool (c:string)
  @doc "Returns true if the single-character string `c` is in the \
        \ base64url charset [A-Za-z0-9_-]."
  (or (and (>= c "A") (<= c "Z"))
  (or (and (>= c "a") (<= c "z"))
  (or (and (>= c "0") (<= c "9"))
      (contains c ["_" "-"])))))
```

### 5.4 Read functions (gas-free queries)

```pact
(defun get-codex-identity:object{codex-identity-row} (codex-id:string)
  @doc "Read a single codex identity row by codex-id."
  (read codex-identities codex-id))

(defun get-codex-identity-or-null:object (codex-id:string)
  @doc "Like get-codex-identity but returns an empty object instead of \
        \ throwing when the codex-id is not registered. Used by the SPA's \
        \ recovery-flow check ('is this CodexID already registered?')."
  ;; TODO implementer: confirm with-default-read syntax on the target Pact version.
  (with-default-read codex-identities codex-id
    { "codex-id":           ""
    , "codex-id-standard":  ""
    , "codex-id-smart":     ""
    , "public-standard":    ""
    , "public-smart":       ""
    , "codex-guard":        (read-keyset "empty-keyset")
    , "registered-at":      (time "1970-01-01T00:00:00Z")
    , "registered-by":      "" }
    { "codex-id":          := cid
    , "codex-id-standard" := cidstd
    , "codex-id-smart"    := cidsmt
    , "public-standard"   := pubstd
    , "public-smart"      := pubsmt }
    { "codex-id":           cid
    , "codex-id-standard":  cidstd
    , "codex-id-smart":     cidsmt
    , "public-standard":    pubstd
    , "public-smart":       pubsmt
    , "is-registered":      (!= cid "") }))

(defun list-arweave-uploads:[object] (codex-id:string)
  @doc "Return all arweave-tracker rows for the given codex, sorted by \
        \ upload-time descending (newest first).
        \
        \ NOTE: uses Pact (select) — O(table-size). For v0.1 this is \
        \ acceptable. If history scale grows, replace with a sequence-key \
        \ scheme that allows direct read-by-key per codex."
  (select arweave-tracker (where "codex-id" (= codex-id))))

(defun get-latest-arweave-upload:object (codex-id:string)
  @doc "Convenience function: return only the most recent arweave-tracker \
        \ row for this codex. Implemented via list-arweave-uploads + take 1."
  (let ((all (list-arweave-uploads codex-id)))
    (if (= (length all) 0)
        { "codex-id": "", "arweave-tx-id": "", "upload-time": (time "1970-01-01T00:00:00Z"), "uploaded-bytes": 0 }
        (at 0 (sort ['upload-time] all)))))
```

### 5.5 StoicTag functions (registration, release, resolution)

```pact
;; ─── Constants (configurable; see §10 open questions) ────────────────

(defconst STOICTAG-REGISTRATION-FEE:decimal 5.0
  @doc "Cost in STOA to register a new StoicTag. Tunable; owner picks final value. \
        \ Recommended starting range: 1.0 – 10.0 STOA.")

(defconst STOICTAG-FEE-DESTINATION:string "mnemosyne-stoictag-fees"
  @doc "Ouronet account that receives StoicTag registration fees. Owner sets the actual \
        \ account at deployment. Options discussed in §10: burn-account / operator-revenue \
        \ / community-treasury / DAO-governance.")

;; ─── Name format validation ───────────────────────────────────────────

(defun validate-stoictag-name:bool (tag-name:string)
  @doc "Verify the StoicTag name format: \
        \   - lowercase only \
        \   - 3 to 30 characters long \
        \   - charset: a-z, 0-9, '.', '-' \
        \ The leading '§' glyph is a DISPLAY convention, NOT stored. The \
        \ stored tag-name is the bare ASCII name. \
        \
        \ Reuses the per-char validation pattern from validate-arweave-tx-id; \
        \ implementer picks the cleanest available method."
  (and
    (and (>= (length tag-name) 3) (<= (length tag-name) 30))
    ;; per-char charset check: a-z, 0-9, '.', '-'
    ;; TODO implementer: implement using whichever Pact primitive is cleanest
    true))

(defun is-stoictag-name-char:bool (c:string)
  @doc "Returns true if the single-character string `c` is in the StoicTag charset \
        \ [a-z0-9.-]."
  (or (and (>= c "a") (<= c "z"))
  (or (and (>= c "0") (<= c "9"))
      (contains c ["." "-"]))))

;; ─── Registration ─────────────────────────────────────────────────────

(defun register-stoictag:string
  ( tag-name:string
    account-address:string )
  @doc "Register a new StoicTag. Anyone can call this function — there is no \
        \ admin gate. Spam-gated by a STOA payment. Requires: \
        \   1. tag-name format valid (validate-stoictag-name) \
        \   2. tag-name not already registered (insert collision on stoictags) \
        \   3. account-address not already tagged (insert collision on stoictags-by-account) \
        \   4. STOICTAG-ACCOUNT-OWNER capability satisfied (caller controls the account) \
        \   5. Account is activated on-chain (implicit: coin.details succeeds) \
        \   6. Registration fee paid (STOA transfer from account-address to STOICTAG-FEE-DESTINATION)"

  (enforce (validate-stoictag-name tag-name) "invalid StoicTag name format")

  (with-capability (STOICTAG-ACCOUNT-OWNER account-address)
    ;; Pay the registration fee. coin.transfer will fail if the account
    ;; doesn't exist or doesn't have sufficient balance. The transfer
    ;; itself requires the account's guard, which is already satisfied
    ;; by the STOICTAG-ACCOUNT-OWNER capability above.
    ;;
    ;; TODO implementer: replace `coin` with the correct Stoa-chain token
    ;; module name. Confirm the gas-station integration handles this
    ;; transfer correctly (we don't want the fee itself to be sponsored;
    ;; the user must pay it).
    (coin.transfer account-address STOICTAG-FEE-DESTINATION STOICTAG-REGISTRATION-FEE)

    ;; Insert into primary table (enforces tag-name uniqueness)
    (insert stoictags tag-name
      { "tag-name":        tag-name
      , "account-address": account-address
      , "registered-at":   (at "block-time" (chain-data))
      })

    ;; Insert into reverse-lookup table (enforces account uniqueness)
    (insert stoictags-by-account account-address
      { "account-address": account-address
      , "tag-name":        tag-name
      })

    (format "StoicTag §{} registered to account {}" [tag-name account-address])))

;; ─── Release ──────────────────────────────────────────────────────────

(defun release-stoictag:string (tag-name:string)
  @doc "Release a StoicTag, freeing the name for re-registration by anyone. \
        \ Authorized by the CURRENT owner of the tagged account (NOT \
        \ necessarily the codex that originally registered it — account \
        \ ownership may have transferred via key rotation). \
        \
        \ No fee refund: the original registration fee is sunk. \
        \
        \ After release, the name is immediately available for re-registration \
        \ at the standard fee. No cooldown period in v0.1 (could be added if \
        \ griefing becomes an issue)."

  (with-read stoictags tag-name { "account-address" := account-address }
    (with-capability (STOICTAG-ACCOUNT-OWNER account-address)
      (with-read stoictags-by-account account-address { }
        ;; Delete from both tables atomically
        ;; TODO implementer: Pact's row-deletion semantics vary by version.
        ;; Some versions use (write) with a tombstone marker; others have
        ;; explicit (delete-row) or similar. Use whichever the target Pact
        ;; version provides. The contract is: both rows must be gone after
        ;; this call.
        (delete-row stoictags tag-name)
        (delete-row stoictags-by-account account-address)
        (format "StoicTag §{} released" [tag-name])))))

;; ─── Read functions (gas-free) ────────────────────────────────────────

(defun resolve-stoictag:object{stoictag-row} (tag-name:string)
  @doc "Resolve a StoicTag name to its row (containing the account-address). \
        \ Throws if the StoicTag is not registered."
  (read stoictags tag-name))

(defun resolve-stoictag-or-null:object (tag-name:string)
  @doc "Like resolve-stoictag but returns an empty row instead of throwing \
        \ when the StoicTag is not registered. Used by clients to check \
        \ availability before showing the registration UI."
  (with-default-read stoictags tag-name
    { "tag-name":        ""
    , "account-address": ""
    , "registered-at":   (time "1970-01-01T00:00:00Z") }
    { "tag-name"        := tn
    , "account-address" := addr }
    { "tag-name":        tn
    , "account-address": addr
    , "is-registered":   (!= tn "") }))

(defun get-stoictag-by-account:object{stoictag-by-account-row}
  (account-address:string)
  @doc "Reverse lookup: return the StoicTag (if any) registered to a given \
        \ account address. Throws if the account has no StoicTag — caller \
        \ should use the -or-null variant for safer checks."
  (read stoictags-by-account account-address))

(defun get-stoictag-by-account-or-null:object (account-address:string)
  @doc "Like get-stoictag-by-account but returns an empty row instead of \
        \ throwing when the account has no StoicTag."
  (with-default-read stoictags-by-account account-address
    { "account-address": "", "tag-name": "" }
    { "account-address" := addr, "tag-name" := tn }
    { "account-address": addr
    , "tag-name":        tn
    , "has-stoictag":    (!= tn "") }))
```

---

## 6. Validation requirements summary

| What | Where enforced | How |
|---|---|---|
| Only ADMIN can register a new codex identity | `register-codex-identity` | `(with-capability (ADMIN) ...)` enforcing `'mnemosyne-admin` keyset |
| codex-id uniqueness | `register-codex-identity` | Pact `insert` throws on existing key |
| codex-id = concat of halves | `register-codex-identity` | `(enforce (= codex-id (format "{}.{}" [...])))` |
| All identity fields non-empty | `register-codex-identity` | `(enforce (!= field "") ...)` |
| Address-format / glyph-prefix validation | NOT in Pact | Apollo glyphs are produced by dalos-crypto primitives; format trusted via ADMIN gate |
| codex-guard validity | implicit | Pact rejects malformed guards at parse time |
| Only current owner can rotate guard | `rotate-codex-guard` | `(with-capability (CODEX-OWNER codex-id) ...)` enforces old guard |
| New guard well-formed + willing | `rotate-codex-guard` | `(enforce-guard new-codex-guard)` requires new guard's keys to sign the tx |
| Only current owner can append Arweave row | `record-arweave-upload` | `(with-capability (CODEX-OWNER codex-id) ...)` |
| arweave-tx-id format (43-char base64url) | `record-arweave-upload` → `validate-arweave-tx-id` | length + per-char check |
| arweave-tracker row uniqueness per (codex, tx-id) | `record-arweave-upload` | Pact `insert` on tracker throws on existing key |
| **Dual-Apollo cosign for sensitive operations** | **NOT enforced on-chain** | Off-chain only: SPA + Mnemosyne backend; documented trust assumption |
| **Content of Arweave blob matches user's codex** | **NOT enforced anywhere on-chain** | Client-side only by attempting to decrypt; chain just records the tx-id |
| StoicTag name format | `register-stoictag` → `validate-stoictag-name` | length 3–30 + charset [a-z0-9.-] |
| StoicTag name uniqueness | `register-stoictag` | `insert` on `stoictags` throws on existing key |
| One StoicTag per account | `register-stoictag` | `insert` on `stoictags-by-account` throws on existing key |
| StoicTag account ownership at registration | `register-stoictag` | `STOICTAG-ACCOUNT-OWNER` capability + `coin.transfer` (transfer requires guard sig) |
| StoicTag account activation at registration | implicit | `coin.transfer` fails for non-activated accounts (no account record) |
| StoicTag registration fee payment | `register-stoictag` | `coin.transfer` from account to STOICTAG-FEE-DESTINATION |
| StoicTag release authority | `release-stoictag` | `STOICTAG-ACCOUNT-OWNER` of the tagged account (NOT the original registering codex — account ownership may have transferred) |

---

## 7. Tests the implementer must write

Each test ships as a `.repl` file in the same directory as the module. Coverage target: ~35 tests across the categories below.

### 7.1 ADMIN registration tests (REG-NN)

- REG-01 — Admin register fresh codex-id succeeds; row exists with all fields populated
- REG-02 — Admin register same codex-id twice → second call fails (insert collision)
- REG-03 — Non-admin caller (no ADMIN keyset) → register-codex-identity fails
- REG-04 — Register with codex-id != concat(standard, '.', smart) → fails (enforce)
- REG-05 — Register with empty codex-id-standard → fails (enforce)
- REG-06 — Register with empty codex-id-smart → fails (enforce)
- REG-07 — Register with empty public-standard or public-smart → fails (enforce)
- REG-08 — registered-at correctly set to block-time
- REG-09 — registered-by stored as provided
- REG-10 — get-codex-identity returns the inserted row with all fields
- REG-11 — get-codex-identity-or-null returns is-registered:false for unregistered codex-id
- REG-12 — get-codex-identity-or-null returns is-registered:true + fields for registered codex-id

### 7.2 CodexGuard rotation tests (ROT-NN)

- ROT-01 — Rotate by current owner succeeds; codex-guard field updated
- ROT-02 — Rotate by non-owner fails (CODEX-OWNER capability check)
- ROT-03 — Rotate on unregistered codex-id fails (read fails)
- ROT-04 — After rotation, old guard cannot rotate again (it's no longer the codex-guard)
- ROT-05 — After rotation, new guard CAN rotate again
- ROT-06 — Rotation only changes codex-guard field; all other fields remain unchanged
- ROT-07 — registered-at and registered-by unchanged after rotation

### 7.3 Arweave upload tests (ARW-NN)

- ARW-01 — Owner records valid upload → tracker row inserted
- ARW-02 — Non-owner records → fails (CODEX-OWNER capability)
- ARW-03 — Record with invalid tx-id (wrong length) → fails (validate-arweave-tx-id)
- ARW-04 — Record with invalid tx-id (non-base64url char, once charset check is implemented) → fails
- ARW-05 — Record on unregistered codex-id → fails (read fails)
- ARW-06 — Record with uploaded-bytes ≤ 0 → fails (enforce)
- ARW-07 — Duplicate record (same codex + same tx-id) → fails (insert collision)
- ARW-08 — Multiple different uploads for one codex succeed; each gets its own row
- ARW-09 — Multiple different uploads for different codices coexist without interference

### 7.4 Arweave list/read tests (LST-NN)

- LST-01 — list-arweave-uploads returns empty list for codex with no uploads
- LST-02 — list-arweave-uploads returns 1 row after one upload
- LST-03 — list-arweave-uploads returns N rows after N uploads
- LST-04 — list-arweave-uploads correctly filters by codex-id (doesn't return other codices' rows)
- LST-05 — get-latest-arweave-upload returns the most recent row by upload-time
- LST-06 — get-latest-arweave-upload returns empty-row object for codex with no uploads

### 7.5 Governance / immutability tests (GOV-NN)

- GOV-01 — Module upgrade attempt fails (IMMUTABLE-GOV throws)
- GOV-02 — No function exists to update identity-row fields OTHER than codex-guard
- GOV-03 — No function exists to delete a codex-identities row
- GOV-04 — No function exists to delete or update arweave-tracker rows
- GOV-05 — ADMIN keyset cannot be reassigned (it's set in the namespace, not in the module)
- GOV-06 — No function exists to update stoictag-row fields (only register + release)

### 7.6 StoicTag tests (STG-NN)

- STG-01 — Register valid StoicTag for activated account → both tables updated; fee transferred
- STG-02 — Register with insufficient balance → fails (coin.transfer)
- STG-03 — Register without account guard signature → fails (STOICTAG-ACCOUNT-OWNER capability)
- STG-04 — Register for non-activated account → fails (coin.transfer fails on missing account record)
- STG-05 — Register name that already exists → fails (insert collision on stoictags)
- STG-06 — Register second tag for same account → fails (insert collision on stoictags-by-account)
- STG-07 — Register with invalid name (too short, too long, bad chars, uppercase) → fails (validate-stoictag-name)
- STG-08 — registered-at stored correctly (block-time)
- STG-09 — Fee correctly transferred to STOICTAG-FEE-DESTINATION
- STG-10 — Release by current account owner succeeds → both tables emptied of this entry
- STG-11 — Release by non-owner fails (STOICTAG-ACCOUNT-OWNER capability)
- STG-12 — Release of unregistered tag fails (read fails)
- STG-13 — After release, the name can be re-registered (insert succeeds on a fresh row)
- STG-14 — After release, the account can register a different tag
- STG-15 — resolve-stoictag returns the registered row
- STG-16 — resolve-stoictag-or-null returns is-registered:false for unregistered names
- STG-17 — get-stoictag-by-account returns the tag for a tagged account
- STG-18 — get-stoictag-by-account-or-null returns has-stoictag:false for untagged accounts
- STG-19 — Two different accounts can register different tags simultaneously
- STG-20 — StoicTag can be registered by any client with the account's keys (no codex required); release authority is purely account-guard-based; chain stores no codex reference

---

## 8. Deployment script

```pact
;; Filename: deploy-mnemosyne-codex.repl (for testing) / .pact (live deployment)

(env-keys ["mnemosyne-deployer", "mnemosyne-admin"])
(env-data {
  "mnemosyne-ns-keyset":    { "keys": ["mnemosyne-deployer-pub"], "pred": "keys-all" },
  "mnemosyne-admin-keyset": { "keys": ["mnemosyne-admin-pub"],    "pred": "keys-all" },
  "upgrade": false
})

;; Step 1: define namespace if it does not exist
(define-namespace 'mnemosyne
  (read-keyset "mnemosyne-ns-keyset")
  (read-keyset "mnemosyne-ns-keyset"))

;; Step 2: define the admin keyset within the namespace
(namespace 'mnemosyne)
(define-keyset 'mnemosyne-admin (read-keyset "mnemosyne-admin-keyset"))

;; Step 3: load the module file
(load "mnemosyne-codex.pact")

;; Step 4: create tables (Pact requires explicit creation, separate from defining)
(create-table mnemosyne.CODEX.codex-identities)
(create-table mnemosyne.CODEX.arweave-tracker)
(create-table mnemosyne.CODEX.stoictags)
(create-table mnemosyne.CODEX.stoictags-by-account)

;; Step 5: ensure the STOICTAG-FEE-DESTINATION account exists on-chain
;; (whichever account model the owner chose: burn / operator-revenue /
;; community-treasury / DAO). Token module may need an explicit
;; (coin.create-account ...) call here if the chosen account doesn't
;; already exist as a STOA recipient.
;; TODO implementer: add the appropriate create-account call(s) once
;; the destination account is finalized.
```

**Implementer must verify:**
- Stoa chain's namespace creation policy
- Chain-id (the module should be deployable on chain-0; verify against Mnemosyne deployment plan)
- The exact `mnemosyne-admin-pub` value (Mnemosyne operator's signing key for registrations) — coordinate with the Mnemosyne owner
- Whether the Pact version on Stoa supports the syntax used (especially `with-default-read` binding form)

---

## 9. Out of scope for this handoff

- **Apollo curve signature verification.** Not possible in Pact at v0.1. All Apollo cosign checks happen off-chain in the SPA + Mnemosyne backend.
- **The Arweave upload itself.** SPA uploads to Arweave via Bundlr/Irys (consumer-supplied uploader), gets back a tx-id, THEN constructs the `record-arweave-upload` Pact tx. Pact never talks to Arweave.
- **Codex content schema.** Pact stores opaque tx-ids + pubkey strings + a guard. The actual codex JSON schema lives in `stoa-js/packages/ouronet-codex/docs/v0.3.0-design.md`.
- **CodexGuard rotation dual-Apollo cosign enforcement.** Enforced only off-chain. The Pact module accepts any rotation signed by current CodexGuard.
- **Migration from a hypothetical future CODEX-V2 module.** We are deploying v1 here; v2 is a separate handoff if ever needed.
- **Frontend / SPA / Mnemosyne UI work.** This handoff is Pact module only.

---

## 10. Open questions for the implementer

If you hit ambiguity, surface here rather than guessing:

1. **`with-default-read` exact syntax** — verify the Pact version on Stoa supports the binding form used in §5.4 `get-codex-identity-or-null`. If not, fall back to try/catch pattern around a plain `read`.

2. **`select` cost** — `list-arweave-uploads` uses `select` which scans the entire `arweave-tracker` table. For v0.1 this is acceptable (low row counts). If usage grows to where this becomes prohibitive, switch to a sequence-number key scheme (`<codex-id>-<seq>`) with a counter in the identity row (would require re-adding a counter field, breaking the "identity table is immutable except for guard" property). Flag for owner before changing.

3. **Gas-station integration for admin registrations** — Mnemosyne admin pays for `register-codex-identity` gas. Confirm with the Ouronet Gas Station maintainer that admin txs from the `'mnemosyne-admin` keyset are sponsored. If not, Mnemosyne needs its own funding source.

4. **`str-to-list` / per-char iteration availability** — the suggested `validate-arweave-tx-id` implementation uses per-character iteration. Verify the Pact version on Stoa exposes the necessary primitives (`str-to-list`, `take`, `drop`, `enumerate`, etc.). Pick the cleanest available approach; the contract is "complete length + charset validation."

5. **StoicTag registration fee value** — `STOICTAG-REGISTRATION-FEE` is currently set to `5.0` STOA as a placeholder. Owner picks the final value. Suggested range: 1.0–10.0 STOA. Considerations: too low invites bot spam; too high discourages legitimate users.

6. **StoicTag fee destination account** — `STOICTAG-FEE-DESTINATION` is currently `"mnemosyne-stoictag-fees"` as a placeholder. Owner picks the actual account. Options:
   - **Burn account** (deflationary; reduces STOA supply slightly with each registration)
   - **Mnemosyne operator account** (operator revenue stream)
   - **Community treasury account** (multi-sig controlled by ecosystem stakeholders)
   - **DAO governance account** (if/when Stoa has on-chain governance)
   This is a values-question, not a security one — pick based on the project's economic model.

7. **Stoa-chain token module name** — the StoicTag fee mechanism uses `coin.transfer` as a placeholder. On Kadena this is the native token module; on Stoa it might be named differently (`stoa`, `stoa-coin`, `stoa-token`, etc.). Implementer: confirm the correct module name and update the references in `STOICTAG-ACCOUNT-OWNER` capability + `register-stoictag` function.

8. **StoicTag release cooldown** — currently no cooldown between release and re-registration. If griefing emerges (e.g., snipers releasing and re-claiming popular names), add a cooldown (e.g., 30 days) where the released name cannot be re-registered. Defer until needed.

9. **Row deletion semantics** — `release-stoictag` calls `(delete-row ...)`. Confirm the Pact version on Stoa supports this. If not, use whichever row-removal idiom that version provides.

**Items locked since first handoff draft** (no implementer action needed):
- Apollo glyph validation is OUT of Pact (handled off-chain by dalos-crypto primitives + ADMIN gate)
- `rotate-codex-guard` requires BOTH old AND new guard signatures (implemented in §5.2)
- `validate-arweave-tx-id` is the standard Arweave format (43 chars, base64url charset) — full validation required, not length-only
- StoicTag table design — locked: single glyph `§` for all (display only, not stored), one tag per account address, cost-gated (not admin-gated) registration, anyone can register, account must be activated, account-guard-based release authority, **codex-agnostic on chain (no codex reference stored)**

---

## 11. Where to send the finished module

- Module: `Mnemosyne/contracts/mnemosyne-codex.pact`
- Tests: `Mnemosyne/contracts/tests/*.repl`
- Deployment script: `Mnemosyne/contracts/deploy/deploy-mnemosyne-codex.repl`
- Implementer notes: `Mnemosyne/docs/handoffs/01-mnemosyne-codex-pact-module-NOTES.md` covering any deviations from this handoff, with rationale.

Open a PR (or commit to a feature branch) and tag the Mnemosyne owner for review before deploying to Stoa testnet.

---

## 12. References

- `Mnemosyne/docs/v0.1-design.md` §3.4 — cloud storage architecture (3-layer model)
- `Mnemosyne/docs/v0.1-onboarding-and-modes.md` — 4 modes + 3 onboarding paths + 3 wizard primitives + double-Apollo CodexID + cosign model
- `stoa-js/packages/ouronet-codex/docs/v0.3.0-design.md` — codex package design (IPrimePureKey predecessor design that became CodexGuard)
- Kadena Pact docs: https://docs.kadena.io/build/pact
- Arweave tx-id format reference: https://docs.arweave.org/developers/server/http-api (43-char base64url)
