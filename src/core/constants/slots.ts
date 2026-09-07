/**
 * Kamus Waktu Akademik SKS (Slots) SDP Undiksha
 *
 * Pemetaan 1 SKS = 50 menit per perkuliahan (dengan slot H jeda/ishoma 60 menit),
 * dari pukul 07:30 sampai 22:00 WITA (Slot A s.d. O).
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
  readonly durationMinutes: number;
  readonly description: string;
}

/**
 * Batas durasi peminjaman slot SKS
 */
export const MIN_BOOKING_SKS = 1;
export const MAX_BOOKING_SKS = 4;

/**
 * Kamus data slot waktu akademik SKS resmi SDP Undiksha (Spesifikasi V2)
 */
export const SLOTS: Readonly<Record<SlotCode, SlotInfo>> = Object.freeze({
  A: Object.freeze({
    code: 'A',
    startTime: '07:30',
    endTime: '08:20',
    label: '07:30 - 08:20',
    order: 1,
    durationMinutes: 50,
    description: 'SKS Pagi 1',
  }),
  B: Object.freeze({
    code: 'B',
    startTime: '08:30',
    endTime: '09:20',
    label: '08:30 - 09:20',
    order: 2,
    durationMinutes: 50,
    description: 'SKS Pagi 2',
  }),
  C: Object.freeze({
    code: 'C',
    startTime: '09:30',
    endTime: '10:20',
    label: '09:30 - 10:20',
    order: 3,
    durationMinutes: 50,
    description: 'SKS Pagi 3',
  }),
  D: Object.freeze({
    code: 'D',
    startTime: '10:30',
    endTime: '11:20',
    label: '10:30 - 11:20',
    order: 4,
    durationMinutes: 50,
    description: 'SKS Siang 1',
  }),
  E: Object.freeze({
    code: 'E',
    startTime: '11:30',
    endTime: '12:20',
    label: '11:30 - 12:20',
    order: 5,
    durationMinutes: 50,
    description: 'SKS Siang 2',
  }),
  F: Object.freeze({
    code: 'F',
    startTime: '12:30',
    endTime: '13:20',
    label: '12:30 - 13:20',
    order: 6,
    durationMinutes: 50,
    description: 'SKS Siang 3',
  }),
  G: Object.freeze({
    code: 'G',
    startTime: '13:30',
    endTime: '14:20',
    label: '13:30 - 14:20',
    order: 7,
    durationMinutes: 50,
    description: 'SKS Sore 1',
  }),
  H: Object.freeze({
    code: 'H',
    startTime: '14:30',
    endTime: '15:30',
    label: '14:30 - 15:30',
    order: 8,
    durationMinutes: 60,
    description: 'SKS Jeda / Ishoma',
  }),
  I: Object.freeze({
    code: 'I',
    startTime: '15:30',
    endTime: '16:20',
    label: '15:30 - 16:20',
    order: 9,
    durationMinutes: 50,
    description: 'SKS Sore 2',
  }),
  J: Object.freeze({
    code: 'J',
    startTime: '16:20',
    endTime: '17:10',
    label: '16:20 - 17:10',
    order: 10,
    durationMinutes: 50,
    description: 'SKS Sore 3',
  }),
  K: Object.freeze({
    code: 'K',
    startTime: '17:30',
    endTime: '18:20',
    label: '17:30 - 18:20',
    order: 11,
    durationMinutes: 50,
    description: 'SKS Malam 1',
  }),
  L: Object.freeze({
    code: 'L',
    startTime: '18:20',
    endTime: '19:10',
    label: '18:20 - 19:10',
    order: 12,
    durationMinutes: 50,
    description: 'SKS Malam 2',
  }),
  M: Object.freeze({
    code: 'M',
    startTime: '19:30',
    endTime: '20:20',
    label: '19:30 - 20:20',
    order: 13,
    durationMinutes: 50,
    description: 'SKS Malam 3',
  }),
  N: Object.freeze({
    code: 'N',
    startTime: '20:20',
    endTime: '21:10',
    label: '20:20 - 21:10',
    order: 14,
    durationMinutes: 50,
    description: 'SKS Malam 4',
  }),
  O: Object.freeze({
    code: 'O',
    startTime: '21:10',
    endTime: '22:00',
    label: '21:10 - 22:00',
    order: 15,
    durationMinutes: 50,
    description: 'SKS Malam 5 / Batas Operasional',
  }),
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
