import { describe, expect, it } from 'vitest';
import { parseRelayCode } from '../../src/services/sessionStore';

describe('relay code parsing', () => {
  it('accepts the 6-digit code shown on the iPhone, with or without spaces', () => {
    expect(parseRelayCode('123456')).toBe('123456');
    expect(parseRelayCode('123 456')).toBe('123456');
  });
  it('rejects anything else', () => {
    expect(parseRelayCode('12345')).toBeNull();
    expect(parseRelayCode('1234567')).toBeNull();
    expect(parseRelayCode('abcdef')).toBeNull();
  });
});
