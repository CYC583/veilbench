# VeilBench — Demo Video Script (target 2:45, hard limit 3:00)

- **Format:** 1920×1080, English voiceover, English subtitles (`.srt` from the lines below). Upload to YouTube as **Public** at least a day early and check the captions.
- **Rule:** only show numbers measured in this recording or already measured and dated in DEVPOST. No real personal data on screen; close any DevTools panel that shows tokens or keys.

## Before recording

1. Chrome with Gemini Nano ready (header shows **Gemini Nano Ready**), live site, zoom 100%.
2. X-Ray bar shows **App Check: Verified** and the Remote Config models.
3. iPhone 18 Pro with VeilBench Pocket installed (screen recording on), if the iOS segment is used.
4. A terminal window ready in the folder where downloads land.

## First 30 seconds (who it is for, the problem, how it works)

| Time | Screen | Voiceover |
| :-- | :-- | :-- |
| 0:00–0:04 | Decision card already on screen: **Don't sign yet — fix first · $6,000 (12.5%) · 1 clause to fix** | This is what you see before you sign: a $6,000 gap between your client's contract and their quote. |
| 0:04–0:10 | Cut back to the home screen; press **Run the 30-second demo**. Contract and quote scan load; the two timers start. | Two documents in, one decision out, in seconds. |
| 0:10–0:17 | Payload Inspector: only `[MONEY_AMOUNT_1] > [MONEY_AMOUNT_3]` and "5–15%"; route shows ON_DEVICE / IN_CLOUD. | The cloud only sees how the numbers relate. It never sees a name, and never sees a number. |
| 0:17–0:24 | Decision card upgrades to the final audit; the email written from the contractor. | Your device computes the exact gap and drafts the email you'll send. |
| 0:24–0:30 | **Verify what left this device** → download → terminal `shasum -a 256` → same digest. | And you don't have to trust us. Every byte that left is hashed. Check it yourself. |

## The rest (2:15)

| Time | Segment | Voiceover (short) |
| :-- | :-- | :-- |
| 0:30–0:45 | **Parallel hybrid.** Run the decision again; the on-device timer stops first, the cloud timer second. | Gemini Nano gives a first verdict on your device while the cloud runs the deep audit in parallel. |
| 0:45–1:00 | **Offline.** DevTools → Offline; run Stage 2 again: `ON_DEVICE`, Firestore **Pending sync**; back online → **Synced**. | Offline, the first verdict still runs on-device, and the session syncs when you reconnect. |
| 1:00–1:12 | **Try to leak.** Un-redact one token → Layer 3 blocks the request; egress ledger shows nothing sent. | If anything private is still in the payload, Layer 3 blocks the request before it leaves. |
| 1:12–1:22 | **Egress ledger + outbound.json.** Every request, bytes, "Layer 3 text: yes". | Every request the page makes is in this ledger, and each AI call carries only checked text. |
| 1:22–1:50 | **iOS (real iPhone).** VeilBench Pocket: Apple Foundation Models mask the quote on-device, then the Gemini audit on tokens. | The same airlock on iPhone, with Apple's on-device model through Firebase AI Logic. |
| 1:50–2:00 | **Benchmark.** `docs/BENCHMARK.md` table and CI badge. | Our leak benchmark runs in CI on every commit. |
| 2:00–2:20 | **Firebase.** Remote Config tab (model chain, routing policy, Refetch), App Check, Inference Log sources. | Remote Config swaps models and policies live; App Check protects every AI call. |
| 2:20–2:35 | **Real users.** One measured result and one quote from the freelancer test (only if measured). | — |
| 2:35–2:45 | Close on the decision card and the URL. | VeilBench. Catch the gap before you sign. |

Drop or shorten a segment if its evidence is not ready (iOS without a device recording, user test without real results). Keep the total under 2:50.
