# Design System: VeilBench

## 1. Visual Theme & Atmosphere
A restrained, clinical, high-trust security workbench designed with Swiss architectural precision. Density is calibrated at **Daily App Balanced (6/10)** with clean asymmetric workspace splits, crisp 1px structural dividers, and fluid spring-physics motion. The atmosphere communicates cryptographic certainty—light, crisp, studio-lit paper surfaces paired with stark charcoal ink, making sensitive redactions and hybrid AI routing boundaries unmistakably legible.

## 2. Color Palette & Roles
- **Canvas Alabaster** (`#F8F9FA`) — Primary workspace background surface
- **Pure Sheet** (`#FFFFFF`) — Document panes, active panels, modal surfaces
- **Subtle Well** (`#F1F3F5`) — Recessed code/payload wells, telemetry bar background
- **Charcoal Ink** (`#141518`) — Primary typography and dark structural anchors (never pure `#000000`)
- **Muted Slate** (`#5C626E`) — Secondary labels, helper metadata, timestamps
- **Hairline Border** (`#E2E5EA`) — 1px structural dividers and pane boundaries
- **Signal Emerald (Primary Accent)** (`#0F766E`) — Single brand accent (< 80% saturation) for primary CTAs, active states, focus rings, and **On-Device / Zero-Leak Verified** indicators
- **Semantic Status Tokens (Strictly functional, never decorative)**:
  - **Redaction Rose** (`#BE123C` on `#FFF1F2` tint) — Detected PII highlights in raw local pane & high-risk clause markers
  - **Cloud Escalation Amber** (`#B45309` on `#FFFBEB` tint) — Explicit boundary indicator when sanitized payload crosses to Cloud Gemini
  - **Offline Steel** (`#475569` on `#F1F5F9` tint) — Offline mode status indicator

*Constraint: Strictly one brand accent (`#0F766E`). AI purple/blue neon gradients and glowing buttons are strictly banned.*

## 3. Typography Rules
- **Display & UI Sans**: `Geist` (fallback: `system-ui, -apple-system, sans-serif`) — Track-tight headings (`-0.025em`), weight-driven hierarchy (`600`/`500`) rather than oversized text.
- **Body**: `Geist` — `14px`–`15px`, relaxed line-height (`1.6`), max `65ch` for readable prose.
- **Technical & Telemetry Mono**: `Geist Mono` (fallback: `ui-monospace, monospace`) — Used for PII tokens (`[PERSON_1]`), SHA-256 hashes, latency (`ms`), `ON_DEVICE` / `IN_CLOUD` badges, JSON payloads, and diff lines.
- **Banned**: `Inter`, generic serif fonts (`Times New Roman`, `Georgia`), and decorative display fonts.

## 4. Component Stylings
- **Buttons**: Flat, crisp `6px`–`8px` radius, zero outer neon glow. Tactile `translateY(1px)` active press feedback. Primary CTA uses Signal Emerald (`#0F766E`) with `#FFFFFF` text; secondary uses Pure Sheet with Hairline Border.
- **Panes & Surfaces**: Avoid heavy drop-shadow card grids. Use crisp `1px solid #E2E5EA` borders and clean background contrast (`#FFFFFF` over `#F8F9FA`) to define the Split-Pane Privacy Diff and Audit Workbench.
- **PII Tokens & Redaction Chips**: Monospace inline pills (`#FFF1F2` fill, `#BE123C` text in raw pane; `#F0FDFA` fill, `#0F766E` text for sanitized `[TOKEN]` in safe pane) with click-to-toggle redaction control.
- **Inputs & Upload Dropzone**: Label above input, helper text below, crisp `1px` border transitioning to `#0F766E` focus ring.
- **Loading States**: Layout-matched skeletal shimmer blocks with live stage progress text (e.g., `Scanning PII on-device via Gemini Nano...`)—never generic circular spinners.
- **Empty States**: Clean, composed intake view featuring 3 realistic one-click sample buttons and a drag-and-drop text/image area.

## 5. Layout Principles
- **Asymmetric Workbench Grid**: CSS Grid-first layout (`max-width: 1440px`, centered) with `min-h-[100dvh]`.
- **No Generic 3-Equal-Card Feature Row**: Document intake and workbench use asymmetric 2-column Split-Pane (`1fr 1fr` on desktop for Raw vs. Sanitized diff) and a `7fr / 5fr` audit-to-playbook split.
- **Responsive Collapse**: Strictly collapses to single column below `768px` with zero horizontal overflow and `44px` minimum touch targets.
- **Persistent Telemetry**: Collapsible bottom X-Ray Telemetry Drawer anchored cleanly without overlapping document content.

## 6. Motion & Interaction
- **Physics**: Smooth cubic-bezier / spring transitions (`200ms–320ms`) strictly animating `transform` and `opacity`.
- **Stage Choreography**: Subtle staggered reveal when PII entities lock into the local vault and when Redline clauses stream from Cloud Gemini.
- **Live Status Pulse**: Subtle, low-amplitude pulse dot on active `ON_DEVICE` / `IN_CLOUD` inference indicator during live execution only.

## 7. Explicit Anti-Patterns (NEVER DO)
- No emojis anywhere in the UI (use crisp `lucide-react` stroke icons only).
- No `Inter` font, no serif fonts, no pure `#000000`.
- No purple/blue AI neon glows, no gradient hero text, no glassmorphism blur soup.
- No fabricated metrics, fake uptime numbers, or invented benchmark cards—every number in X-Ray Telemetry must come from real runtime events.
- No AI copywriting clichés ("Elevate", "Unleash", "Next-Gen", "Seamless").
- No overlapping text/images or `LABEL // YEAR` decorative headers.
