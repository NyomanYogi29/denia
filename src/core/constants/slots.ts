/**
 * Kamus Waktu Akademik SKS (Slots) SDP Undiksha
 *
 * Pemetaan 1 SKS = 1 Jam (60 menit), dari pukul 07:30 sampai 22:30 WITA.
 */

export const SLOT_CODES = Object.freeze([
  'A',
  'B',
  'C',
  'D',
  'E',
  'F',
  'G',
  'H',
  'I',
  'J',
  'K',
  'L',
  'M',
  'N',
  'O',
] as const);

export type SlotCode = (typeof SLOT_CODES)[number];

export interface SlotInfo {
  readonly code: SlotCode;
  readonly startTime: string;
  readonly endTime: string;
  readonly label: string;
  readonly order: number;
}

/**
 * Batas durasi peminjaman slot SKS
 */
export const MIN_BOOKING_SKS = 1;
export const MAX_BOOKING_SKS = 4;

/**
 * Kamus data slot waktu akademik SKS
 */
export const SLOTS: Readonly<Record<SlotCode, SlotInfo>> = Object.freeze({
  A: Object.freeze({ code: 'A', startTime: '07:30', endTime: '08:30', label: '07:30 - 08:30', order: 1 }),
  B: Object.freeze({ code: 'B', startTime: '08:30', endTime: '09:30', label: '08:30 - 09:30', order: 2 }),
  C: Object.freeze({ code: 'C', startTime: '09:30', endTime: '10:30', label: '09:30 - 10:30', order: 3 }),
  D: Object.freeze({ code: 'D', startTime: '10:30', endTime: '11:30', label: '10:30 - 11:30', order: 4 }),
  E: Object.freeze({ code: 'E', startTime: '11:30', endTime: '12:30', label: '11:30 - 12:30', order: 5 }),
  F: Object.freeze({ code: 'F', startTime: '12:30', endTime: '13:30', label: '12:30 - 13:30', order: 6 }),
  G: Object.freeze({ code: 'G', startTime: '13:30', endTime: '14:30', label: '13:30 - 14:30', order: 7 }),
  H: Object.freeze({ code: 'H', startTime: '14:30', endTime: '15:30', label: '14:30 - 15:30', order: 8 }),
  I: Object.freeze({ code: 'I', startTime: '15:30', endTime: '16:30', label: '15:30 - 16:30', order: 9 }),
  J: Object.freeze({ code: 'J', startTime: '16:30', endTime: '17:30', label: '16:30 - 17:30', order: 10 }),
  K: Object.freeze({ code: 'K', startTime: '17:30', endTime: '18:30', label: '17:30 - 18:30', order: 11 }),
  L: Object.freeze({ code: 'L', startTime: '18:30', endTime: '19:30', label: '18:30 - 19:30', order: 12 }),
  M: Object.freeze({ code: 'M', startTime: '19:30', endTime: '20:30', label: '19:30 - 20:30', order: 13 }),
  N: Object.freeze({ code: 'N', startTime: '20:30', endTime: '21:30', label: '20:30 - 21:30', order: 14 }),
  O: Object.freeze({ code: 'O', startTime: '21:30', endTime: '22:30', label: '21:30 - 22:30', order: 15 }),
});

/**
 * Type guard untuk memeriksa apakah sebuah string merupakan kode slot valid (A-O).
 */
export function isValidSlotCode(code: string): code is SlotCode {
  if (typeof code !== 'string') return false;
  return Object.hasOwn(SLOTS, code.toUpperCase());
}

/**
 * Mengambil informasi slot berdasarkan kode (case-insensitive).
 */
export function getSlotInfo(code: string): SlotInfo | undefined {
  if (typeof code !== 'string') return undefined;
  const normalized = code.toUpperCase();
  if (isValidSlotCode(normalized)) {
    return SLOTS[normalized];
  }
  return undefined;
}
