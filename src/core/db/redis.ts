import { config } from '@/core/config/index.ts';
import { DatabaseError, type AppError } from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import { RedisClient } from 'bun';

const log = logger.child({ module: 'REDIS_CLIENT' });

// Timeout default untuk operasi Redis (ms) agar sistem fail-fast dan toleran gangguan
const DEFAULT_REDIS_TIMEOUT_MS = 1500;

/**
 * Instance singleton Redis client bawaan Bun (Bun.RedisClient).
 * Terkoneksi sesuai konfigurasi REDIS_URL pada environment.
 * enableOfflineQueue: false menjamin fail-fast / fail-open instan jika server Redis offline.
 */
export const redis = new RedisClient(config.redis.url, {
  enableOfflineQueue: false,
  connectionTimeout: 1000,
  maxRetries: 3,
  autoReconnect: true,
});

/**
 * Mendapatkan instance singleton Redis client.
 */
export function getRedisClient(): RedisClient {
  return redis;
}

/**
 * Wrapper eksekusi Promise dengan batas waktu (timeout) untuk menjamin fail-fast saat Redis offline.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs = DEFAULT_REDIS_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Operasi Redis melebihi batas waktu (${timeoutMs}ms)`)),
      timeoutMs
    );
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}

/**
 * Melakukan ping ke server Redis untuk memastikan konektivitas.
 */
export async function redisPing(timeoutMs = DEFAULT_REDIS_TIMEOUT_MS): Promise<Result<string, AppError>> {
  try {
    const res = await withTimeout(redis.ping(), timeoutMs);
    return ok(String(res));
  } catch (error) {
    log.warn('Gagal melakukan ping ke Redis server', { error: String(error) });
    return err(
      new DatabaseError(`Gagal menghubungi server Redis: ${error instanceof Error ? error.message : String(error)}`, {
        url: config.redis.url,
      })
    );
  }
}

/**
 * Menambahkan nilai integer key Redis sebesar 1 (INCR).
 * Jika key belum ada, Redis akan menginisialisasi dengan 0 lalu menjadikannya 1.
 */
export async function redisIncr(
  key: string,
  timeoutMs = DEFAULT_REDIS_TIMEOUT_MS
): Promise<Result<number, AppError>> {
  try {
    const count = await withTimeout(redis.incr(key), timeoutMs);
    return ok(Number(count));
  } catch (error) {
    log.warn(`Gagal mengeksekusi Redis INCR pada key "${key}"`, { error: String(error) });
    return err(
      new DatabaseError(`Gagal mengeksekusi Redis INCR: ${error instanceof Error ? error.message : String(error)}`, {
        key,
      })
    );
  }
}

/**
 * Mengatur masa berlaku (expire time / TTL) suatu key Redis dalam hitungan detik.
 */
export async function redisExpire(
  key: string,
  seconds: number,
  timeoutMs = DEFAULT_REDIS_TIMEOUT_MS
): Promise<Result<boolean, AppError>> {
  try {
    const res = await withTimeout(redis.expire(key, seconds), timeoutMs);
    return ok(Boolean(res));
  } catch (error) {
    log.warn(`Gagal mengatur expire pada key "${key}"`, { error: String(error) });
    return err(
      new DatabaseError(`Gagal mengatur Redis EXPIRE: ${error instanceof Error ? error.message : String(error)}`, {
        key,
        seconds,
      })
    );
  }
}

/**
 * Mendapatkan sisa masa berlaku (Time To Live / TTL) suatu key Redis dalam detik.
 * Mengembalikan:
 * - >= 0: sisa detik
 * - -1: key ada tapi tidak memiliki expiration
 * - -2: key tidak ditemukan / sudah expired
 */
export async function redisTtl(
  key: string,
  timeoutMs = DEFAULT_REDIS_TIMEOUT_MS
): Promise<Result<number, AppError>> {
  try {
    const ttl = await withTimeout(redis.ttl(key), timeoutMs);
    return ok(Number(ttl));
  } catch (error) {
    log.warn(`Gagal memeriksa TTL pada key "${key}"`, { error: String(error) });
    return err(
      new DatabaseError(`Gagal memeriksa Redis TTL: ${error instanceof Error ? error.message : String(error)}`, {
        key,
      })
    );
  }
}

/**
 * Menghapus satu atau beberapa key dari basis data Redis.
 */
export async function redisDel(
  key: string,
  timeoutMs = DEFAULT_REDIS_TIMEOUT_MS
): Promise<Result<boolean, AppError>> {
  try {
    const res = await withTimeout(redis.del(key), timeoutMs);
    return ok(Number(res) > 0);
  } catch (error) {
    log.warn(`Gagal menghapus key "${key}" dari Redis`, { error: String(error) });
    return err(
      new DatabaseError(`Gagal menghapus key Redis: ${error instanceof Error ? error.message : String(error)}`, {
        key,
      })
    );
  }
}

/**
 * Menutup koneksi Redis client secara aman.
 */
export async function redisClose(): Promise<void> {
  try {
    await redis.close();
    log.info('Koneksi Redis client berhasil ditutup.');
  } catch (error) {
    log.warn('Gagal menutup koneksi Redis', { error: String(error) });
  }
}
