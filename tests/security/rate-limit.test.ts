import { describe, it, expect } from 'vitest';
import { TokenBucket } from '../../src/security/rate-limit.js';

describe('TokenBucket', () => {
  it('permite ate o limite por minuto', () => {
    const bucket = new TokenBucket(60);
    for (let i = 0; i < 60; i++) {
      expect(bucket.consume('user').allowed).toBe(true);
    }
    expect(bucket.consume('user').allowed).toBe(false);
  });

  it('separa buckets por chave', () => {
    const bucket = new TokenBucket(2);
    expect(bucket.consume('a').allowed).toBe(true);
    expect(bucket.consume('a').allowed).toBe(true);
    expect(bucket.consume('a').allowed).toBe(false);
    expect(bucket.consume('b').allowed).toBe(true);
  });

  it('retorna retryAfterMs quando bloqueado', () => {
    const bucket = new TokenBucket(60);
    for (let i = 0; i < 60; i++) bucket.consume('x');
    const result = bucket.consume('x');
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });
});
