import type { SlotCode } from '@/core/constants/slots.ts';

/**
 * Nama tab hari kerja resmi di Google Spreadsheet
 */
export type DayTabName = 'SENIN' | 'SELASA' | 'RABU' | 'KAMIS' | 'JUMAT';

export const DAY_TAB_NAMES: readonly DayTabName[] = Object.freeze([
  'SENIN',
  'SELASA',
  'RABU',
  'KAMIS',
  'JUMAT',
]);

/**
 * Koordinat sel header tanggal pada setiap tab hari
 * Sesuai penataan format: Kolom A Baris 1 ("A1")
 */
export const DATE_HEADER_CELL = 'A1';

/**
 * Informasi koordinat sel di dalam sheet
 */
export interface CellCoordinate {
  readonly tab: DayTabName;
  readonly row: number;
  readonly col: string;
  readonly cellA1: string; // e.g. "F10"
}

/**
 * Item pembaruan nilai sel tunggal
 */
export interface CellUpdateItem {
  readonly tab: DayTabName;
  readonly cellA1: string;
  readonly value: string;
}

/**
 * Tipe tugas sinkronisasi antrean background
 */
export type SyncTask =
  | { readonly type: 'sync_booking'; readonly bookingId: number }
  | { readonly type: 'sync_batch_bookings'; readonly bookingIds: readonly number[] }
  | {
      readonly type: 'cancel_slot';
      readonly roomCode: string;
      readonly bookingDate: string;
      readonly slotCode: SlotCode | string;
    }
  | { readonly type: 'sync_day'; readonly isoDate: string }
  | { readonly type: 'sync_week' };

/**
 * Ringkasan hasil sinkronisasi
 */
export interface SheetSyncSummary {
  readonly totalUpdated: number;
  readonly tabsAffected: readonly DayTabName[];
  readonly durationMs: number;
}
