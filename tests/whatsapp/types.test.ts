import { describe, it, expect } from 'vitest';
import { isGroupJid, jidToPhone, normalizeJid } from '../../src/whatsapp/types.js';

describe('normalizeJid', () => {
  it('converte E.164 em JID individual', () => {
    expect(normalizeJid('+5511999999999')).toBe('5511999999999@s.whatsapp.net');
  });

  it('preserva JID ja formado', () => {
    expect(normalizeJid('5511999999999@s.whatsapp.net')).toBe('5511999999999@s.whatsapp.net');
    expect(normalizeJid('123456-789@g.us')).toBe('123456-789@g.us');
  });

  it('falha em entrada vazia ou sem digitos', () => {
    expect(() => normalizeJid('abc')).toThrow();
  });
});

describe('isGroupJid', () => {
  it('detecta grupos', () => {
    expect(isGroupJid('123-456@g.us')).toBe(true);
    expect(isGroupJid('5511999@s.whatsapp.net')).toBe(false);
  });
});

describe('jidToPhone', () => {
  it('extrai telefone E.164 de JID individual', () => {
    expect(jidToPhone('5511999999999@s.whatsapp.net')).toBe('+5511999999999');
  });

  it('retorna null para grupo', () => {
    expect(jidToPhone('123-456@g.us')).toBeNull();
  });
});
