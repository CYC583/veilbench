# SITE.md — VeilBench Project Constitution

## 1. Core Identity
- **Project Name**: VeilBench
- **Stitch Project ID**: `[Local-First Design System — Stitch MCP Optional]`
- **Mission**: A zero-leak, hybrid AI document auditor and negotiation workbench that redacts sensitive PII strictly on-device with Chrome Gemini Nano (both text and pixel-level image redaction) before escalating sanitized context to Cloud Gemini via Firebase AI Logic for deep redline analysis—secured by Firebase App Check.
- **Target Audience**: Freelancers, founders, patients, legal/finance professionals, and Firebase #BuildHybridAI hackathon judges evaluating hybrid inference architecture.
- **Voice**: Clinical, trustworthy, precise, architectural, zero-hype.

## 2. Visual Language
- **Vibe (Adjectives)**: Architectural / Clinical / High-Trust
- **Reference Mood**: Precision security workbench meets modern editorial legal-tech studio (Linear / Stripe Docs / Swiss typography clarity).

## 3. Architecture & File Structure
- **Framework**: React 19 + Vite + TypeScript + Tailwind CSS
- **Root**: `/Users/cyc/Documents/BuildHybridAI/src/`
- **Core Modules**:
  - `src/types/` — Shared TypeScript contracts
  - `src/config/` — Firebase initialization (AI Logic, App Check, Auth, Firestore Offline Persistence, Remote Config)
  - `src/core/` — Pure-function Hybrid Router, Local PII Shield, Canvas Redactor, SHA-256 Proof Generator
  - `src/services/` — Firebase AI Logic multi-stage orchestrator & Firestore Zero-PII store
  - `src/components/` — Design-system-governed workbench UI
- **Navigation Strategy**: Single-page precision workbench with persistent Top Command Bar (Brand, Inference Mode Selector, Network & Nano Status, History Drawer) and collapsible bottom X-Ray Telemetry Bar.

## 4. Live Sitemap
- [ ] `index.html` — Entry shell loading `Geist` and `Geist Mono` fonts
- [ ] `/` — Primary Workbench View:
  - Asymmetric Workspace Header & One-Click Sample Intake (3 realistic English samples + drag/drop text/image)
  - Split-Pane Privacy Diff View (Raw Local Document w/ PII Highlights vs. Sanitized Zero-PII Payload & Canvas-Redacted Image)
  - Human-in-the-Loop Privacy Gate & Live Payload Inspector Modal (with SHA-256 Zero-Leak Certificate)
  - Hybrid Audit & Redline Workbench (Offline Nano Triage, Cloud Redline Diff, Negotiation Playbook, Re-hydrated Multi-turn Chat)
  - Persistent Hybrid X-Ray Telemetry Drawer (InferenceSource, Latency, App Check, Remote Config, Firestore Sync)

## 5. The Roadmap (Backlog)
### High Priority
- [ ] Initialize React + Vite + TypeScript + Firebase JS SDK v12.5+ project skeleton
- [ ] Implement Pure-Function Hybrid Router + Multi-Stage Firebase AI Logic pipeline (`ONLY_ON_DEVICE`, `PREFER_ON_DEVICE`, `PREFER_IN_CLOUD`)
- [ ] Build Split-Pane Privacy Diff & HTML5 Canvas Pixel-Level Image Redactor
- [ ] Build Live Payload Inspector + SHA-256 Zero-Leak Proof Certificate
- [ ] Wire Firebase App Check, Anonymous Auth, Firestore Offline Persistence, and Remote Config

### Medium Priority
- [ ] Build Interactive Redline Diff & Negotiation Playbook with local re-hydration
- [ ] Build Multi-turn Cloud Follow-up Chat with automatic local entity restoration
- [ ] Create 3 realistic English sample documents (Contract, Medical Lab PNG, Financial Invoice)
- [ ] Build Hybrid X-Ray Telemetry Drawer displaying live SDK `inferenceSource` and Firestore Zero-PII JSON

### Low Priority
- [ ] Graceful degradation banner with Chrome Gemini Nano enablement guide for non-Nano browsers
- [ ] Export re-hydrated negotiation email / markdown report
- [ ] Final English README, Apache-2.0 LICENSE, and 3-minute demo recording

## 6. Creative Freedom Guidelines
- All UI copy must be strictly in English (competition requirement).
- Never fabricate telemetry numbers or fake benchmarks—every latency, token estimate, PII count, and `inferenceSource` badge must reflect live runtime execution.
- Preserve clear visual distinction between **Local On-Device Zone** (Emerald/Teal trust signal) and **Cloud Escalation Zone** (Slate/Amber controlled boundary)—never use generic AI purple/neon gradients.
