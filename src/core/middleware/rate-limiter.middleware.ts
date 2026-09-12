import { config } from '@/core/config/index.ts';
import { redisExpire, redisIncr, redisTtl, redisDel } from '@/core/db/redis.ts';
import { logger } from '@/core/logger/index.ts';
import { normalizeToWhatsAppJid } from '@/core/utils/index.ts';

const log = logger.child({ module: 'RATE_LIMITER_MIDDLEWARE' });

export type RateLimitCategory = 'action' | 'info';

export interface RateLimitOptions {
  readonly category?: RateLimitCategory;
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
 * Menentukan kategori rate limit berdasarkan nama perintah (command).
 * - 'action': Perintah eksekusi mutasi jadwal/ruangan (pinjam, book, batal, cancel)
 * - 'info': Perintah pembacaan informasi/jadwal (info, jadwal, dan lainnya)
 */
export function resolveRateLimitCategory(command: string): RateLimitCategory {
  const normalized = command.toLowerCase().trim();
  switch (normalized) {
    case 'pinjam':
    case 'book':
    case 'batal':
    case 'cancel':
      return 'action';
    case 'info':
    case 'jadwal':
    default:
      return 'info';
  }
}

/**
 * Membentuk key Redis untuk pelacakan batas laju perintah pengguna berdasarkan JID dan kategori.
 */
export function getRateLimitKey(jid: string, category?: RateLimitCategory | string): string {
  let normalizedJid: string;
  try {
    normalizedJid = normalizeToWhatsAppJid(jid);
  } catch {
    normalizedJid = jid.trim();
  }
  const cat = category ?? 'user';
  return `ratelimit:${cat}:${normalizedJid}`;
}

let isRedisDownWarnLogged = false;

/**
 * Mereset state warning Redis offline (terutama digunakan untuk kebutuhan testing).
 */
export function resetRedisDownWarnState(): void {
  isRedisDownWarnLogged = false;
}

/**
 * Middleware untuk memvalidasi batas laju (Rate Limiting) perintah per user WhatsApp.
 * Menggunakan algoritma Fixed Window Counter berbasis Redis INCR & EXPIRE.
 *
 * Kebijakan Tier:
 * - Action (pinjam/batal): 1 perintah per 5 detik per user (cegah double booking / race condition).
 * - Info (info/jadwal): 10 perintah per 60 detik per user.
 * - Fail-open: Jika Redis mengalami gangguan/offline, sistem tetap mengizinkan perintah (allowed: true)
 *   agar operasional kampus tidak terhenti, dengan mencatat peringatan secara terukur (throttled).
 */
export async function checkRateLimit(
  jid: string,
  options?: RateLimitOptions
): Promise<RateLimitResult> {
  const category = options?.category;
  let defaultMax = config.redis.rateLimitInfoMaxRequests;
  let defaultWindow = config.redis.rateLimitInfoWindowSeconds;

  if (category === 'action') {
    defaultMax = config.redis.rateLimitActionMaxRequests;
    defaultWindow = config.redis.rateLimitActionWindowSeconds;
  } else if (category === 'info') {
    defaultMax = config.redis.rateLimitInfoMaxRequests;
    defaultWindow = config.redis.rateLimitInfoWindowSeconds;
  } else if (config.redis.rateLimitMaxRequests) {
    defaultMax = config.redis.rateLimitMaxRequests;
    defaultWindow = config.redis.rateLimitWindowSeconds;
  }

  const maxRequests = options?.maxRequests ?? defaultMax;
  const windowSeconds = options?.windowSeconds ?? defaultWindow;
  const key = getRateLimitKey(jid, category ?? 'user');

  // 1. Tambahkan hitungan hit pada Redis
  const incrResult = await redisIncr(key);
  if (!incrResult.success) {
    // Kebijakan Fail-Open: Jangan blokir pengguna jika Redis mengalami masalah teknis
    if (!isRedisDownWarnLogged) {
      log.warn(
        `Pemeriksaan rate limit gagal karena gangguan Redis. Menerapkan kebijakan fail-open untuk "${jid}" (peringatan berikutnya dialihkan ke log debug).`,
        { error: incrResult.error.message }
      );
      isRedisDownWarnLogged = true;
    } else {
      log.debug(
        `Redis offline: menerapkan fail-open untuk "${jid}".`,
        { error: incrResult.error.message }
      );
    }
    return Object.freeze({
      allowed: true,
      currentCount: 1,
      limit: maxRequests,
      remaining: maxRequests - 1,
      resetInSeconds: 0,
    });
  }

  // Jika sebelumnya tercatat offline dan kini berhasil, reset status warning
  if (isRedisDownWarnLogged) {
    log.info('Koneksi Redis kembali pulih. Rate limiter beroperasi normal.');
    isRedisDownWarnLogged = false;
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
      category: category ?? 'default',
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
 * Memeriksa apakah notifikasi peringatan rate limit via DM diizinkan untuk dikirim.
 * Menggunakan Redis INCR & EXPIRE dengan cooldown TTL agar bot tidak dianggap spammer
 * oleh WhatsApp ketika pengguna mengirim perintah bertubi-tubi dalam jeda waktu singkat.
 */
export async function shouldSendRateLimitWarning(
  jid: string,
  category: RateLimitCategory | string = 'info',
  cooldownSeconds = 5
): Promise<boolean> {
  let normalizedJid: string;
  try {
    normalizedJid = normalizeToWhatsAppJid(jid);
  } catch {
    normalizedJid = jid.trim();
  }
  const warnKey = `ratelimit:warn:${category}:${normalizedJid}`;
  const incrResult = await redisIncr(warnKey);
  if (!incrResult.success) {
    return true; // Fail-open: tetap kirim jika Redis bermasalah
  }

  if (incrResult.data === 1) {
    await redisExpire(warnKey, Math.max(1, cooldownSeconds));
    return true;
  }

  return false;
}

/**
 * Menghapus data rate limit pengguna tertentu (misal untuk testing atau reset admin).
 */
export async function resetRateLimit(
  jid: string,
  category?: RateLimitCategory | string
): Promise<boolean> {
  if (category) {
    const key = getRateLimitKey(jid, category);
    const result = await redisDel(key);
    return result.success && result.data;
  }
  const keys = [
    getRateLimitKey(jid, 'action'),
    getRateLimitKey(jid, 'info'),
    getRateLimitKey(jid, 'user'),
    getRateLimitKey(jid),
  ];
  let normalizedJid: string;
  try {
    normalizedJid = normalizeToWhatsAppJid(jid);
  } catch {
    normalizedJid = jid.trim();
  }
  keys.push(`ratelimit:warn:action:${normalizedJid}`);
  keys.push(`ratelimit:warn:info:${normalizedJid}`);
  keys.push(`ratelimit:warn:user:${normalizedJid}`);

  const results = await Promise.all(keys.map((k) => redisDel(k)));
  return results.some((r) => r.success && r.data);
}
