import { describe, expect, it } from 'vitest';
import { bodyInfo, classifyHost } from '../../src/services/egressLedger';

describe('A3 egress ledger helpers', () => {
  it('classifies Firebase hosts by service', () => {
    expect(classifyHost('firebasevertexai.googleapis.com')).toBe('ai_logic');
    expect(classifyHost('firestore.googleapis.com')).toBe('firestore');
    expect(classifyHost('content-firebaseappcheck.googleapis.com')).toBe('app_check');
    expect(classifyHost('www.google.com')).toBe('other');
    expect(classifyHost('identitytoolkit.googleapis.com')).toBe('auth');
    expect(classifyHost('firebaseremoteconfig.googleapis.com')).toBe('remote_config');
  });

  it('counts UTF-8 bytes of string bodies and keeps text only for strings', () => {
    expect(bodyInfo('é')).toEqual({ bytes: 2, text: 'é' });
    expect(bodyInfo(new Uint8Array(5))).toEqual({ bytes: 5, text: null });
    expect(bodyInfo(null)).toEqual({ bytes: 0, text: null });
  });
});
