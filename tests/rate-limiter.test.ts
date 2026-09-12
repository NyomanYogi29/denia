import { describe, expect, it, spyOn, beforeEach, afterEach } from 'bun:test';
import * as redisDb from '@/core/db/redis.ts';
import {
  checkRateLimit,
  getRateLimitKey,
  resetRateLimit,
} from '@/core/middleware/rate-limiter.middleware.ts';
import { ok, err } from '@/core/types';
import { DatabaseError } from '@/core/errors';

describe('Rate Limiter Middleware (src/core/middleware/rate-limiter.middleware.ts)', () => {
  const testJid = '628123456789@s.whatsapp.net';

  it('should format rate limit redis key consistently', () => {
    const key = getRateLimitKey('08123456789');
    expect(key).toBe('ratelimit:user:628123456789@s.whatsapp.net');
  });

  describe('Fixed Window Counter logic with Mocked Redis', () => {
    let memoryStore: Map<string, { count: number; ttl: number }>;
    const spies: any[] = [];

    beforeEach(() => {
      memoryStore = new Map();

      spies.push(
        spyOn(redisDb, 'redisIncr').mockImplementation(async (key: string) => {
          const item = memoryStore.get(key) ?? { count: 0, ttl: 60 };
          item.count += 1;
          memoryStore.set(key, item);
          return ok(item.count);
        })
      );

      spies.push(
        spyOn(redisDb, 'redisExpire').mockImplementation(async (key: string, seconds: number) => {
          const item = memoryStore.get(key);
          if (item) item.ttl = seconds;
          return ok(true);
        })
      );

      spies.push(
        spyOn(redisDb, 'redisTtl').mockImplementation(async (key: string) => {
          const item = memoryStore.get(key);
          return ok(item ? item.ttl : -2);
        })
      );

      spies.push(
        spyOn(redisDb, 'redisDel').mockImplementation(async (key: string) => {
          const existed = memoryStore.delete(key);
          return ok(existed);
        })
      );
    });

    afterEach(() => {
      while (spies.length > 0) {
        spies.pop()?.mockRestore();
      }
    });

    it('should allow requests up to the limit (7 requests per minute)', async () => {
      for (let i = 1; i <= 7; i++) {
        const res = await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
        expect(res.allowed).toBe(true);
        expect(res.currentCount).toBe(i);
        expect(res.remaining).toBe(7 - i);
      }
    });

    it('should reject request when exceeding the limit (8th request)', async () => {
      // 7 request pertama lolos
      for (let i = 1; i <= 7; i++) {
        await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
      }

      // Request ke-8 harus ditolak
      const res8 = await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
      expect(res8.allowed).toBe(false);
      expect(res8.currentCount).toBe(8);
      expect(res8.remaining).toBe(0);
      expect(res8.resetInSeconds).toBe(60);
    });

    it('should reset count after resetRateLimit is called', async () => {
      await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
      await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });

      const resetOk = await resetRateLimit(testJid);
      expect(resetOk).toBe(true);

      const nextRes = await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
      expect(nextRes.allowed).toBe(true);
      expect(nextRes.currentCount).toBe(1);
    });
  });

  describe('Fail-Open Policy when Redis is Down / Error', () => {
    it('should gracefully allow requests (fail-open) when redisIncr throws error', async () => {
      const spy = spyOn(redisDb, 'redisIncr').mockImplementation(async () => {
        return err(new DatabaseError('Redis connection refused'));
      });

      try {
        const res = await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
        expect(res.allowed).toBe(true);
      } finally {
        spy.mockRestore();
      }
    });
  });
});
