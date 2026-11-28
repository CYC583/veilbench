# VeilBench Pocket (iOS companion)

VeilBench Pocket is the iPhone version of VeilBench's zero-leak contract audit. It does the privacy work on the phone. Only role tokens can reach the cloud.

1. **Input.** Paste a contract or tap *Load sample contract*. The sample is the web app's fictional MSA plus its Schedule B quote. It uses reserved `.example` domains, 555 phone numbers and a non-issuable SSN.
2. **Stage 1: On-device airlock (ON-DEVICE only).** Apple Foundation Models runs through Firebase AI Logic `.systemModel()` and extracts person names, organizations and addresses into a `@Generable` struct. A deterministic Swift regex layer (ported from `src/core/piiShield.ts`) adds emails, phones, SSN/IDs, IBAN/routing numbers, money, calendar dates, defined parties (`X ("Client")`), labeled persons and LLC/Inc organizations. Every value goes into a local vault (`Northstar Ventures LLC` becomes `[PARTY_CLIENT_1]`, `$48,000` becomes `[MONEY_AMOUNT_1]`, and so on). Replacement claims the longest match first and is case-insensitive for names, organizations and emails.
3. **Layer 3: zero-leak check.** This check runs on the exact outbound string. It fails if any vault original remains (names are checked case-insensitively), or if any raw email, IBAN, SSN, phone, date or address pattern remains. If it fails, the cloud call is blocked and the reason is shown with the value masked.
4. **Stage 4: Cloud audit (IN-CLOUD).** One structured Gemini call over tokens only returns risk flags and a negotiation email. The prompt includes relation hints computed on the phone (for example `[MONEY_AMOUNT_1] > [MONEY_AMOUNT_3] (difference 5-15% …)`). The model writes `{{DIFF:[A]-[B]}}`, and the phone computes the exact value (`$6,000 (12.5%)`).
5. **Re-hydration.** A toggle switches between *Tokens (as sent)* and *Restored on device*. Restoring uses the local vault only.
6. **Inference badges and log.** Every step is labeled `ON-DEVICE · Apple Foundation Models`, `ON-DEVICE · Swift rules` or `IN-CLOUD · Gemini`, and the log shows each step's latency. The on-device badge is shown only when the response reports `modelVersion == "apple-foundation-models-system-language-model"`.

## Privacy rule

**Stage 1 never falls back to the cloud.** It uses `.systemModel()` only, never `.hybridModel`. The model may be unavailable (`SystemLanguageModel.default.availability`), it may throw, or it may report an unexpected model version. In each of these cases Pocket continues with the regex layer only, on the phone, and shows a "Local rules only" notice. Raw text is never sent anywhere. The cloud step accepts only a payload that has passed Layer 3, and it re-checks that payload right before sending.

## Audit Sync and Relay

Pocket reads `cloud_model_name` and `cloud_model_fallbacks` from Firebase Remote Config to determine the cloud model order. When offline on first launch it uses the built-in fallback chain, and previously activated remote values remain available offline.

After an audit completes, Pocket re-runs Layer 3 on every risk title, description, and email before saving. Once verified, it signs in with Anonymous Auth and writes the tokenized audit to `sanitized_sessions`, showing **Synced** only after Cloud Firestore confirms the server write. Firestore disk persistence is enabled (initial anonymous sign-in still requires network connectivity). Raw document text and the local token vault remain in memory only.

Tapping **Create share link** on an audit generates 16 cryptographically secure random bytes (32 lowercase hex characters) as a relay document ID. Once Firestore confirms the write, **Share audit link** opens the iOS share sheet with the production URL carrying the ID in the fragment (`#relay=<id>`), so the web app can load that tokenized relay under its Firebase session.

The server allows relay links to live for at most 15 minutes; Pocket sets expiry to 14 minutes 30 seconds to allow for clock skew between the phone and server. Anyone holding the link can read it before expiry, so share it only with intended recipients. Each relay document contains only `createdAt`, `expiresAt`, Layer 3-checked `flags`, and `emailSanitized`. After expiry the server rejects new reads, while any copy already loaded by the recipient stays on their screen.

