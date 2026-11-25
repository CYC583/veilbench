/**
 * VeilBench Pocket relay links: https://veilbench-hybrid-ai.web.app/#relay=<32 lowercase hex>.
 *
 * The 128-bit ID is a bearer secret, so it must never reach a server or a third party. A URL fragment is
 * never sent in HTTP requests, and captureRelayFragment() runs first in main.tsx — before Firebase,
 * Analytics or Performance load — to move the ID into memory and strip it from the address bar, so no
 * page_location, referrer or trace can ever include it.
 */
const RELAY_ID = /^[0-9a-f]{32}$/;

let captured: string | null = null;

/** Accepts a bare ID or a full link with #relay=<id>; only 32 lowercase hex characters are valid. */
export function parseRelayId(input: string): string | null {
  const trimmed = input.trim();
  const match = trimmed.match(/#relay=([^&\s]*)/);
  const id = match ? match[1] : trimmed;
  return RELAY_ID.test(id) ? id : null;
}

const listeners = new Set<(id: string | null) => void>();
let watching = false;

function captureNow(): void {
  if (!window.location.hash.includes('relay=')) return;
  const id = parseRelayId(window.location.hash);
  window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  if (listeners.size) listeners.forEach((l) => l(id));
  else captured = id;
}

/**
 * Call once at startup, before any SDK loads. Removes any #relay=… from the URL, keeping a valid ID in
 * memory; also handles a link opened later in the same tab (hash change without a reload).
 */
export function captureRelayFragment(): void {
  if (typeof window === 'undefined') return;
  captureNow();
  if (!watching) {
    watching = true;
    window.addEventListener('hashchange', captureNow);
  }
}

/** Returns the captured relay ID once (then forgets it). */
export function takeCapturedRelayId(): string | null {
  const id = captured;
  captured = null;
  return id;
}

/** Notifies about relay links opened while the page is already running. Returns an unsubscribe. */
export function onRelayLink(listener: (id: string | null) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
