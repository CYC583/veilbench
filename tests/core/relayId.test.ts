import { describe, expect, it } from 'vitest';
import { parseRelayId } from '../../src/integrations/relayLink';

describe('relay link parsing (128-bit ID in the URL fragment)', () => {
  const id = '0123456789abcdef0123456789abcdef';
  it('accepts a bare ID or a shared link', () => {
    expect(parseRelayId(id)).toBe(id);
    expect(parseRelayId(`https://veilbench-hybrid-ai.web.app/#relay=${id}`)).toBe(id);
    expect(parseRelayId(`  #relay=${id}  `)).toBe(id);
  });
  it('rejects six-digit codes, uppercase, wrong length and junk', () => {
    expect(parseRelayId('123456')).toBeNull();
    expect(parseRelayId(id.toUpperCase())).toBeNull();
    expect(parseRelayId(`#relay=${id}0`)).toBeNull();
    expect(parseRelayId(`#relay=${id.slice(1)}`)).toBeNull();
    expect(parseRelayId('')).toBeNull();
    expect(parseRelayId(`https://elsewhere.example/#relay=${id}`)).toBeNull();
    expect(parseRelayId(`#relay=${id}&other=value`)).toBeNull();
  });
});
