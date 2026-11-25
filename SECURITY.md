# Security Architecture & Zero-Leak Guarantees

VeilBench is engineered around a single security invariant: **raw Personally Identifiable Information (PII), financial account numbers, clinical identifiers, and API secrets must never leave the user's browser—neither to Cloud LLMs nor to Cloud Firestore.**

This document details VeilBench's defense-in-depth architecture, threat model, cryptographic verification boundary, and Firebase security controls.

---

## 1. Threat Model & Trust Boundaries

| Boundary | Trust Level | Permitted Data | Strictly Prohibited Data |
| :--- | :--- | :--- | :--- |
| **Browser Local Sandbox** | Trusted (User Device) | Raw document text, raw JPEG/PNG scans, `VaultMap` (`byOriginal` / `byToken`), local re-hydrated emails | N/A (all raw data stays in volatile browser memory) |
| **On-Device Gemini Nano (`ONLY_ON_DEVICE`)** | Trusted (Local Chrome Process) | Raw document text & local JPEG/PNG scans for Stage 1 PII extraction | Any network egress |
| **Cloud Gemini (`PREFER_IN_CLOUD` via Firebase AI Logic)** | Untrusted for Raw PII | Role-aliased sanitized text (`[PARTY_CLIENT_1]`, `[BANK_ACCOUNT_1]`) and pixel-burned PNGs only | Raw names, emails, SSNs, IBANs, MRNs, API keys, unredacted scans |
| **Cloud Firestore (`sanitized_sessions`)** | Untrusted for Raw PII | Sanitized excerpts, SHA-256 proof hash, triage/audit JSON, anonymous `uid` | `rawText`, `rawImageDataUrl`, `VaultMap`, unredacted PII |

---

## 2. The 3-Layer Zero-Leak Privacy Airlock

Relying solely on a small on-device language model for PII detection introduces recall risk (a lightweight model may occasionally miss a structured identifier or emit malformed JSON). VeilBench mitigates this with three independent layers:

### Layer 1 — Semantic Context Extraction (`ONLY_ON_DEVICE` Gemini Nano)
- Invoked via `firebase/ai` with `InferenceMode.ONLY_ON_DEVICE`, guaranteeing zero network transmission even if the local model is unavailable.
- Extracts contextual entities that regular expressions cannot reliably classify (e.g., counterparty roles, person names, organization names, clinical conditions, unstructured street addresses).
- Output is parsed through `parseNanoEntitiesDefensive()` (`src/core/piiShield.ts`), which repairs markdown fences, trailing prose, and trailing commas without ever throwing on malformed output.

### Layer 2 — Deterministic Local Scanner & Cross-Document Shared Vault
- `scanDeterministicPii()` runs synchronously inside the browser with zero network dependency, detecting:
  - Emails (`EMAIL`)
  - Phone numbers across US, international, and Taiwan formats (`PHONE`)
  - Government & document IDs: US SSNs, Taiwan National IDs, Passport/Invoice patterns (`ID_NUMBER`) and clinical MRNs (`MEDICAL_ID`)
  - Financial identifiers: IBANs, routing/account numbers, 16-digit card numbers (`BANK_ACCOUNT`), and currency amounts (`MONEY_AMOUNT`)
  - Network/secret tokens: IPv4 addresses (`OTHER_PII`), DOB patterns (`SENSITIVE_DATE`), and API keys (`AIza...`, `sk-...`, `ghp_...` as `SECRET_KEY`)
- **Prototype-Pollution Safe Vault**: `createEmptyVault()` initializes `byOriginal` and `byToken` with `Object.create(null)`, preventing keys like `__proto__` or `constructor` from corrupting vault lookups.
- **Overlap-Safe Substitution**: `locate()` tracks occupied character ranges with a `Uint8Array` and claims longest spans first against the original buffer, preventing nested-token corruption or `$`-replacement injection.
- **Cross-Document Consistency**: Identical entities across multiple uploaded files reuse the same deterministic semantic role alias (e.g., `[PARTY_CONTRACTOR_1]`), enabling cross-document contradiction auditing without revealing real identities.

### Layer 3 — Pre-Flight Leak Assertion Circuit Breaker (`src/core/preFlightGuard.ts`)
- Executes immediately before **any** Cloud Gemini escalation or follow-up chat dispatch.
- Performs two independent checks:
  1. **Vault Original Lookup**: Verifies no active `originalValue` from the local `VaultMap` remains in the outbound payload (case-insensitive for names/emails of length `>= 4`, ignoring valid VeilBench `[ROLE_N]` aliases).
  2. **Independent Format Check**: Even if a user manually toggles off a redaction chip in the UI, `assertPayloadZeroLeak()` independently scans the outbound payload for raw emails, bank accounts/IBANs/cards, API keys, and US SSNs.
