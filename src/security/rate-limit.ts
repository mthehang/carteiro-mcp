interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class TokenBucket {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacity: number;
  private readonly refillPerMs: number;

  constructor(perMinute: number) {
    this.capacity = perMinute;
    this.refillPerMs = perMinute / 60_000;
  }

  consume(key: string, cost = 1): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const bucket = this.buckets.get(key) ?? { tokens: this.capacity, lastRefill: now };
    const elapsed = now - bucket.lastRefill;
    bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsed * this.refillPerMs);
    bucket.lastRefill = now;

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      this.buckets.set(key, bucket);
      return { allowed: true };
    }

    const deficit = cost - bucket.tokens;
    const retryAfterMs = Math.ceil(deficit / this.refillPerMs);
    this.buckets.set(key, bucket);
    return { allowed: false, retryAfterMs };
  }
}
