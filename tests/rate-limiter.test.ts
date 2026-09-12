import { describe, expect, it, spyOn, beforeEach, afterEach } from 'bun:test';
import * as redisDb from '@/core/db/redis.ts';
import {
  checkRateLimit,
  getRateLimitKey,
  resetRateLimit,
  resolveRateLimitCategory,
  shouldSendRateLimitWarning,
} from '@/core/middleware/rate-limiter';
import { ok, err } from '@/core/types';
import { DatabaseError } from '@/core/errors';

describe('Rate Limiter Middleware (src/core/middleware/rate-limiter.middleware.ts)', () => {
  const testJid = '628123456789@s.whatsapp.net';

  it('should format rate limit redis key consistently', () => {
    const defaultKey = getRateLimitKey('08123456789');
    expect(defaultKey).toBe('ratelimit:user:628123456789@s.whatsapp.net');

    const actionKey = getRateLimitKey('08123456789', 'action');
    expect(actionKey).toBe('ratelimit:action:628123456789@s.whatsapp.net');

    const infoKey = getRateLimitKey('08123456789', 'info');
    expect(infoKey).toBe('ratelimit:info:628123456789@s.whatsapp.net');
  });

  it('should resolve rate limit categories correctly', () => {
    expect(resolveRateLimitCategory('pinjam')).toBe('action');
    expect(resolveRateLimitCategory('book')).toBe('action');
    expect(resolveRateLimitCategory('batal')).toBe('action');
    expect(resolveRateLimitCategory('cancel')).toBe('action');
    expect(resolveRateLimitCategory('info')).toBe('info');
    expect(resolveRateLimitCategory('jadwal')).toBe('info');
    expect(resolveRateLimitCategory('unknown')).toBe('info');
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

    it('should enforce action rate limit (1 request per 5 seconds)', async () => {
      // 1st request should be allowed
      const res1 = await checkRateLimit(testJid, { category: 'action', windowSeconds: 5 });
      expect(res1.allowed).toBe(true);
      expect(res1.limit).toBe(1);
      expect(res1.remaining).toBe(0);

      // 2nd request within 5s should be rejected
      const res2 = await checkRateLimit(testJid, { category: 'action', windowSeconds: 5 });
      expect(res2.allowed).toBe(false);
      expect(res2.currentCount).toBe(2);
      expect(res2.resetInSeconds).toBe(5);
    });

    it('should enforce info rate limit (10 requests per 60 seconds)', async () => {
      // 10 requests allowed
      for (let i = 1; i <= 10; i++) {
        const res = await checkRateLimit(testJid, { category: 'info' });
        expect(res.allowed).toBe(true);
        expect(res.limit).toBe(10);
      }

      // 11th request rejected
      const res11 = await checkRateLimit(testJid, { category: 'info' });
      expect(res11.allowed).toBe(false);
      expect(res11.currentCount).toBe(11);
      expect(res11.resetInSeconds).toBe(60);
    });

    it('should throttle warning messages using shouldSendRateLimitWarning', async () => {
      // 1st call should return true
      const canSend1 = await shouldSendRateLimitWarning(testJid, 'action', 5);
      expect(canSend1).toBe(true);

      // 2nd call within same window should return false
      const canSend2 = await shouldSendRateLimitWarning(testJid, 'action', 5);
      expect(canSend2).toBe(false);
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