- When `strictPiiBlockEnabled` is `true` (default via Firebase Remote Config), any failure (`preFlight.passed === false`) **hard-blocks** the cloud request at both the UI gate and the routing layer (`decideHybridRoute`).

---

## 3. Pixel-Level Visual Burn-In Redaction (`src/core/canvasRedactor.ts`)

Masking images with CSS overlays or reversible metadata is insufficient because raw pixels remain in the file sent to multimodal cloud models.

- VeilBench loads sensitive JPEG/PNG scans onto an offscreen HTML5 `<canvas>` at native resolution (`naturalWidth × naturalHeight`).
- Each detected sensitive bounding box is clamped to `[0, 1]`, expanded by a `4px` safety margin, and overwritten with solid `#141518` pixels plus a high-contrast monospace role label (`#F8F9FA`).
- The resulting `canvas.toDataURL('image/png')` physically destroys the underlying sensitive pixels before attachment to any `firebase/ai` multimodal request.

---

## 4. Cryptographic Zero-Leak Proof (`src/core/proofGenerator.ts`)

For every sanitization boundary, VeilBench computes a verifiable **SHA-256 Zero-Leak Proof** using the browser's native Web Crypto API (`crypto.subtle.digest('SHA-256', ...)`):

- `rawContentHash`: SHA-256 digest of the local raw documents (never sent with raw text).
- `sanitizedPayloadHash`: SHA-256 digest of the exact sanitized payload approved for cloud escalation.
- `vaultEntriesCount` & `preFlightPassed`: Auditable metadata displayed in the **Live Payload Inspector** and persisted alongside the Zero-PII Firestore record.

---

## 5. Firebase Security Controls

### Exclusive Firebase AI Logic Routing
- **100% of generative AI calls** go through the official Firebase JS SDK (`firebase/ai`). No third-party AI SDKs (`openai`, `@anthropic-ai/sdk`, `@google/genai`) or direct HTTP API calls exist anywhere in `src/`.

### Firebase App Check
- Cloud-bound Firebase AI Logic and Firestore requests are protected by **Firebase App Check** (`ReCaptchaEnterpriseProvider` in production) with automatic token refresh.
- Firebase AI Logic uses **limited-use App Check tokens** (`useLimitedUseAppCheckTokens: true`) so replay protection can be enforced in the Console.
- The UI reports "Verified" only after a real `getToken()` exchange succeeds; the token itself is never logged or rendered.
- Production deployments keep `VITE_APP_CHECK_DEBUG_TOKEN=false`.

### Cloud Firestore Security Rules (`firestore.rules`)
- **Strict Per-UID Isolation**: Only the authenticated anonymous user (`request.auth.uid`) can read, create, update, or delete their own `sanitized_sessions/{sessionId}` documents.
- **Field Allowlist (not a blocklist)**: `validSession()` accepts only the 10 known sanitized-session fields with type and size limits, so a renamed raw field cannot slip through. All other collections are denied by default (`allow read, write: if false`).
- **Client-side gate**: sessions (including document titles, which are tokenized) are written only after the Layer 3 pre-flight passes. Writes are non-blocking so offline runs never stall.
- **Offline Persistence**: Configured with `persistentLocalCache` so sanitized triage results remain accessible offline without storing the `VaultMap` in Firestore.

### Credential Hygiene
- All Firebase client configuration keys and App Check site keys are loaded exclusively via Vite environment variables (`import.meta.env.VITE_*`).
- `.env`, `.env.local`, `.env.*.local`, `*.pem`, `*.key`, and `serviceAccountKey*.json` are excluded in `.gitignore`.

---

## 6. Known Limitations & Hardening Roadmap

1. **Detection is defense-in-depth, not omniscience**: Layer 2 contextual rules catch defined parties, labeled people, organizations with legal suffixes, labeled/US street addresses, calendar dates and document numbers. A bare name in free-form prose with no context (e.g. "ask Jane about it") can still be missed when Gemini Nano is unavailable. Layer 3 independently hard-blocks emails, bank accounts, secrets, SSNs / TW national IDs, MRNs, phones, dates and addresses even when a chip is untoggled.
2. **User-uploaded images**: text checks cannot see pixels. Uploaded images stay on-device (Layer 3 blocks escalation) until the user confirms the burned preview; boxes reported by Gemini Nano are burned automatically.
3. **Volatile Vault Lifecycle**: The local `VaultMap` lives strictly in browser memory and is destroyed when the tab closes or the user clicks **New Workspace**, minimizing local-at-rest exposure.

---

## 7. Reporting a Vulnerability

If you discover a privacy leak, bypass in the 3-Layer Airlock, or security misconfiguration, please open a private security advisory on the repository or contact the maintainer before public disclosure.