## Where Firebase AI Logic is called

| What | File:line |
|---|---|
| On-device client | `VeilBenchPocket/AI/OnDeviceExtractor.swift:59` — `FirebaseAI.firebaseAI(backend: .googleAI())` |
| On-device session (`.systemModel()`) | `VeilBenchPocket/AI/OnDeviceExtractor.swift:66-67` |
| On-device structured call | `VeilBenchPocket/AI/OnDeviceExtractor.swift:70` — `respond(to:generating: OnDeviceEntities.self)` |
| Cloud client | `VeilBenchPocket/AI/CloudAuditor.swift:70` |
| Cloud session (`.geminiModel(name:)`) | `VeilBenchPocket/AI/CloudAuditor.swift:71-72` |
| Cloud structured call | `VeilBenchPocket/AI/CloudAuditor.swift:75` — `respond(to:generating: CloudAudit.self)` |
| Retry / fallback policy | `VeilBenchPocket/Core/CloudResilience.swift` (retry once on 429/5xx/timeout, then `gemini-3.5-flash-lite` → `gemini-3.6-flash`) |
| Firebase + App Check setup | `VeilBenchPocket/AI/FirebaseBootstrap.swift` |

The pure logic in `VeilBenchPocket/Core/` has no Firebase or AI imports, and XCTest covers it in `VeilBenchPocketTests/`. It includes the shield, vault, Layer 3, relation hints, re-hydration, chunking and resilience policy.

## SDK version pin

`firebase-ios-sdk` is pinned to **exactly 12.19.3**. Pocket uses the `GenerativeModelSession`, `.systemModel()` and `.hybridModel` APIs, which exist only in 12.13.0–12.19.3. Firebase iOS SDK 13.0.0 removed them. Do not bump the version without porting `AI/`.

## Run

Requirements: Xcode 27.x and an iOS 26+ simulator or device. The deployment target is iOS 26.0.

```sh
cd ios/VeilBenchPocket
open VeilBenchPocket.xcodeproj           # Run the "VeilBenchPocket" scheme
# or from the command line:
xcodebuild -project VeilBenchPocket.xcodeproj -scheme VeilBenchPocket \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' test
```

### Firebase configuration

* Without `GoogleService-Info.plist`, the app configures Firebase with placeholder options. The on-device stages work, and Stage 4 shows **Cloud not configured**. Nothing is sent.
* To enable the cloud step, register the iOS app `com.cyc583.veilbench.pocket` in the Firebase console and enable Firebase AI Logic (Gemini Developer API). Save the downloaded file as `ios/VeilBenchPocket/VeilBenchPocket/GoogleService-Info.plist`. It is gitignored, and the synchronized folder bundles it automatically. `GoogleService-Info.example.plist` shows the shape with placeholder values only.
* **App Check.** DEBUG builds install `AppCheckDebugProviderFactory`, and release builds install App Attest. Both are set before `FirebaseApp.configure`, and only when a real plist is present. On the first DEBUG launch, the Firebase SDK prints a local debug token to the Xcode console (look for "App Check debug token"). Register it in **Firebase console → App Check → Apps → Manage debug tokens**. Never commit or share that token.

### Simulator vs device

* Apple Foundation Models runs in the iOS 27 simulator on an Apple-silicon Mac with Apple Intelligence enabled. The first on-device call can take 10–30 s there.
* On a device, the phone must support Apple Intelligence and have it turned on. If it doesn't, Stage 1 shows the "Local rules only" notice.
* App Attest does not work in the simulator. Use DEBUG builds and the debug token there.

### Demo launch arguments (for recording and screenshots)

`-demoSample YES` loads the sample, `-demoRun YES` runs Stage 1 and Layer 3, `-demoCloud YES` presses "Send tokens to Gemini", `-demoRestored YES` switches to restored values, and `-demoScroll stage1|layer3|cloud|log` scrolls to a section.
