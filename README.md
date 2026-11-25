# VeilBench — Catch the $6,000 before you sign

**Hybrid AI that cross-checks a client's contract and quote. The cloud reasons on relationships only, your device computes the exact gap, and every byte that left is verifiable.**

[![CI](https://github.com/CYC583/veilbench/actions/workflows/ci.yml/badge.svg)](https://github.com/CYC583/veilbench/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache_2.0-0F766E.svg)](./LICENSE)
[![Firebase AI Logic](https://img.shields.io/badge/Firebase-AI_Logic-B45309.svg)](https://firebase.google.com/docs/ai-logic)

- **Live demo:** https://veilbench-hybrid-ai.web.app/ (no login; press **Run the 30-second demo**)
- **Platforms:** Web (Chrome, Gemini Nano via Firebase AI Logic) and iOS ([VeilBench Pocket](./ios/README.md), Apple Foundation Models via Firebase AI Logic)
- Built for the Firebase **#BuildHybridAI** challenge. Not legal advice; all sample documents are fictional.

---

## The decision

Freelancers and small studios sign client contracts and quotes without a lawyer. VeilBench turns two documents into one decision:

| You give it | You get |
| :--- | :--- |
| A contract (`.txt`) and a scanned quote (`.png`) | **Don't sign yet — fix first**, **OK to sign**, or **Walk away** |
| | The exact money the documents disagree on, e.g. **$6,000 (12.5%)**, computed on your device |
| | The clauses to fix, and an email written from you, ready to send |
| | A receipt: the exact bytes that left, their SHA-256, and a ledger of every network request |

## Why hybrid is the product, not a feature

Masking data before a cloud call blinds the cloud: it sees `[MONEY_AMOUNT_1]` and `[MONEY_AMOUNT_3]` and cannot tell which is bigger. VeilBench uses **Split-Knowledge Reasoning**:

1. **On-device:** names, amounts, dates and IDs become tokens, in the text and in the image pixels. The device also computes value-free relations: `[MONEY_AMOUNT_1] > [MONEY_AMOUNT_3] (difference 5–15%)`.
2. **In the cloud:** Gemini reasons over tokens and relations and writes `{{DIFF:[MONEY_AMOUNT_1]-[MONEY_AMOUNT_3]}}` where an exact number matters.
3. **On-device:** the browser fills in `$6,000 (12.5%)` and applies a transparent rule to reach the decision.

The on-device first verdict (Gemini Nano) and the cloud deep audit **start at the same time**; the decision card shows the first answer and upgrades in place, with both timers visible. Any running step can be cancelled; a cancelled or superseded answer is never shown.

---

## Hybrid inference, per feature (for reviewers and AI-assisted judging)

Every AI call goes through **Firebase AI Logic** (`firebase/ai`). File paths point to the exact call sites.

| Feature | InferenceMode | Why | Where |
| :--- | :--- | :--- | :--- |
| Stage 1 · PII scan (text + image) | `ONLY_ON_DEVICE`, schema-constrained (`responseConstraint`) | Raw documents must never reach a server | `runOnDevicePiiScan` in [`src/services/aiLogicService.ts`](./src/services/aiLogicService.ts) |
| Stage 2 · first verdict (rapid triage) | `PREFER_ON_DEVICE` (`ONLY_ON_DEVICE` offline or in Local Only) | Fast and offline on Nano; cloud fallback gets the sanitized text only | `runRapidTriage` |
| Stage 4 · cross-document audit (2 parallel calls) | `PREFER_IN_CLOUD` + `responseSchema` | Long, multi-document reasoning on tokens and relations | `runDeepRedlineAudit` |
| Follow-up chat | `PREFER_IN_CLOUD`, streaming | Multi-turn chat; questions are tokenized locally first | `runNegotiationChatTurn` |
| EN → 繁中 translation | `PREFER_ON_DEVICE` | Local-first convenience | `translateTextToZhTw` |
| Routing decision | pure function | Online state, Nano status, user mode, Remote Config policy | [`src/core/hybridRouter.ts`](./src/core/hybridRouter.ts) |
| Decision + exact gap | none (deterministic, on-device) | Numbers never leave the device | [`src/core/decisionCard.ts`](./src/core/decisionCard.ts), [`src/core/relationalHints.ts`](./src/core/relationalHints.ts) |
| iOS Stage 1 / cloud audit | `.systemModel()` / `.geminiModel(name:)` | Apple Foundation Models on-device; Gemini for the tokenized audit | [`ios/VeilBenchPocket`](./ios/VeilBenchPocket) |

**About `window.LanguageModel`:** the app reads Chrome's Prompt API global **only** to call `availability()` in `detectChromeNanoStatus`, so it can show setup help when Nano is missing. It never creates a session or prompts the model directly; all inference uses `getGenerativeModel(...)` from `firebase/ai`. This is enforced by a test: [`tests/core/aiLogicOnly.test.ts`](./tests/core/aiLogicOnly.test.ts).

---

## Privacy you can check yourself

- **3-layer airlock.** Layer 1: Gemini Nano finds contextual entities. Layer 2: deterministic rules catch structured identifiers (emails, phones, SSNs, TW IDs, MRNs, IBANs, money, dates, API keys) and defined parties. Layer 3: a pre-flight circuit breaker blocks any request that still contains a vault value or a high-risk pattern.
- **Pixel burn-in.** Sensitive regions of scans are painted over on a canvas before any image leaves; you can also draw boxes by hand.
- **Verify it yourself.** The Payload Inspector shows the exact outbound text. Download it and run `shasum -a 256 veilbench-outbound-payload.txt`; the digest equals the hash on screen. **Try to leak** un-redacts one token so you can watch Layer 3 block the request.
- **Network egress ledger.** Every cross-origin request the page sends is recorded (service, host, bytes, SHA-256; never the body). For AI Logic requests the ledger confirms the body carries text that passed Layer 3. Export everything as `veilbench-outbound.json`.
- **Zero-PII storage you control.** Firestore stores tokens only; `firestore.rules` allows a fixed field list per anonymous user, and you can delete any saved session (or all of them) from History.
- **You can add what the detectors missed.** Type a word (a name, a project code) and it is masked in every document, in every casing, before the outbound check re-runs.
- **Chinese documents too.** Without Nano, the rules also catch 甲方／乙方 parties, labeled Chinese names, company names (股份有限公司…), Taiwanese addresses, 新臺幣 amounts and ROC dates; the exact gap math works on 新臺幣 amounts.

Detection is best effort, which is why every outbound byte is shown and checked before sending. See [SECURITY.md](./SECURITY.md) for the threat model and known limitations.

## Firebase services

| Service | How VeilBench uses it |
| :--- | :--- |
| Firebase AI Logic | All inference: Gemini Nano (web), Apple Foundation Models (iOS), Gemini in the cloud; `inferenceSource` shown per call |
| App Check | reCAPTCHA Enterprise (web) and App Attest (iOS), limited-use tokens for replay protection |
| Remote Config | Cloud model, fallback chain (`gemini-3.5-flash-lite` → `gemini-3.6-flash`), on-device size limit, `routing_policy` (e.g. medical → on-device only); refetch live in the X-Ray drawer |
| Cloud Firestore | `persistentLocalCache`: sessions save offline and sync later; Zero-PII only |
| Authentication | Anonymous sign-in, per-user isolation |
| Performance Monitoring | Custom traces per stage (on-device vs cloud latency) |
| Analytics | Non-PII routing events (source, status, cache use) |
| Hosting | Production site |

## Other ways in

- **Chrome extension** ([`extension/`](./extension)): select text on any page → right-click **Check with VeilBench**. The page receives it through `window.postMessage({ type: 'veilbench.intake.v1' })`, masks it locally, and asks before anything goes to the cloud. Install with `chrome://extensions` → Developer mode → **Load unpacked** → `extension/`.
- **WebMCP tools** (Chrome origin trial): `veilbench_check_contract` and `veilbench_get_decision`. Results contain tokens only; exact amounts are shown to the user on-device and never returned to an agent. Source: [`src/integrations/agentSurface.ts`](./src/integrations/agentSurface.ts).
- **Files:** PDF (text extracted on-device with pdf.js; scanned PDFs become an image for pixel redaction), Word `.docx`, text, PNG and JPEG, up to 20 MB. Phone photos are scaled to 2000 px before redaction. Nothing is uploaded at this step.
- **From iPhone:** VeilBench Pocket shares a link (`…/#relay=<128-bit id>`). Opening it on the web shows the iPhone's token-only audit. The ID lives only in the URL fragment, which is never sent to a server, and the page strips it from the address bar before Firebase or Analytics load; the link expires and the real values stay on the phone.
- **iOS:** see [`ios/README.md`](./ios/README.md).

## Leak benchmark

A fixed set of fictional documents with known identifiers runs in CI and reports what was caught and missed for rules only, rules + Layer 3, and Nano + rules. Results: [`docs/BENCHMARK.md`](./docs/BENCHMARK.md).

---

## Run it

Requirements: Node.js 20+, npm 10+, and a Firebase project with AI Logic (Gemini Developer API), Anonymous Auth, Firestore, Remote Config and App Check.

```bash
npm install
cp .env.example .env.local   # fill in your Firebase web config; never commit it
npm run dev
```

```bash
npm run verify               # typecheck + unit tests + production build
```

```bash
firebase deploy --only firestore:rules,hosting
```

For App Check during local development set `VITE_APP_CHECK_DEBUG_TOKEN=true`, register the printed debug token in the Firebase Console, and keep it `false` in production builds.

### Enable Gemini Nano in Chrome

Tested on Chrome 158 (macOS). Without Nano the app runs in **cloud-safe mode**: masking uses local rules and the quick check runs in the cloud on tokens only.

1. `chrome://flags/#gemma4-for-built-in-ai` → **Enabled**
2. `chrome://flags/#prompt-api-for-gemini-nano` → **Enabled**
3. `chrome://flags/#prompt-api-for-gemini-nano-multimodal-input` → **Enabled**
4. Relaunch Chrome. The model downloads in the background (about 6 minutes in our test); the header then shows **Gemini Nano Ready**.

## Project structure

```text
src/
├── core/           # Pure functions: router, PII shield, Layer 3, relations, decision card, proofs
├── services/       # Firebase AI Logic calls, Firestore sessions, egress ledger
├── integrations/   # Chrome extension intake + WebMCP tools
├── state/          # Workbench store: stages, parallel hybrid run, cache fallback
├── components/     # UI
└── data/           # Fictional sample bundles and recorded demo results
ios/                # VeilBench Pocket (SwiftUI + Firebase AI Logic)
tests/              # Vitest unit tests and Firestore rules tests
```

## Built during the submission period

Development started on **2026-11-25**, inside the submission period (which opened on 2026-11-11). The first push to GitHub was on 2026-11-26, and every change since is committed as it is made, so the history shows the real order of work (decision card, parallel hybrid, egress ledger, iOS app, security fixes). AI coding assistants (Google Antigravity, OpenAI Codex, Anthropic Claude) were used for development; runtime inference uses Firebase AI Logic only.

## License

Apache License 2.0. See [LICENSE](./LICENSE).
