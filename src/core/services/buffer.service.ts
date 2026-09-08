import type { WASocket } from '@whiskeysockets/baileys';
import { logger } from '@/core/logger';
import { formatBatchRecap, type BatchBookingItem } from '@/core/templates';
import { formatSlotTimeRange, parseSlotString } from '@/core/utils';

const log = logger.child({ module: 'BUFFER_SERVICE' });

/**
 * Durasi default tumbling window buffer (30 detik).
 */
export const DEFAULT_BUFFER_WINDOW_MS = 30_000;

export interface BufferItemInput {
  readonly date: string; // DD/MM/YYYY
  readonly roomCode: string;
  readonly slotCode: string; // e.g. 'DEF' or single 'D'
  readonly borrowerName: string;
  readonly borrowerClass: string;
  readonly borrowerJid?: string;
  readonly groupJid: string; // Target chat JID (grup @g.us atau DM)
}

export interface GroupBufferBucket {
  readonly groupJid: string;
  items: BatchBookingItem[];
  timer: ReturnType<typeof setTimeout> | null;
  windowStartedAt: number;
}

export interface BufferServiceOptions {
  /**
   * Durasi tumbling window dalam milidetik (default: 30000 ms)
   */
  readonly windowMs?: number;
  /**
   * Provider/getter socket Baileys yang aktif
   */
  readonly getSocket: () => WASocket | null;
  /**
   * Handler opsional untuk pengiriman kustom (misal untuk testing atau wrapper)
   */
  readonly onFlush?: (groupJid: string, text: string, items: readonly BatchBookingItem[]) => Promise<void>;
}

/**
 * Service Tumbling Window Buffer untuk mengumpulkan transaksi sukses
 * dan mengirimkannya sebagai 1 pesan rekap ringkas ke grup WhatsApp setiap 30 detik.
 */
export class BufferService {
  private readonly windowMs: number;
  private readonly getSocket: () => WASocket | null;
  private readonly onFlush?: (groupJid: string, text: string, items: readonly BatchBookingItem[]) => Promise<void>;
  private readonly buckets = new Map<string, GroupBufferBucket>();
  private isDestroyed = false;

  constructor(options: BufferServiceOptions) {
    this.windowMs = options.windowMs ?? DEFAULT_BUFFER_WINDOW_MS;
    this.getSocket = options.getSocket;
    this.onFlush = options.onFlush;
  }

  /**
   * Menambahkan transaksi booking sukses ke dalam buffer grup tujuan.
   * Jika bucket untuk grup tersebut belum memiliki timer aktif, window 30 detik akan dimulai.
   */
  public push(input: BufferItemInput): void {
    if (this.isDestroyed) {
      log.warn('Percobaan push ke BufferService yang sudah dimatikan (destroyed)', { input });
      return;
    }

    const { groupJid, date, roomCode, slotCode, borrowerName, borrowerClass, borrowerJid } = input;

    // Hitung otomatis rentang jam (misal DEF -> "10:30 - 13:20")
    const parsed = parseSlotString(slotCode);
    const timeRange = parsed.success
      ? parsed.data.timeRange
      : formatSlotTimeRange([slotCode.trim().toUpperCase() as any]);

    const item: BatchBookingItem = Object.freeze({
      date,
      roomCode,
      slotCode: slotCode.trim().toUpperCase(),
      timeRange,
      borrowerName,
      borrowerClass,
      borrowerJid,
    });

    let bucket = this.buckets.get(groupJid);
    if (!bucket) {
      bucket = {
        groupJid,
        items: [],
        timer: null,
        windowStartedAt: Date.now(),
      };
      this.buckets.set(groupJid, bucket);
    }

    bucket.items.push(item);
    log.debug(`Item berhasil dimasukkan ke buffer [${groupJid}] (total: ${bucket.items.length})`, { item });

    // Mulai tumbling window timer jika belum aktif
    if (!bucket.timer) {
      bucket.windowStartedAt = Date.now();
      bucket.timer = setTimeout(() => {
        void this.flushGroup(groupJid);
      }, this.windowMs);
      log.debug(`Tumbling window (${this.windowMs}ms) dimulai untuk grup ${groupJid}`);
    }
  }

