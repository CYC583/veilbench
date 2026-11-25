# VeilBench — Multimodal Zero-Leak Hybrid AI Document Auditor & Negotiation Workbench

> **Tagline (Devpost Short Description, <= 200 chars):**  
> Freelancers get expert AI review of contracts and quote scans without handing over client names, SSNs or bank details: Gemini Nano tokenizes on-device, Cloud Gemini reasons over tokens, the browser does the math.

---

## Inspiration

**Who it is for:** freelancers and small studios reviewing a client's contract and quote before signing. They are exactly the people who paste a Master Services Agreement and a scanned Schedule B into a cloud chatbot to catch payment traps—and with it, their client's identity, their own SSN, and the bank account they want to get paid on.

The same airlock also protects clinical lab panels and SaaS renewal notices (both included as one-click samples), but the core story is one person, two documents, and a signature they should not give yet.

**Why this matters (sourced):**
- In an analysis of 22.46 million enterprise GenAI prompts, Harmonic Security found 579,113 sensitive-data exposures; legal discourse alone accounted for 22.3% of them ([Harmonic Security, Jan 15 2026](https://www.harmonic.security/resources/what-22-million-enterprise-ai-prompts-reveal-about-shadow-ai-in-2025)).
- Cyberhaven reports that 39.7% of AI interactions involve sensitive data ([Cyberhaven AI Adoption & Risk Report 2026](https://www.cyberhaven.com/resources/research/ai-adoption-risk-report-2026)).
- 59% of small businesses have at least some invoices overdue by 30+ days, and those with unpaid invoices are owed $17.7K on average—payment terms are exactly what freelancers need to check before signing ([Intuit QuickBooks 2026 Late Payments Report](https://quickbooks.intuit.com/r/small-business-data/small-business-late-payments-report-2026/)).
- The global average cost of a data breach reached $4.99 million in 2026 ([IBM, Jul 29 2026](https://newsroom.ibm.com/2026-07-29-ibm-study-one-in-four-malicious-breaches-are-ai-enabled,-costing-companies-6-million-on-average)).

We realized this problem **can only be solved by Hybrid AI**:
- **Cloud-only AI fails on privacy, cost, and offline reliability.** You should never upload raw SSNs, unredacted scans, or leaked API keys to the cloud just to get a document reviewed—and you shouldn't lose access to rapid risk triage when reviewing a contract on a flight.
- **On-device-only AI fails on deep, multi-document reasoning.** Chrome's built-in Gemini Nano is fast, free, and 100% private, but its smaller context window and single-turn focus cannot reliably cross-reference a multi-page Master Services Agreement against an attached quote scan, synthesize surgical redline diffs, and run multi-turn negotiation coaching.

Existing privacy-wrapper demos only do naive text search-and-replace (`[PII_1]`) on single text documents—leaving scanned images unprotected, breaking cross-document entity relationships, and offering no cryptographic proof that a leak didn't slip through. We built **VeilBench** to turn Hybrid AI into a verifiable, clinical-grade **Zero-Leak Document Auditor & Negotiation Workbench**.

---

## What it does

**VeilBench** orchestrates a strict 4-stage Hybrid AI pipeline through **Firebase AI Logic (`firebase/ai` v12.5+)** so raw PII never leaves the browser while Cloud Gemini still delivers expert-level legal, clinical, and financial reasoning:

1. **Multimodal 3-Layer Local Privacy Airlock (`ONLY_ON_DEVICE`)**
   - **Layer 1 (Semantic On-Device AI):** Chrome Gemini Nano (`InferenceMode.ONLY_ON_DEVICE`) scans both text and JPEG/PNG document images locally to identify contextual sensitive entities (parties, names, organizations, medical conditions) and assigns **Semantic Role Aliases** (`[PARTY_CLIENT_1]`, `[PARTY_CONTRACTOR_1]`, `[MONEY_AMOUNT_1]`).
   - **Layer 2 (Local Deterministic Shield):** A millisecond regex/pattern engine catches structured identifiers (emails, phones, SSNs, TW National IDs, MRNs, IBANs, credit cards, currency values, and leaked `AIza...` / `sk-...` API keys) plus contextual rules for defined parties (`Northstar Ventures LLC ("Client")`), labeled people and street addresses, calendar dates and document numbers—so the airlock still works on a non-Nano browser. This is defense-in-depth with a verifiable boundary, not a promise that no detector can ever miss free-form text (see `SECURITY.md` → Known limitations).
   - **Visual Pixel Burn-In Redaction (HTML5 Canvas):** For uploaded or sample PNG/JPEG scans, VeilBench physically burns opaque charcoal blocks with semantic labels directly into the image pixels on-device, generating an irreversible safe PNG before any cloud call.
   - **Cross-Document Shared Local Vault:** Entities stay consistent across multiple documents in the same workspace (e.g., `"Elena Rostova"` maps to `[PARTY_CONTRACTOR_1]` in both the MSA contract and the attached Quote PNG), enabling true **cross-document contradiction detection** with zero raw PII leaving RAM.

2. **Offline-First Rapid Risk Triage (`PREFER_ON_DEVICE` + Firestore `persistentLocalCache`)**
   - Runs locally on Chrome Gemini Nano even with Wi-Fi completely disconnected, producing red/amber/green risk flags and plain-language clause explanations.
   - Persists strictly **Zero-PII** session snapshots to **Cloud Firestore** with `persistentLocalCache`, writing immediately offline and syncing automatically on reconnect.

3. **Human-in-the-Loop Privacy Gate, Layer 3 Pre-Flight Circuit Breaker & SHA-256 Proof**
   - Users inspect a side-by-side **Split-Pane Diff** (Raw Local vs. Sanitized Safe Payload + Raw Scan vs. Pixel-Burned Scan) and can toggle individual redaction chips.
   - Immediately before any cloud request, a pure-function **Layer 3 Pre-Flight Guard** scans the outbound payload. If any raw Vault value or high-risk pattern (email, SSN, IBAN, API key) remains, **cloud escalation is hard-blocked** with an explicit leak report.
   - The **Live Payload Inspector** displays the exact bytes and pixel-burned thumbnails cleared for Cloud Gemini alongside a **Web Crypto SHA-256 Zero-Leak Boundary Proof** (`rawContentHash` vs. `sanitizedPayloadHash`).

4. **Cloud Deep Escalation (`PREFER_IN_CLOUD` + App Check) & On-Device Re-hydration Action Kit**
   - Cloud Gemini audits the sanitized multi-document bundle to catch **Cross-Document Contradictions** (e.g., MSA states `$48,000 USD` Net-15 with 50% deposit while Schedule B Quote PNG states `$42,000 USD` Net-90 with a `$1,500/day` penalty), generates **Interactive Redline Diffs**, builds a **Negotiation Playbook** with counterparty pushback scripts, and supports **Multi-Turn Follow-Up Chat** (auto-redacting user prompts locally).
   - Back in the browser, VeilBench re-hydrates real names and figures locally so users can copy a **Ready-to-Send Negotiation Email** in one click, export a **Zero-PII Markdown Audit Report**, or toggle **On-Device Semantic Translation (`EN` ↔ `繁體中文`)** via `PREFER_ON_DEVICE`.

5. **Split-Knowledge Reasoning (the part only Hybrid can do)**
   - Tokenizing amounts and dates normally blinds the cloud: it sees `[MONEY_AMOUNT_1]` and `[MONEY_AMOUNT_3]` and cannot tell which is larger. VeilBench computes **relations on-device** (`[MONEY_AMOUNT_1] > [MONEY_AMOUNT_3], difference 5–15%`; `[SENSITIVE_DATE_1] is before [SENSITIVE_DATE_2]`) and sends only those value-free hints.
   - Cloud Gemini can then reason about the fee conflict and write `{{DIFF:[MONEY_AMOUNT_1]-[MONEY_AMOUNT_3]}}`; the browser replaces it locally with the exact `$6,000 (12.5%)`. *The cloud reasons over tokens and relations; your device holds the facts and does the math.*

6. **Cloud Resilience Without Leaking Internals**
   - Every cloud call goes through bounded exponential backoff on 429 / 5xx / timeouts, then fails over through a Remote Config model list (`cloud_model_fallbacks`). App Check rejections are never retried.
   - Stage 4 runs as two short parallel calls (analysis; playbook + email) over the same verified envelope, so one overloaded generation never blanks the whole audit.
   - For the built-in samples only, if every live model fails, VeilBench shows a **recorded real** Stage 4 result with an amber `CACHED DEMO RESULT · model · date` badge and keeps the Retry action—never a silent or fabricated substitute.
   - Failures render an inline retry card (the workbench never disappears) and are logged in the Inference Log with status, model and error kind—never the raw endpoint URL.

7. **Judge-friendly controls**
   - **Guided demo** runs Stage 1 → 4 with captions in ~30 seconds; **Draw redaction box** lets users burn anything the detectors missed on a scan; **Verify yourself** copies the exact payload so its SHA-256 can be checked with `shasum`; **Try to leak** un-redacts a token to watch Layer 3 block the cloud.
   - Remote Config `routing_policy` (e.g. `{"medical":"on_device_only"}`) keeps a document category on-device and forbids cloud fallback, shown as "Policy: medical → on-device only".
   - Full Traditional Chinese UI toggle; English stays the default.

8. **Hybrid AI X-Ray Telemetry Drawer**
   - Displays live, non-fabricated runtime telemetry from every inference call (`inferenceSource`: `ON_DEVICE` vs. `IN_CLOUD` vs. `LOCAL_DETERMINISTIC`, latency in `ms`, cloud calls saved, **Firebase App Check** verification status, **Firebase Remote Config** routing thresholds, the **Local Shared Vault**, and the exact **Cloud Firestore Zero-PII Document JSON**).

---

## How we built it

- **Frontend & Design System:** React 19, TypeScript (strict), Vite 6, Tailwind CSS v4, and `lucide-react`. Visual architecture follows a Swiss clinical security workbench aesthetic (`.stitch/DESIGN.md`) with zero decorative clutter and real runtime telemetry.
- **Firebase Full-Ecosystem Architecture (6 Services):**
  1. **Firebase AI Logic (`firebase/ai` v12.5+ with `GoogleAIBackend`):** Orchestrates all three inference modes (`ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, `PREFER_IN_CLOUD`), reads `response.inferenceSource` for real-time telemetry, and handles multimodal JPEG/PNG + JSON Structured Output.
  2. **Firebase App Check (reCAPTCHA Enterprise, limited-use tokens):** Protects Firebase AI Logic with replay-protection-ready tokens; the X-Ray bar shows "Verified" only after a real `getToken()` exchange succeeds.
  3. **Cloud Firestore (`persistentLocalCache` + `persistentMultipleTabManager`):** Stores strictly Zero-PII audit sessions scoped by strict `firestore.rules` per anonymous UID, operating smoothly offline and syncing automatically online.
  4. **Firebase Remote Config:** Dynamically controls `max_on_device_chars`, `cloud_model_name`, the `cloud_model_fallbacks` chain and `strict_pii_block_enabled`; the X-Ray Remote Config tab shows each value's source and can refetch live.
  5. **Firebase Authentication (Anonymous Auth):** Zero-friction judge and user onboarding with isolated per-user Firestore history.
  6. **Firebase Hosting:** Production HTTPS deployment with split vendor chunks.
- **Pure-Function Core Privacy Engine (`src/core/`):** Decoupled from React and Firebase SDKs for deterministic reliability and full testability:
  - `hybridRouter.ts` — Pure-function adaptive router + paragraph/sentence-aware chunking (`splitIntoLocalChunks`).
  - `piiShield.ts` — Layer 2 deterministic scanner, defensive Gemini Nano JSON parser, Cross-Document Shared Vault, and local re-hydrator.
  - `preFlightGuard.ts` — Layer 3 hard circuit breaker (`assertPayloadZeroLeak`).
  - `proofGenerator.ts` — Web Crypto API SHA-256 proof generator.
  - `canvasRedactor.ts` — HTML5 Canvas pixel-level burn-in redaction engine.

---

## Challenges we ran into

1. **Handling On-Device Gemini Nano JSON Drift:** Lightweight on-device models occasionally wrap JSON in markdown fences, add trailing prose, or emit malformed commas. We engineered a defensive parser (`parseNanoEntitiesDefensive`) paired with our Layer 2 deterministic scanner so Stage 1 never crashes or leaks even if Nano returns malformed text.
2. **Preventing Subtle Cross-Document & Substring Leaks:** Naive string replacement fails when a shorter token (`"Elena"`) replaces part of a longer entity (`"Elena Rostova"`), or when a user manually disables a redaction chip. We solved this with descending length-sorted replacement, regex escaping, shared vault deduplication, and an independent Layer 3 Pre-Flight regex sweep that blocks cloud escalation even if a user accidentally unchecks a high-risk identifier.
3. **Graceful Degradation Across Browsers & Offline Transitions:** Not every reviewer or user has Chrome 139+ with Gemini Nano flags enabled. Our adaptive router cleanly falls back to the Layer 2 Local Deterministic Shield for PII redaction and Firebase AI Logic cloud routing when online, while preserving true offline execution when Nano is available.
4. **Cloud Model Deprecation & Endpoint Resilience:** During integration testing, we encountered model deprecation (HTTP 404) on older defaults. Because we externalized `cloud_model_name` into **Firebase Remote Config**, we can update the active Gemini cloud model dynamically without shipping a new frontend build.

---

## Accomplishments that we're proud of

- **157 Automated Core Tests Passing (Vitest):** Coverage across `hybridRouter`, `piiShield`, `preFlightGuard`, `proofGenerator`, `canvasRedactor`, `cloudResilience`, `relationalHints`, `outboundEnvelope`, the recorded demo cache and zh-TW runtime messages—including a reverse test that re-injects every raw value from every sample pack and asserts Layer 3 blocks it, and a test that the SHA-256 proof equals the hash of the exact Stage 4 payload.
- **Zero-Setup Evaluation Bundles with Client-Side Generated PNG Scans:** Judges can test multimodal pixel burn-in redaction and cross-document contradiction detection in one click—no need to hunt for test files or risk uploading their own private documents.
- **Verifiable Privacy, Not Just Promises:** Between the Split-Pane Diff, HTML5 Canvas pixel redaction, Layer 3 Circuit Breaker, Live Payload Inspector, SHA-256 Proof, and Firestore Zero-PII JSON viewer, every privacy claim can be audited live inside the app.

---

## What we learned

- Designing for **Hybrid AI** requires treating the on-device/cloud boundary as a first-class architectural primitive—not an afterthought. Explicitly modeling `RouterContext` → `RouterDecision` as a pure function made offline behavior, chunking, and security gates deterministic and testable.
- Pairing **Firebase AI Logic** with **Firestore `persistentLocalCache`** and **Remote Config** unlocks genuine local-first AI apps that remain useful offline while staying centrally governable in production.

---

## What's next for VeilBench

- **Interactive Canvas Region Drawing:** Allow users to draw or resize custom redaction bounding boxes directly on uploaded scans before pixel burn-in.
- **Client-Side PDF Multi-Page Extraction:** Parse multi-page PDFs locally into per-page text + rendered canvases for full-contract bundles.
- **Enterprise Policy Packs via Remote Config:** Organization-managed redaction rule packs (HIPAA, GDPR, SOC2) pushed live through Firebase Remote Config.
- **Signed Audit Certificates:** Exportable JSON/PDF zero-leak compliance receipts linking the SHA-256 boundary proof to each cloud audit session.

---

## Built With

- `Firebase AI Logic` (`firebase/ai` v12.5+ Hybrid Inference)
- `Chrome Built-in AI` (`Gemini Nano`)
- `Gemini` (Cloud Multimodal & Structured Output)
- `Firebase App Check` (`reCAPTCHA Enterprise`)
- `Cloud Firestore` (`persistentLocalCache`)
- `Firebase Remote Config`
- `Firebase Authentication` (Anonymous Auth)
- `Firebase Hosting`
- `React 19`, `TypeScript`, `Vite`, `Tailwind CSS v4`, `Vitest`, `HTML5 Canvas`, `Web Crypto API`

---

## Links & Verification (Fill before final submit)

- **Live Demo URL (Firebase Hosting):** `https://veilbench-hybrid-ai.web.app/`
- **Public GitHub Repository (Apache-2.0):** `https://github.com/CYC583/veilbench`
- **YouTube Demo Video (< 3 min, Public, English):** `https://youtu.be/<your-video-id>`
## Built during the submission period

- All application code in this repository—the hybrid router, 3-layer privacy airlock, Canvas burn-in, Layer 3 circuit breaker, Split-Knowledge Reasoning, cloud resilience layer and the React workbench—was written after **November 11, 2026** for `#BuildHybridAI`.
- The Firebase project ID (`petmemo-*`) is a reused, previously unrelated Firebase project; no code from it is included in this repository.
- **AI coding assistants disclosure:** development used Google Antigravity, OpenAI Codex and Anthropic Claude as coding assistants. All runtime AI inference in the app goes exclusively through Firebase AI Logic.

## Cost-aware by design

Teams adopting AI review want the best result for the least spend. VeilBench treats the cloud as the expensive, last-resort tier:

- **Local first, at zero marginal cost.** PII detection, pixel burn-in, the Layer 3 breaker, SHA-256 proofs, re-hydration and all money/date arithmetic run in the browser. Rapid triage runs on Gemini Nano when available.
- **Only tokens and relations go out.** The sanitized envelope is shorter than the raw documents, and the device—not the model—computes exact differences (`{{DIFF:...}}`), so the cloud never spends tokens re-deriving numbers.
- **Cheapest capable model by default.** `gemini-3.5-flash-lite` is primary; larger models are used only on failure, and the whole chain is swappable live through Remote Config without a redeploy.
- **No wasted retries.** Stage 4 is split into two short calls; a failed half is retried alone instead of re-running the whole audit, exhausted quota fails over instead of hammering the same model, and App Check rejections are never retried.
- **Policy before spend.** Remote Config `routing_policy` can keep a document category on-device only, so sensitive categories never generate cloud usage at all.
- **Measured, not estimated.** The X-Ray Inference Log records the real metered tokens of every cloud call (`usageMetadata`) next to the count of steps that ran locally. We do not convert this into dollar figures in the app.

## How we use Firebase AI Logic

| Feature | InferenceMode | Why |
| :--- | :--- | :--- |
| Stage 1 PII scan (text + image) | `ONLY_ON_DEVICE` (schema-constrained via `responseConstraint`) | Raw documents must never reach any server |
| Stage 2 rapid triage | `PREFER_ON_DEVICE` | Instant and offline on Nano; falls back to cloud on the sanitized payload |
| Stage 4 cross-doc audit | `PREFER_IN_CLOUD` + `responseSchema` | Long-context, multi-document reasoning on tokens and relations only |
| Follow-up chat | `PREFER_IN_CLOUD` (streaming) | Multi-turn chat is not supported on-device |
| EN → 繁中 translation | `PREFER_ON_DEVICE` | Cheap, local-first convenience |

## Testing instructions

- No login required (anonymous auth). No API keys or debug tokens are needed by judges.
- Recommended: Chrome Desktop 139+ with Gemini Nano enabled (see README). Without Nano you will see "Stage 2 · Rapid Triage (Cloud Fallback)" and `LOCAL_DETERMINISTIC` / `IN_CLOUD` sources—this is the designed graceful degradation, not an error.
- Start with **Contract + Quote Scan**, toggle a token off to watch Layer 3 block the cloud, re-enable it, open **Inspect Payload & Proof**, then run Stage 4.
