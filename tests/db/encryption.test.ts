import { describe, it, expect } from 'vitest';
import { randomBytes } from 'node:crypto';
import { EncryptionService, NoopEncryption } from '../../src/db/encryption.js';

const KEY = randomBytes(32).toString('hex');

describe('EncryptionService', () => {
  it('faz round-trip de texto plano', () => {
    const e = new EncryptionService(KEY);
    const original = 'Mensagem secreta com acentuacao: cafe, nao, voce.';
    const encrypted = e.encrypt(original);
    expect(encrypted).not.toBe(original);
    expect(e.decrypt(encrypted)).toBe(original);
  });

  it('rejeita chave invalida', () => {
    expect(() => new EncryptionService('xx')).toThrow();
  });

  it('rejeita payload corrompido', () => {
    const e = new EncryptionService(KEY);
    expect(() => e.decrypt('AAAA')).toThrow();
  });

  it('preserva strings vazias', () => {
    const e = new EncryptionService(KEY);
    expect(e.encrypt('')).toBe('');
    expect(e.decrypt('')).toBe('');
  });
});

describe('NoopEncryption', () => {
  it('retorna o input sem alteracao', () => {
    const e = new NoopEncryption();
    expect(e.encrypt('foo')).toBe('foo');
    expect(e.decrypt('foo')).toBe('foo');
  });
});
