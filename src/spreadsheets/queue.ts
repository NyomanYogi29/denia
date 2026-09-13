import { logger } from '@/core/logger/index.ts';
import { batchUpdateValues, type BatchUpdateRangeItem } from './client.ts';
import type { CellUpdateItem, DayTabName } from './types.ts';
import { ErrorCode } from '@/core/errors/index.ts';

const log = logger.child({ module: 'SPREADSHEETS_QUEUE' });

interface QueueState {
  // Peta gabungan sel unik untuk menghindari penulisan redundan: "TAB!A1" -> CellUpdateItem
  pendingUpdates: Map<string, CellUpdateItem>;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  isProcessing: boolean;
  lastDispatchTime: number;
}

const state: QueueState = {
  pendingUpdates: new Map(),
  debounceTimer: null,
  isProcessing: false,
  lastDispatchTime: 0,
};

// Parameter Throttle & Rate Limit Safety
const DEBOUNCE_WINDOW_MS = 1000; // 1 detik tumbling window akumulasi
const MIN_DISPATCH_INTERVAL_MS = 1500; // Minimal jeda 1.5 detik antar request API (maks 40 req/menit)
const MAX_RETRIES = 3;

/**
 * Menambahkan pembaruan sel ke dalam antrean background
 */
export function enqueueCellUpdates(updates: readonly CellUpdateItem[]): void {
  if (updates.length === 0) return;

  for (const item of updates) {
    const key = `'${item.tab}'!${item.cellA1}`;
    state.pendingUpdates.set(key, item);
  }

  log.debug(`Menambahkan ${updates.length} sel ke antrean Google Sheets. Total tertunda: ${state.pendingUpdates.size}`);

  // Jadwalkan debounce jika belum ada timer aktif
  if (!state.debounceTimer && !state.isProcessing) {
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      void processQueue();
    }, DEBOUNCE_WINDOW_MS);
  }
}

/**
 * Memproses dan mengosongkan antrean dengan memanggil batchUpdateValues
 */
export async function processQueue(): Promise<void> {
  if (state.isProcessing || state.pendingUpdates.size === 0) {
    return;
  }

  // Throttler: Pastikan interval minimal sejak pengiriman terakhir
  const now = Date.now();
  const elapsed = now - state.lastDispatchTime;
  if (elapsed < MIN_DISPATCH_INTERVAL_MS) {
    const delay = MIN_DISPATCH_INTERVAL_MS - elapsed;
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      void processQueue();
    }, delay);
    return;
  }

  state.isProcessing = true;

  // Ambil seluruh pembaruan tertunda saat ini
  const itemsToSync = Array.from(state.pendingUpdates.values());
  state.pendingUpdates.clear();

  const batchPayload: BatchUpdateRangeItem[] = itemsToSync.map((item) => ({
    range: `'${item.tab}'!${item.cellA1}`,
    values: [[item.value]],
  }));

  log.info(`Mengirim ${batchPayload.length} pembaruan sel ke Google Sheets via batchUpdate...`);

  let attempt = 0;
  let success = false;

  while (attempt < MAX_RETRIES && !success) {
    attempt++;
    state.lastDispatchTime = Date.now();

    const result = await batchUpdateValues(batchPayload);

    if (result.success) {
      log.info(`Sukses menyinkronkan ${result.data.totalUpdatedCells} sel ke Google Sheets`);
      success = true;
    } else {
      const isRateLimit = result.error.code === ErrorCode.RATE_LIMIT_EXCEEDED;
      log.warn(
        `Percobaan ke-${attempt} gagal memperbarui Google Sheets: ${result.error.userMessage}.`,
        { isRateLimit, attempt }
      );

      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s + random jitter
        const backoffMs = Math.pow(2, attempt - 1) * 1000 + Math.floor(Math.random() * 500);
        log.info(`Menunggu jeda backoff selama ${backoffMs}ms sebelum retry...`);
        await new Promise((resolve) => setTimeout(resolve, backoffMs));
      } else {
        log.error(`Gagal memperbarui Google Sheets setelah ${MAX_RETRIES} kali percobaan!`);
      }
    }
  }

  state.isProcessing = false;

  // Jika ada pembaruan baru yang masuk selama proses berlangsung, proses kembali
  if (state.pendingUpdates.size > 0) {
    state.debounceTimer = setTimeout(() => {
      state.debounceTimer = null;
      void processQueue();
    }, MIN_DISPATCH_INTERVAL_MS);
  }
}

/**
 * Menunggu hingga seluruh antrean pending selesai diproses (berguna untuk CLI dan pengujian)
 */
export async function flushQueue(): Promise<void> {
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
  await processQueue();
}

/**
 * Mengambil jumlah pembaruan yang sedang tertunda di memori
 */
export function getPendingQueueSize(): number {
  return state.pendingUpdates.size;
}

/**
 * Mengosongkan antrean pending tanpa mengirimkan ke API (berguna untuk isolasi unit test)
 */
export function clearPendingQueue(): void {
  if (state.debounceTimer) {
    clearTimeout(state.debounceTimer);
    state.debounceTimer = null;
  }
  state.pendingUpdates.clear();
  state.isProcessing = false;
}
