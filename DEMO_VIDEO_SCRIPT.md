# VeilBench — 2:45 Demo Video Production Script & English Subtitles

- **Target Runtime:** `2:45` (165 seconds — strictly under the 3:00 hard limit)
- **Format:** 1920×1080 (16:9), 30/60fps, Chrome Desktop 158 with the "Gemma 4 for Built-in AI" flag enabled and chrome://on-device-internals showing the model ready (`Gemini Nano Ready` emerald badge visible in Top Command Bar)
- **Audio / Captions:** Clear English voiceover + burned-in / YouTube English subtitles (`.srt` ready below)
- **Pre-Recording Checklist (30 seconds before hitting Record):**
  1. Open deployed **Firebase Hosting Live URL** (HTTPS) in Chrome Desktop with Gemini Nano downloaded (`chrome://on-device-internals` verified).
  2. Open Chrome DevTools docked on the right or detached (only bring Network tab into view at `0:55` for the live **Offline** toggle).
  3. Confirm Top Command Bar shows `ONLINE` (emerald) and `Gemini Nano Ready` (emerald).
  4. Confirm X-Ray Telemetry Bar shows `App Check: Verified` and `RC(remote): <active-model> / 7500c`.
  5. Keep browser zoom at `100%` so the Swiss Split-Pane Diff and 7fr/5fr Audit Workbench look razor-sharp.

---

## Shot-by-Shot Script (0:00 – 2:45)

### Scene 1 — The Hybrid AI Dilemma (0:00 – 0:20 | 20s)
- **On-Screen Action:**
  - Start on VeilBench's clean Document Intake screen (`https://<live-url>`).
  - Briefly highlight the Top Command Bar (`Auto Hybrid`, `ONLINE`, `Gemini Nano Ready`) and the three One-Click Evaluation Bundles.
- **Voiceover / English Subtitles:**
  > **[0:00]** Every time you paste a contract or medical lab scan into a cloud LLM, raw SSNs, bank IBANs, and API keys leave your device.
  > **[0:09]** Yet on-device models alone can't perform deep cross-document legal audits.
  > **[0:14]** Meet **VeilBench**—a Zero-Leak Hybrid AI Document Auditor powered by **Firebase AI Logic** and **Chrome Gemini Nano**.

---

### Scene 2 — 1-Click Multimodal Load, Canvas Pixel Burn-In & Layer 3 Circuit Breaker (0:20 – 0:55 | 35s)
- **On-Screen Action:**
  - **[0:20]** Click **"Contract + Quote Scan (Cross-Doc Conflict)"** (2 docs: Text MSA + client-generated PNG Quote Scan).
  - **[0:24]** Show the **Split-Pane Privacy Airlock**: Left shows red-highlighted raw PII (`Elena Rostova`, `SSN 987-65-4321`, `IBAN US89-4829-1104-8821`); Right shows emerald semantic tokens (`[PARTY_CONTRACTOR_1]`, `[ID_NUMBER_1]`, `[BANK_ACCOUNT_1]`) shared consistently across both documents.
  - **[0:31]** Switch to the second document tab **`Schedule B — Quote Q-2026-881.png`** to show the side-by-side **Original Local Scan vs. HTML5 Canvas Pixel-Burned Safe Image** with solid charcoal blocks physically burned over PII regions.
  - **[0:39]** **Live Security Proof:** Click one redaction chip (e.g., `[BANK_ACCOUNT_1]`) to toggle it OFF. Instantly point to the red badge **`LEAK DETECTED — CLOUD BLOCKED`** and disabled Cloud Escalation button. Toggle it back ON (`PRE-FLIGHT ZERO-LEAK PASS`).
  - **[0:47]** Click **"Inspect Payload & Proof"** to open the **Live Outbound Payload Inspector**, scrolling briefly over the pixel-burned thumbnail, sanitized text, and **Web Crypto SHA-256 Boundary Proof**. Close modal.
- **Voiceover / English Subtitles:**
  > **[0:20]** Let's load a two-document bundle: a consulting contract and an attached PNG quote scan.
  > **[0:25]** Stage 1 runs strictly on-device via `ONLY_ON_DEVICE` Gemini Nano plus a local deterministic shield, locking all PII into a shared browser-only Vault with semantic role aliases.
  > **[0:32]** For the quote image, HTML5 Canvas physically burns opaque blocks into the pixels so raw sensitive data is irreversibly destroyed before upload.
  > **[0:40]** And if a user accidentally unchecks a redaction chip, our Layer 3 Pre-Flight Circuit Breaker hard-blocks cloud escalation immediately.
  > **[0:47]** Before anything leaves the browser, the Live Payload Inspector lets you verify the exact outbound bytes and a Web Crypto SHA-256 Zero-Leak Proof.

---

### Scene 3 — Real Offline Switch: On-Device Gemini Nano Triage + Firestore Persistence (0:55 – 1:30 | 35s)
- **On-Screen Action:**
  - **[0:55]** Open Chrome DevTools Network tab (or toggle OS Wi-Fi off) and set throttling to **Offline**.
  - **[0:59]** Point to the Top Command Bar badge flipping live from `ONLINE` to **`OFFLINE`**.
  - **[1:02]** Click **"Run Rapid Triage (On-Device)"** (`PREFER_ON_DEVICE`).
  - **[1:06]** Show the layout-matched skeleton shimmer (`Running rapid risk triage on-device via Chrome Gemini Nano...`), then the **Stage 2 Rapid Risk Triage** card appearing with the emerald **`ON_DEVICE`** inference badge and 3 risk flags (IP trap, unlimited liability, payment conflict).
  - **[1:19]** Open the **History** drawer briefly to show the sanitized session already persisted locally via **Cloud Firestore `persistentLocalCache`** while offline. Close drawer.
