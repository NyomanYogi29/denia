import type { SlotCode } from '@/core/constants/slots.ts';
import type { DayTabName, CellCoordinate } from './types.ts';
import { DEFAULT_TIMEZONE } from '@/core/utils/date.ts';

/**
 * Peta kode ruangan ke nomor baris pada template spreadsheet TEST 1 AI MIX.xlsx
 */
export const ROOM_ROW_MAP: Readonly<Record<string, number>> = Object.freeze({
  // Lantai 1-4 Gedung R.A. Kartini
  'RAK_1.1': 6,
  'RAK_1.2': 7,
  'RAK_1.3': 8,
  'RAK_1.4': 9,
  'RAK_2.1': 10,
  'RAK_2.2': 11,
  'RAK_2.3': 12,
  'RAK_2.4': 13,
  'RAK_3.1': 14,
  'RAK_3.2': 15,
  'RAK_3.3': 16,
  'RAK_3.4': 17,
  'RAK_4.1': 18,
  'RAK_4.2': 19,
  'RAK_4.3': 20,
  'RAK_4.4': 21,

  // Gedung Ki Hajar Dewantara
  'HYBRID': 27,
  'KHD_HYBRID': 27,
  'KHD_2.1': 28, // Reserved di template
  'KHD_2.2': 29,
  'KHD_2.3': 30,
  'KHD_2.4': 31,
  'KHD_3.1': 32, // Reserved di template
  'KHD_3.2': 33,
  'KHD_3.3': 34,
  'KHD_3.4': 35,
  'KHD_4.1': 36, // Reserved di template
  'KHD_4.2': 37,
  'KHD_4.3': 38,
  'KHD_4.4': 39,

  // Auditorium
  'AUDITORIUM': 45,
});

/**
 * Peta kode slot jam ke huruf kolom Google Sheets
 */
export const SLOT_COL_MAP: Readonly<Record<string, string>> = Object.freeze({
  A: 'C',
  B: 'D',
  C: 'E',
  D: 'F',
  E: 'G',
  F: 'H',
  G: 'I',
  H: 'J',
  I: 'K',
  J: 'L',
  K: 'M',
  L: 'N',
  M: 'O',
  N: 'P',
  O: 'Q',
});

/**
 * Mengambil nomor baris di spreadsheet berdasarkan kode ruangan
 */
export function getRoomRow(roomCode: string): number | null {
  const normalized = roomCode.trim().toUpperCase();
  return ROOM_ROW_MAP[normalized] ?? null;
}

/**
 * Mengambil huruf kolom spreadsheet berdasarkan kode slot SKS
 */
export function getSlotColumn(slotCode: SlotCode | string): string | null {
  const normalized = slotCode.trim().toUpperCase();
  return SLOT_COL_MAP[normalized] ?? null;
}

/**
 * Mengonversi tanggal ISO (YYYY-MM-DD) ke nama tab hari kerja (SENIN - JUMAT)
 * Mengembalikan null jika tanggal jatuh pada hari Sabtu atau Minggu.
 */
export function dateToDayTab(isoDate: string): DayTabName | null {
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const year = Number.parseInt(yearStr!, 10);
  const month = Number.parseInt(monthStr!, 10);
  const day = Number.parseInt(dayStr!, 10);

  if (!year || !month || !day) return null;

  // Menggunakan Date lokal berdasarkan komponen tanggal yang tepat
  const dateObj = new Date(year, month - 1, day);
  const dayOfWeek = dateObj.getDay(); // 0 = Minggu, 1 = Senin, ..., 5 = Jumat, 6 = Sabtu

  switch (dayOfWeek) {
    case 1:
      return 'SENIN';
    case 2:
      return 'SELASA';
    case 3:
      return 'RABU';
    case 4:
      return 'KAMIS';
    case 5:
      return 'JUMAT';
    default:
      return null;
  }
}

/**
 * Menghasilkan koordinat sel lengkap (tab, baris, kolom, dan alamat A1 seperti "F10")
 */
export function getCellCoordinate(
  roomCode: string,
  bookingDateIso: string,
  slotCode: SlotCode | string
): CellCoordinate | null {
  const tab = dateToDayTab(bookingDateIso);
  if (!tab) return null;

  const row = getRoomRow(roomCode);
  if (!row) return null;

  const col = getSlotColumn(slotCode);
  if (!col) return null;

  return Object.freeze({
    tab,
    row,
    col,
    cellA1: `${col}${row}`,
  });
}

/**
 * Mendapatkan rentang tanggal Senin - Jumat untuk minggu dari tanggal ISO yang diberikan
 */
export function getWeekDaysForDate(
  isoDate: string,
  options?: { weekendRollForward?: boolean }
): Record<DayTabName, { iso: string; formatted: string }> {
  const [yearStr, monthStr, dayStr] = isoDate.split('-');
  const year = Number.parseInt(yearStr!, 10);
  const month = Number.parseInt(monthStr!, 10);
  const day = Number.parseInt(dayStr!, 10);

  const baseDate = new Date(year, month - 1, day);
  const currentDay = baseDate.getDay(); // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

  // Jika hari akhir pekan (Sabtu/Minggu), secara default maju ke hari Senin minggu baru (persiapan pekan)
  let diffToMonday: number;
  if (options?.weekendRollForward ?? true) {
    if (currentDay === 0) diffToMonday = 1; // Minggu -> Senin besok (+1)
    else if (currentDay === 6) diffToMonday = 2; // Sabtu -> Senin lusa (+2)
    else diffToMonday = 1 - currentDay;
  } else {
    diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;
  }

  const monday = new Date(baseDate);
  monday.setDate(baseDate.getDate() + diffToMonday);

  const result = {} as Record<DayTabName, { iso: string; formatted: string }>;
  const dayNames: DayTabName[] = ['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUMAT'];

  for (let i = 0; i < 5; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);

    const dYear = d.getFullYear();
    const dMonth = String(d.getMonth() + 1).padStart(2, '0');
    const dDay = String(d.getDate()).padStart(2, '0');

    const dIso = `${dYear}-${dMonth}-${dDay}`;
    const dFormatted = `${dDay}/${dMonth}/${dYear}`;

    result[dayNames[i]!] = {
      iso: dIso,
      formatted: dFormatted,
    };
  }

  return Object.freeze(result);
}
