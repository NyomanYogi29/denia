import { describe, expect, it, spyOn, beforeEach, afterEach } from 'bun:test';
import * as redisDb from '@/core/db/redis.ts';
import {
  checkRateLimit,
  resetRedisDownWarnState,
} from '@/core/middleware/rate-limiter';
import { ok, err } from '@/core/types';
import { DatabaseError } from '@/core/errors';

describe('Redis Startup Verification & Fail-Open Resilience (Evaluasi E.2)', () => {
  const testJid = '628987654321@s.whatsapp.net';

  beforeEach(() => {
    resetRedisDownWarnState();
  });

  describe('verifyRedisConnection()', () => {
    it('should return ok(true) when Redis ping succeeds with PONG', async () => {
      const pingSpy = spyOn(redisDb.redis, 'ping').mockResolvedValue('PONG' as any);

      try {
        const result = await redisDb.verifyRedisConnection(500);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(true);
        }
      } finally {
        pingSpy.mockRestore();
      }
    });

    it('should return err(DatabaseError) without throwing unhandled exceptions when Redis is down', async () => {
      const pingSpy = spyOn(redisDb.redis, 'ping').mockRejectedValue(
        new Error('Connection refused to redis://127.0.0.1:6379')
      );

      try {
        const result = await redisDb.verifyRedisConnection(500);
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error).toBeInstanceOf(DatabaseError);
          expect(result.error.message).toContain('Gagal menghubungi server Redis');
        }
      } finally {
        pingSpy.mockRestore();
      }
    });
  });

  describe('Throttled Fail-Open Logging Behavior', () => {
    it('should allow requests seamlessly in fail-open mode when Redis is offline', async () => {
      const incrSpy = spyOn(redisDb, 'redisIncr').mockImplementation(async () => {
        return err(new DatabaseError('Connection reset by peer'));
      });

      try {
        // Request 1: Mentolerir error dan beralih ke fail-open
        const res1 = await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
        expect(res1.allowed).toBe(true);

        // Request 2: Tetap fail-open tanpa melempar exception
        const res2 = await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
        expect(res2.allowed).toBe(true);
      } finally {
        incrSpy.mockRestore();
      }
    });

    it('should recover normal rate limiting once Redis is back online', async () => {
      let isRedisDown = true;

      const incrSpy = spyOn(redisDb, 'redisIncr').mockImplementation(async () => {
        if (isRedisDown) {
          return err(new DatabaseError('Redis unavailable'));
        }
        return ok(1);
      });

      const expireSpy = spyOn(redisDb, 'redisExpire').mockResolvedValue(ok(true));

      try {
        // 1. Saat offline -> fail-open
        const resDown = await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
        expect(resDown.allowed).toBe(true);

        // 2. Redis kembali online
        isRedisDown = false;
        const resUp = await checkRateLimit(testJid, { maxRequests: 7, windowSeconds: 60 });
        expect(resUp.allowed).toBe(true);
        expect(resUp.currentCount).toBe(1);
      } finally {
        incrSpy.mockRestore();
        expireSpy.mockRestore();
      }
    });
  });
});
