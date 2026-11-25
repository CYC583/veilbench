# VeilBench: Catch the $6,000 Before You Sign

> **Tagline (≤ 200 chars):** Hybrid AI that cross-checks your contract and quote. The cloud reasons on relationships only, your device computes the exact gap, and every byte that left is verifiable.

<!-- Before submitting: remove every line that starts with "TODO". Only measured or sourced numbers may be added. -->

## The decision

Freelancers and small studios sign client contracts and quotes without a lawyer. VeilBench turns two documents into one decision: **sign**, **fix first**, or **walk away**. It shows the exact money the documents disagree on, the clauses to fix, and an email written from you, ready to send.

**Why this matters (sourced):**
- In a Freelancers Union survey of 5,358 US freelancers (July 2015), 71% had trouble collecting payment at some point in their career, and the average freelancer lost **$5,968** in unpaid income in 2014, about 13% of their annual income ([Freelancers Union nonpayment report](https://onlabor.org/wp-content/uploads/2017/05/FU_NonpaymentReport_r3.pdf)).
- In the UK, 31% of freelancers reported completing work and not being paid for it ([IPSE, Late payment within the self-employed sector](https://www.ipse.co.uk/policy/research/financial-wellbeing/late-payment-within-the-self-employed-sector.html)).
- Pasting the documents into a chatbot is not the answer: in 22.46 million enterprise GenAI prompts, Harmonic Security found 579,113 sensitive-data exposures, 22.3% of them in legal content ([Harmonic Security, 2026](https://www.harmonic.security/resources/what-22-million-enterprise-ai-prompts-reveal-about-shadow-ai-in-2025)).

TODO (A8): add measured results from real freelancer tests (time to find the conflict by hand vs with VeilBench, and whether it was found), with the method. Do not add numbers that were not measured.

## Why hybrid is the product

- **Split-Knowledge Reasoning.** The device replaces names and numbers with tokens and computes value-free relations: the cloud sees `[MONEY_AMOUNT_1] > [MONEY_AMOUNT_3] (difference 5–15%)`, never the values. Gemini writes `{{DIFF:[MONEY_AMOUNT_1]-[MONEY_AMOUNT_3]}}`; the browser fills in **$6,000 (12.5%)**. Hiding the numbers usually stops the cloud from reasoning about them; here it can still compare two documents.
- **Parallel hybrid.** The on-device first verdict and the cloud deep audit start together. The decision card shows the first answer and upgrades in place; both timers are on screen.
  - Measured on 2026-11-26: Stage 2 on Gemini Nano (Chrome 158, macOS) took 7.3 s online and 10.8 s offline. In cloud-safe mode (no Nano), the first verdict arrived in 3.7 s and the cross-document audit in 6.6 s on `gemini-3.5-flash-lite`. These are single runs, not averages.
- **Verify it yourself.** Download the exact outbound payload and run `shasum -a 256`; the digest equals the one on screen. A network egress ledger records every request the page sends (host, bytes, SHA-256) and confirms that each AI Logic request carries only text that passed the Layer 3 circuit breaker. Export it all as `veilbench-outbound.json`.
- **Public leak benchmark in CI.** See [`docs/BENCHMARK.md`](https://github.com/CYC583/veilbench/blob/main/docs/BENCHMARK.md).
  TODO (A4): copy the measured caught/missed table here once CI publishes it.

## What it does

1. **On-device airlock.** Gemini Nano (`ONLY_ON_DEVICE`) plus deterministic rules replace parties, people, organizations, addresses, money, dates, IDs, emails, phones, bank details and API keys with tokens. Scanned quotes are redacted at the pixel level on a canvas. One vault is shared across documents, so the same party has the same token in the contract and the quote.
2. **Layer 3 circuit breaker.** Immediately before any cloud call, the exact payload is checked for any vault value or high-risk pattern; if one remains, the request is blocked. **Try to leak** demonstrates this live.
3. **Decision card.** Verdict, exact money gap, clauses to fix, the email, and **Verify what left this device**. The rule behind the verdict is shown on the card.
4. **Cloud deep audit.** Cross-document contradictions, redlines and a negotiation playbook, as two short parallel calls with retry, model fallback (`gemini-3.5-flash-lite` → `gemini-3.6-flash`, both from Remote Config) and a clearly badged recorded result for the built-in samples if every live model fails.
5. **Offline-first.** Stage 2 runs on Nano without a network; Firestore `persistentLocalCache` saves the Zero-PII session and syncs when the connection returns.
6. **Other ways in.** A Chrome extension (right-click **Check with VeilBench**) and WebMCP tools for browser agents, both token-only.

## Hybrid inference, per feature

| Feature | Mode | Why |
| :--- | :--- | :--- |
| PII scan (text + image) | `ONLY_ON_DEVICE` | Raw documents must never leave |
| First verdict | `PREFER_ON_DEVICE` | Fast, works offline |
| Cross-document audit | `PREFER_IN_CLOUD` (tokens and relations only) | Long, multi-document reasoning |
| Follow-up chat | `PREFER_IN_CLOUD`, streaming | Multi-turn; questions tokenized locally first |
| EN → 繁中 translation | `PREFER_ON_DEVICE` | No egress for summaries |
| Exact gap + decision | deterministic, on-device | Numbers never leave |

`window.LanguageModel` is read only for `availability()` (to show setup help); all inference goes through `firebase/ai`. A unit test enforces this.

## Platforms

- **Web (Chrome):** Gemini Nano via Firebase AI Logic; works in any browser in cloud-safe mode.
- **iOS — VeilBench Pocket:** Apple Foundation Models (`.systemModel()`) for on-device extraction, Gemini (`.geminiModel`) for the tokenized audit, both via Firebase AI Logic; App Check with App Attest.
  TODO (A5): state "shown on a real iPhone 18 Pro" only after the device recording exists; otherwise remove iOS from the platform list.

## Firebase services

Firebase AI Logic · App Check (reCAPTCHA Enterprise on web, App Attest on iOS, limited-use tokens) · Remote Config (models, fallback chain, `routing_policy`) · Cloud Firestore (offline cache, Zero-PII records) · Anonymous Auth · Performance Monitoring · Analytics (non-PII events) · Hosting.

## How we built it

React 19, TypeScript, Vite, Tailwind v4 on the web; SwiftUI on iOS. The privacy and routing engine in `src/core/` is pure functions with no UI or SDK dependencies, which keeps it testable: unit tests cover the router, PII shield, Layer 3, relations, the decision rule, the demo cache, the egress ledger and the AI-Logic-only rule; iOS has its own XCTest suite.

## Challenges

- **A masked cloud cannot compare numbers.** Solved with Split-Knowledge Reasoning: relations out, math on-device.
- **Small on-device models drift.** Nano output is schema-constrained and parsed defensively, and the deterministic rules run regardless.
- **Free-tier capacity.** Stage 4 was split into two short calls with per-model output caps, partial retry and a Remote Config fallback chain.
- **Case-sensitive leaks.** Security review found that a short name returned in a different case could miss the vault; every casing found in the text is now vaulted (web and iOS, with tests).

## What we learned

Treat the on-device/cloud boundary as a product decision, not a setting. Once the cloud only sees relations, the device has to own the facts, the math and the final decision, and the user needs a way to check what crossed the boundary.

## What's next

Multi-page PDF extraction on-device, organization policy packs through Remote Config, and signed receipts per audit.

## Built during the submission period

Development started on 2026-11-25, inside the submission period (opened 2026-11-11). The first push to GitHub was on 2026-11-26, and every change since is committed as it is made. AI coding assistants (Google Antigravity, OpenAI Codex, Anthropic Claude) were used during development. All runtime AI inference goes through Firebase AI Logic. The Firebase project ID (`petmemo-*`) is a reused, previously unrelated project; no code from it is in this repository.

## Testing instructions

- No login and no keys needed. Open the live demo and press **Run the 30-second demo**.
- Best experience: Chrome with Gemini Nano enabled (README → Enable Gemini Nano). Without Nano you will see **cloud-safe mode** and `IN_CLOUD` / `LOCAL_DETERMINISTIC` sources; this is the designed behavior.
- Then open **Inspect Payload & Proof**: try **Try to leak**, download `veilbench-outbound.json`, and check the hash with `shasum -a 256`.

## Limitations

Detection is best effort; every outbound byte is shown and checked before sending, and you can draw extra redaction boxes. Not legal advice.

## Links

- Live demo: https://veilbench-hybrid-ai.web.app/
- Repository (Apache-2.0): https://github.com/CYC583/veilbench
- Video (≤ 3 min, English): TODO — YouTube link

## Built With

firebase-ai-logic · gemini · gemini-nano · chrome-built-in-ai · apple-foundation-models · firebase-app-check · cloud-firestore · firebase-remote-config · firebase-authentication · firebase-performance · firebase-hosting · react · typescript · vite · tailwindcss · swiftui · vitest · webmcp
