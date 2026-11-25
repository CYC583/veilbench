import { describe, expect, it } from 'vitest';
import { parseRelayId } from '../../src/services/sessionStore';

describe('relay link parsing', () => {
  const id = '0123456789abcdef0123456789ABCDEF';
  it('accepts a bare 128-bit ID or a shared link fragment', () => {
    expect(parseRelayId(id)).toBe(id.toLowerCase());
    expect(parseRelayId(`https://veilbench-hybrid-ai.web.app/#relay=${id}`)).toBe(id.toLowerCase());
  });
  it('rejects short, guessable or malformed codes', () => {
    expect(parseRelayId('123456')).toBeNull();
    expect(parseRelayId(`#relay=${id}0`)).toBeNull();
    expect(parseRelayId('')).toBeNull();
  });
});
