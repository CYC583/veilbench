/**
 * A3 · Network egress ledger. Records every cross-origin request this page sends (fetch, XHR and
 * sendBeacon): where it went, how many bytes left, and a SHA-256 of string bodies. Bodies themselves are
 * never stored, and query strings (which can carry API keys) are dropped. For AI Logic requests the
 * ledger also checks that the body carries text that already passed Layer 3, so the receipt and the
 * actual network traffic can be reconciled.
 */
export type EgressChannel =
  | 'ai_logic'
  | 'firestore'
  | 'app_check'
  | 'auth'
  | 'remote_config'
  | 'telemetry'
  | 'other';

export interface EgressEntry {
  id: number;
  at: string;
  channel: EgressChannel;
  host: string;
  /** Path without query string. */
  path: string;
  method: string;
  bytes: number;
  sha256: string | null;
  /** AI Logic only: body contains a Layer 3-checked text (true), or not (false). */
  carriesAuditedText: boolean | null;
}

const MAX_ENTRIES = 500;
let entries: EgressEntry[] = [];
let nextId = 1;
let installed = false;
const listeners = new Set<() => void>();
let auditedTexts: string[] = [];

/** The store registers every text that passed Layer 3 (escaped as it appears inside a JSON body). */
export function registerAuditedTexts(texts: string[]): void {
  auditedTexts = texts.filter(t => t.length > 0).map(t => JSON.stringify(t).slice(1, -1));
}

export function getEgressEntries(): EgressEntry[] {
  return entries;
}

export function subscribeEgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearEgressLedger(): void {
  entries = [];
  listeners.forEach(l => l());
}

export function classifyHost(host: string): EgressChannel {
  if (/firebasevertexai|generativelanguage|aiplatform/.test(host)) return 'ai_logic';
  if (/firestore\.googleapis/.test(host)) return 'firestore';
  if (/firebaseappcheck|recaptcha/.test(host)) return 'app_check';
  if (/identitytoolkit|securetoken/.test(host)) return 'auth';
  if (/firebaseremoteconfig/.test(host)) return 'remote_config';
  if (/firebaselogging|google-analytics|googletagmanager|firebaseinstallations|analytics/.test(host)) return 'telemetry';
  return 'other';
}

async function sha256OfString(text: string): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export function bodyInfo(body: unknown): { bytes: number; text: string | null } {
  if (body === null || body === undefined) return { bytes: 0, text: null };
  if (typeof body === 'string') return { bytes: new TextEncoder().encode(body).length, text: body };
  if (typeof Blob !== 'undefined' && body instanceof Blob) return { bytes: body.size, text: null };
  if (body instanceof ArrayBuffer) return { bytes: body.byteLength, text: null };
  if (ArrayBuffer.isView(body)) return { bytes: body.byteLength, text: null };
  if (body instanceof URLSearchParams) {
    const s = body.toString();
    return { bytes: new TextEncoder().encode(s).length, text: s };
  }
  return { bytes: 0, text: null };
}

async function record(rawUrl: string, method: string, body: unknown): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl, window.location.href);
  } catch {
    return;
  }
  if (url.origin === window.location.origin) return; // app assets, not egress
  const { bytes, text } = bodyInfo(body);
  const channel = classifyHost(url.hostname);
  const sha256 = text !== null && text.length <= 2_000_000 ? await sha256OfString(text) : null;
  const carriesAuditedText = channel === 'ai_logic' && text !== null
    ? auditedTexts.some(t => text.includes(t))
    : null;
  entries = [...entries, {
    id: nextId++, at: new Date().toISOString(), channel, host: url.hostname, path: url.pathname,
    method: method.toUpperCase(), bytes, sha256, carriesAuditedText,
  }].slice(-MAX_ENTRIES);
  listeners.forEach(l => l());
}

/** Wraps fetch, XHR and sendBeacon once. Recording never blocks or alters the request. */
export function installEgressLedger(): void {
  if (installed || typeof window === 'undefined') return;
  installed = true;

  const originalFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
      void record(url, method, init?.body ?? null);
    } catch {
      // never interfere with the request
    }
    return originalFetch(input, init);
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const meta = new WeakMap<XMLHttpRequest, { method: string; url: string }>();
  XMLHttpRequest.prototype.open = function open(
    this: XMLHttpRequest,
    method: string,
    url: string | URL,
    async: boolean = true,
    username?: string | null,
    password?: string | null
  ) {
    meta.set(this, { method, url: String(url) });
    return originalOpen.call(this, method, url, async, username, password);
  };
  XMLHttpRequest.prototype.send = function send(this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
    const m = meta.get(this);
    if (m) {
      try {
        void record(m.url, m.method, body ?? null);
      } catch {
        // ignore
      }
    }
    return originalSend.call(this, body);
  };

  if (typeof navigator.sendBeacon === 'function') {
    const originalBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      try {
        void record(String(url), 'POST', data ?? null);
      } catch {
        // ignore
      }
      return originalBeacon(url, data);
    };
  }
}