  /**
   * Melakukan flush pada buffer grup tertentu: memformat pesan dan mengirimkannya ke WhatsApp.
   */
  public async flushGroup(groupJid: string): Promise<boolean> {
    const bucket = this.buckets.get(groupJid);
    if (!bucket || bucket.items.length === 0) {
      this.cleanupBucket(groupJid);
      return false;
    }

    // Ambil semua item yang ada saat ini
    const itemsToDispatch = [...bucket.items];

    // Cek kesiapan socket Baileys
    const sock = this.getSocket();
    if (!sock) {
      log.warn(`Gagal flush buffer untuk ${groupJid}: Socket Baileys belum siap / disconnect. Menahan item...`, {
        pendingCount: itemsToDispatch.length,
      });
      // Jangan hapus item! Reset timer untuk coba lagi setelah jeda pendek (5 detik)
      if (bucket.timer) {
        clearTimeout(bucket.timer);
      }
      bucket.timer = setTimeout(() => {
        void this.flushGroup(groupJid);
      }, 5000);
      return false;
    }

    // Format pesan adaptif (one-liner jika 1 item, list jika >= 2 item)
    const formattedText = formatBatchRecap({ bookings: itemsToDispatch });
    if (!formattedText) {
      this.cleanupBucket(groupJid);
      return false;
    }

    try {
      if (this.onFlush) {
        await this.onFlush(groupJid, formattedText, itemsToDispatch);
      } else {
        await sock.sendMessage(groupJid, { text: formattedText });
      }

      log.info(`Pesan rekap batch berhasil dikirim ke grup ${groupJid}`, {
        itemCount: itemsToDispatch.length,
      });

      // Hapus item yang sudah berhasil dikirim
      this.cleanupBucket(groupJid);
      return true;
    } catch (error) {
      log.error(`Terjadi kesalahan saat mengirim rekap batch ke ${groupJid}. Menjadwalkan ulang retry...`, error);

      // Jika gagal kirim, tahan item dan jadwalkan retry dalam 5 detik
      if (bucket.timer) {
        clearTimeout(bucket.timer);
      }
      bucket.timer = setTimeout(() => {
        void this.flushGroup(groupJid);
      }, 5000);

      return false;
    }
  }

  /**
   * Mengirimkan semua buffer yang tertunda di seluruh grup (misal saat rekoneksi atau shutdown)
   */
  public async flushAllPending(): Promise<void> {
    const groupJids = Array.from(this.buckets.keys());
    log.info(`Melakukan flushAllPending pada ${groupJids.length} buffer grup aktif...`);

    for (const groupJid of groupJids) {
      await this.flushGroup(groupJid);
    }
  }

  /**
   * Mengambil jumlah item yang sedang tertahan di buffer suatu grup (untuk testing/monitoring)
   */
  public getPendingCount(groupJid: string): number {
    return this.buckets.get(groupJid)?.items.length ?? 0;
  }

  /**
   * Mengambil semua grup yang memiliki buffer aktif
   */
  public getActiveGroups(): string[] {
    return Array.from(this.buckets.keys());
  }

  /**
   * Membersihkan resource timer dan bucket
   */
  private cleanupBucket(groupJid: string): void {
    const bucket = this.buckets.get(groupJid);
    if (bucket) {
      if (bucket.timer) {
        clearTimeout(bucket.timer);
      }
      this.buckets.delete(groupJid);
    }
  }

  /**
   * Mematikan service secara aman (misal saat shutdown bot)
   */
  public async destroy(): Promise<void> {
    this.isDestroyed = true;
    for (const bucket of this.buckets.values()) {
      if (bucket.timer) {
        clearTimeout(bucket.timer);
      }
    }
    this.buckets.clear();
    log.info('BufferService berhasil di-destroy');
  }
}

/**
 * Factory untuk membuat instance BufferService
 */
export function createBufferService(options: BufferServiceOptions): BufferService {
  return new BufferService(options);
}
