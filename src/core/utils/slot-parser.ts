import {
  SLOTS,
  MIN_BOOKING_SKS,
  MAX_BOOKING_SKS,
  isValidSlotCode,
  type SlotCode,
} from '@/core/constants';
import { ok, err, type Result } from '@/core/types';
import { ValidationError, ErrorCode } from '@/core/errors';
import { logger } from '@/core/logger';

const log = logger.child({ module: 'SLOT_PARSER' });

export interface ParsedSlot {
  readonly raw: string;
  readonly slots: readonly SlotCode[];
  readonly totalSks: number;
  readonly startTime: string;
  readonly endTime: string;
  readonly timeRange: string;
}

export interface SlotParseOptions {
  readonly minSks?: number;
  readonly maxSks?: number;
}

/**
 * Memvalidasi apakah string hanya berisi karakter alfabetik slot akademik A-O.
 */
export function validateSlotCharacters(raw: string): Result<SlotCode[]> {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return err(
      new ValidationError(ErrorCode.INVALID_SLOT_FORMAT, 'Kode slot tidak boleh kosong.', { raw })
    );
  }

  const normalized = raw.trim().toUpperCase();
  const chars = Array.from(normalized);
  const validatedSlots: SlotCode[] = [];

  for (const char of chars) {
    if (!isValidSlotCode(char)) {
      return err(
        new ValidationError(
          ErrorCode.INVALID_SLOT_FORMAT,
          `Karakter slot "${char}" tidak valid. Hanya slot alfabetik A sampai O yang diizinkan.`,
          { raw, invalidChar: char }
        )
      );
    }
    validatedSlots.push(char);
  }

  return ok(validatedSlots);
}

/**
 * Memvalidasi urutan slot harus kontigu (sekuensial tanpa lompatan dan tanpa duplikasi mundur).
 * Contoh: 'DEF' valid, 'ADF' / 'ED' / 'DD' tidak valid.
 */
export function validateSlotContinuity(slots: readonly SlotCode[]): Result<true> {
  if (slots.length <= 1) {
    return ok(true);
  }

  for (let i = 0; i < slots.length - 1; i++) {
    const currentCode = slots[i]!;
    const nextCode = slots[i + 1]!;
    const currentOrder = SLOTS[currentCode].order;
    const nextOrder = SLOTS[nextCode].order;

    if (nextOrder !== currentOrder + 1) {
      return err(
        new ValidationError(
          ErrorCode.INVALID_SLOT_SEQUENCE,
          `Urutan slot "${slots.join('')}" tidak kontigu. Slot peminjaman harus berurutan secara sekuensial (Contoh: DEF).`,
          { slots, brokenAt: [currentCode, nextCode] }
        )
      );
    }
  }

  return ok(true);
}

/**
 * Memvalidasi kuota durasi SKS agar berada dalam batas minimum dan maksimum.
 */
export function validateSlotLimit(
  slots: readonly SlotCode[],
  minSks = MIN_BOOKING_SKS,
  maxSks = MAX_BOOKING_SKS
): Result<true> {
  if (slots.length < minSks) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_SLOT_FORMAT,
        `Durasi peminjaman minimal adalah ${minSks} SKS.`,
        { totalSks: slots.length, minSks }
      )
    );
  }

  if (slots.length > maxSks) {
    return err(
      new ValidationError(
        ErrorCode.SLOT_LIMIT_EXCEEDED,
        `Durasi peminjaman melebihi batas maksimal ${maxSks} SKS per transaksi.`,
        { totalSks: slots.length, maxSks }
      )
    );
  }

  return ok(true);
}

/**
 * Memformat rentang waktu dari deretan slot (Contoh: ['D', 'E', 'F'] -> '10:30 - 13:30').
 */
export function formatSlotTimeRange(slots: readonly SlotCode[]): string {
  if (slots.length === 0) return '';
  const firstSlot = slots[0]!;
  const lastSlot = slots[slots.length - 1]!;
  return `${SLOTS[firstSlot].startTime} - ${SLOTS[lastSlot].endTime}`;
}

/**
 * Melakukan parsing dan validasi komprehensif pada string slot booking.
 * Mengembalikan objek ParsedSlot jika valid, atau ValidationError jika gagal.
 *
 * Contoh penggunaan:
 * parseSlotString('DEF') -> ok({ raw: 'DEF', slots: ['D', 'E', 'F'], totalSks: 3, ... })
 * parseSlotString('ADF') -> err(ValidationError(INVALID_SLOT_SEQUENCE))
 */
export function parseSlotString(raw: string, options?: SlotParseOptions): Result<ParsedSlot> {
  const minSks = options?.minSks ?? MIN_BOOKING_SKS;
  const maxSks = options?.maxSks ?? MAX_BOOKING_SKS;

  // 1. Validasi karakter alfabetik A-O
  const charResult = validateSlotCharacters(raw);
  if (!charResult.success) {
    log.warn('Gagal memvalidasi format karakter slot', { raw, error: charResult.error.message });
    return charResult;
  }

  const slots = charResult.data;

  // 2. Validasi batas kuota SKS (min & max)
  const limitResult = validateSlotLimit(slots, minSks, maxSks);
  if (!limitResult.success) {
    log.warn('Gagal memvalidasi batas durasi SKS', { raw, error: limitResult.error.message });
    return limitResult;
  }

  // 3. Validasi urutan kontigu / sekuensial
  const continuityResult = validateSlotContinuity(slots);
  if (!continuityResult.success) {
    log.warn('Gagal memvalidasi kontinuitas urutan slot', { raw, error: continuityResult.error.message });
    return continuityResult;
  }

  const firstSlot = slots[0]!;
  const lastSlot = slots[slots.length - 1]!;
  const startTime = SLOTS[firstSlot].startTime;
  const endTime = SLOTS[lastSlot].endTime;
  const timeRange = `${startTime} - ${endTime}`;

  const parsed: ParsedSlot = Object.freeze({
    raw: raw.trim().toUpperCase(),
    slots: Object.freeze([...slots]),
    totalSks: slots.length,
    startTime,
    endTime,
    timeRange,
  });

  log.debug('Berhasil mem-parsing slot string', { raw, totalSks: parsed.totalSks, timeRange });
  return ok(parsed);
}

/**
 * Menghitung daftar slot perkuliahan yang telah mulai/terlewat berdasarkan jam saat ini (WITA).
 * Sebuah slot dianggap telah lewat jika waktu saat ini (HH:mm) >= startTime dari slot tersebut.
 */
export function getPassedSlots(currentTimeStr: string): SlotCode[] {
  return (Object.keys(SLOTS) as SlotCode[]).filter((slot) => {
    const startTime = SLOTS[slot].startTime;
    return currentTimeStr >= startTime;
  });
}
