# Public Leak Benchmark

Measured on **2026-11-26 05:18 (Taipei / 2026-11-25 21:18 UTC)** across **20 fictional English documents** containing **50 labeled sensitive values**. On the same corpus, deterministic rules alone masked **34/50** values; adding Chrome on-device **Gemini Nano** masked **44/50**. Six documents still exposed one value each in Nano + rules mode.

| Mode | Masked or blocked by circuit breaker | Still present in sendable prompt | Blocked requests |
| :--- | ---: | ---: | ---: |
| Rules only | 34 / 50 | 16 / 50 | — |
| Rules + Layer 3 | 34 / 50 | 16 / 50 | 0 / 40 |
| Gemini Nano (on-device) + rules | **44 / 50** | 6 / 50 | — |

Each labeled value is scored once per document. The scorer builds the exact `analysis` and `playbook` prompts used by the production app and checks for exact-string exposure (case-insensitive). If either sendable prompt still contains the original labeled value, it is counted as leaked. The second mode runs the production Layer 3 circuit breaker with that document's local vault; none of the 40 requests tripped a hard block on this corpus, so its count matches rules-only. This benchmark covers exact-string exposure in text only; partial exposure, semantic re-identification, images, false-positive rate, and other languages require separate evaluation.

The Nano column calls the production Stage 1 Firebase AI Logic on-device scanner from the browser. All 20 runs reported `Actual Source = ON_DEVICE` with `0` cloud calls and a combined SDK-recorded latency of **33,511 ms**. The six documents that still exposed one value each were `lease`, `referral`, `follow-up`, `transfer`, `itinerary`, and `memo`. The corpus uses fictional names, reserved `.example` domains, documentation IP ranges, and fictional numbers, with outbound connections restricted on the benchmark page.

## Reproduce

1. In the repository, run `npm ci` and `npm run bench`. Node re-runs the rules and Layer 3 columns, then verifies the corpus hash, document IDs, `ON_DEVICE` source, and score bounds recorded from Chrome.
2. In Chrome with a local Firebase Web config and Gemini Nano ready, run `npm run dev`, open `/bench/nano.html`, and click **Run on-device benchmark**.
3. Once all 20 documents finish, download the result to `bench/nano-result.json` and re-run `npm run bench`. If any row falls back to another inference source, the benchmark aborts. CI verifies the dated Chrome record checked into the repository.

[20-document labeled corpus](../bench/corpus.mjs) · [Scoring implementation](../bench/score.mjs) · [Per-document Chrome record](../bench/nano-result.json)
