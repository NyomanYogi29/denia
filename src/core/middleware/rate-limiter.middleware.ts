import { config } from '@/core/config/index.ts';
import { redisExpire, redisIncr, redisTtl, redisDel } from '@/core/db/redis.ts';
import { logger } from '@/core/logger/index.ts';
import { normalizeToWhatsAppJid } from '@/core/utils/index.ts';

const log = logger.child({ module: 'RATE_LIMITER_MIDDLEWARE' });

export interface RateLimitOptions {
  readonly maxRequests?: number;
  readonly windowSeconds?: number;
}

export interface RateLimitResult {
  readonly allowed: boolean;
  readonly currentCount: number;
  readonly limit: number;
  readonly remaining: number;
  readonly resetInSeconds: number;
}

/**
 * Membentuk key Redis untuk pelacakan batas laju perintah pengguna berdasarkan JID.
 */
export function getRateLimitKey(jid: string): string {
  let normalizedJid: string;
  try {
    normalizedJid = normalizeToWhatsAppJid(jid);
  } catch {
    normalizedJid = jid.trim();
  }
  return `ratelimit:user:${normalizedJid}`;
}

/**
 * Middleware untuk memvalidasi batas laju (Rate Limiting) perintah per user WhatsApp.
 * Menggunakan algoritma Fixed Window Counter berbasis Redis INCR & EXPIRE.
 *
 * Kebijakan:
 * - Standar: 7 perintah per 60 detik per user.
 * - Fail-open: Jika Redis mengalami gangguan/offline, sistem tetap mengizinkan perintah (allowed: true)
 *   agar operasional kampus tidak terhenti, dengan mencatat peringatan pada log.
 */
export async function checkRateLimit(
  jid: string,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  const maxRequests = options?.maxRequests ?? config.redis.rateLimitMaxRequests;
  const windowSeconds = options?.windowSeconds ?? config.redis.rateLimitWindowSeconds;
  const key = getRateLimitKey(jid);

  // 1. Tambahkan hitungan hit pada Redis
  const incrResult = await redisIncr(key);
  if (!incrResult.success) {
    // Kebijakan Fail-Open: Jangan blokir pengguna jika Redis mengalami masalah teknis
    log.warn(
      `Pemeriksaan rate limit gagal karena gangguan Redis. Menerapkan kebijakan fail-open untuk "${jid}"`,
      { error: incrResult.error.message }
    );
    return Object.freeze({
      allowed: true,
      currentCount: 1,
      limit: maxRequests,
      remaining: maxRequests - 1,
      resetInSeconds: 0,
    });
  }

  const currentCount = incrResult.data;

  // 2. Pada request pertama dalam jendela waktu, tetapkan masa berlaku (TTL)
  if (currentCount === 1) {
    const expireResult = await redisExpire(key, windowSeconds);
    if (!expireResult.success) {
      log.warn(`Gagal mengatur TTL rate limit pada key "${key}"`, {
        error: expireResult.error.message,
      });
    }
  }

  // 3. Evaluasi apakah melebihi batas yang diizinkan
  if (currentCount > maxRequests) {
    // Ambil sisa detik menuju reset
    const ttlResult = await redisTtl(key);
    let resetInSeconds = windowSeconds;
    if (ttlResult.success && ttlResult.data > 0) {
      resetInSeconds = ttlResult.data;
    } else if (ttlResult.success && ttlResult.data === -1) {
      // Jika key tidak memiliki TTL (misal expire gagal saat count=1), pasang TTL sekarang
      await redisExpire(key, windowSeconds);
      resetInSeconds = windowSeconds;
    }

    log.warn(`Rate limit terlampaui untuk pengirim "${jid}" (${currentCount}/${maxRequests})`, {
      jid,
      currentCount,
      maxRequests,
      resetInSeconds,
    });

    return Object.freeze({
      allowed: false,
      currentCount,
      limit: maxRequests,
      remaining: 0,
      resetInSeconds,
    });
  }

  const remaining = Math.max(0, maxRequests - currentCount);

  return Object.freeze({
    allowed: true,
    currentCount,
    limit: maxRequests,
    remaining,
    resetInSeconds: 0,
  });
}

/**
 * Menghapus data rate limit pengguna tertentu (misal untuk testing atau reset admin).
 */
export async function resetRateLimit(jid: string): Promise<boolean> {
  const key = getRateLimitKey(jid);
  const result = await redisDel(key);
  return result.success && result.data;
}