- **Voiceover / English Subtitles:**
  > **[0:55]** Now let's disconnect the network completely—notice VeilBench switches to **OFFLINE**.
  > **[1:02]** We trigger Stage 2 Rapid Triage using Firebase AI Logic's `PREFER_ON_DEVICE` mode.
  > **[1:07]** Even with zero internet, Chrome Gemini Nano delivers structured risk flags locally at zero cloud cost—tagged `ON_DEVICE`.
  > **[1:19]** And because Cloud Firestore is initialized with `persistentLocalCache`, the Zero-PII audit snapshot is saved immediately offline and will auto-sync once we reconnect.

---

### Scene 4 — Back Online: Cloud Gemini Cross-Doc Audit, Redlines & Re-hydrated Email (1:30 – 2:15 | 45s)
- **On-Screen Action:**
  - **[1:30]** Switch DevTools Network back to **No throttling (Online)** → Top Command Bar flips back to `ONLINE`.
  - **[1:34]** Click **"Cross-Doc Redline Audit (2 Docs)"** → Payload Inspector opens → click **"Approve & Escalate to Cloud Gemini"** (`PREFER_IN_CLOUD`).
  - **[1:41]** Show the **7fr / 5fr Audit Workbench** populating with the amber **`IN_CLOUD`** badge:
    1. **Cross-Document Contradictions card**: highlights the conflict between the MSA (`$48,000 USD`, 50% deposit, Net-15) and the pixel-redacted PNG Quote (`$42,000 USD`, Net-90, `$1,500/day` penalty).
    2. **Interactive Redline Diff**: red strikethrough original clauses vs. emerald proposed revisions.
    3. **Negotiation Playbook & Ready-to-Send Email**: toggle between **`Zero-PII Sanitized`** (showing `[PARTY_CLIENT_1]`) and **`On-Device Re-hydrated`** (restoring `Marcus Vance`, `Elena Rostova`, and real amounts locally in RAM), then click **Copy**.
  - **[2:06]** Quick bonus beat: click **`EN → 繁中`** in Top Command Bar to show instant **On-Device Semantic Translation** (`PREFER_ON_DEVICE`) translating the executive summary, then toggle back to `EN`.
- **Voiceover / English Subtitles:**
  > **[1:30]** Back online, we escalate the verified zero-PII bundle—text plus pixel-burned PNG—to Cloud Gemini via `PREFER_IN_CLOUD` and Firebase App Check.
  > **[1:42]** Cloud Gemini immediately catches a hidden cross-document contradiction: the main contract promises $48,000 Net-15, while the scanned quote silently drops it to $42,000 Net-90 with a $1,500 daily penalty.
  > **[1:53]** Below, we get surgical Redline Diffs, counterparty pushback scripts, and a ready-to-send negotiation email—re-hydrated locally in your browser so real names and figures never touched the cloud.
  > **[2:06]** We even run `PREFER_ON_DEVICE` semantic translation to switch insights between English and Traditional Chinese locally.

---

### Scene 5 — Hybrid AI X-Ray Telemetry, App Check & Firestore Zero-PII Proof (2:15 – 2:45 | 30s)
- **On-Screen Action:**
  - **[2:15]** Click the bottom **Hybrid AI X-Ray Telemetry** bar to expand it.
  - **[2:18]** Highlight the live metrics strip: `Local/Saved` vs. `Cloud` counts, real latency (`ms`), **`App Check: Verified`**, and **`RC(remote)`** dynamic thresholds.
  - **[2:24]** Show the **Inference Log** table (`ON_DEVICE` for `pii_scan` & `rapid_triage`, `IN_CLOUD` for `cross_doc_contradiction`).
  - **[2:30]** Click the **`Cloud Firestore Zero-PII JSON`** tab to show the exact JSON stored in Firestore—containing only semantic tokens and the SHA-256 proof hash, zero raw PII.
  - **[2:38]** End on the clean split-pane workbench with URL overlay.
- **Voiceover / English Subtitles:**
  > **[2:15]** Finally, opening the Hybrid AI X-Ray Drawer reveals real runtime telemetry—not mock numbers.
  > **[2:21]** You can audit every `ON_DEVICE` and `IN_CLOUD` inference source, latency, Firebase App Check verification, and Firebase Remote Config thresholds.
  > **[2:30]** Even the Cloud Firestore JSON view proves our database stores strictly zero-PII tokens and SHA-256 proofs.
  > **[2:37]** VeilBench: verifiable privacy on-device, deep intelligence in the cloud—built with Firebase AI Logic. Try the live link below.

---

## Pacing & Timing Verification
- Scene 1: `0:00 – 0:20` (20s)
- Scene 2: `0:20 – 0:55` (35s)
- Scene 3: `0:55 – 1:30` (35s)
- Scene 4: `1:30 – 2:15` (45s)
- Scene 5: `2:15 – 2:45` (30s)
- **Total:** `2:45` (15-second safety buffer under the 3:00 YouTube limit)
