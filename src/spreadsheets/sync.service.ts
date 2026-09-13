import { eq, inArray, and, lte, gte } from 'drizzle-orm';
import { db } from '@/core/db/index.ts';
import { bookings, users, forceEvents, type Booking, type User } from '@/core/db/schema.ts';
import { logger } from '@/core/logger/index.ts';
import { ok, err, type Result } from '@/core/types/index.ts';
import { AppError, ErrorCode } from '@/core/errors/index.ts';
import {
  getCellCoordinate,
  dateToDayTab,
  getWeekDaysForDate,
  ROOM_ROW_MAP,
  SLOT_COL_MAP,
} from './mappings.ts';
import {
  formatBookingCell,
  formatForceBookingCell,
  formatForceEventCell,
  EMPTY_CELL_VALUE,
} from './formatter.ts';
import { enqueueCellUpdates, flushQueue } from './queue.ts';
import { batchUpdateValues, batchClearRanges, type BatchUpdateRangeItem } from './client.ts';
import { DATE_HEADER_CELL, type CellUpdateItem, type DayTabName } from './types.ts';
import { getTodayIso } from '@/core/utils/date.ts';

const log = logger.child({ module: 'SPREADSHEETS_SYNC' });

/**
 * Menyinkronkan 1 booking spesifik ke Google Sheets via antrean background
 */
export async function syncBooking(bookingId: number): Promise<Result<void>> {
  try {
    const row = await db
      .select({
        booking: bookings,
        user: users,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.userJid, users.jid))
      .where(eq(bookings.id, bookingId))
      .get();

    if (!row) {
      log.warn(`Booking dengan ID ${bookingId} tidak ditemukan untuk sinkronisasi`);
      return ok(undefined);
    }

    const { booking, user } = row;
    const coord = getCellCoordinate(booking.roomCode, booking.bookingDate, booking.slotCode);
    if (!coord) {
      log.debug(
        `Slot ${booking.roomCode} ${booking.bookingDate} (${booking.slotCode}) tidak memiliki koordinat spreadsheet (misal hari libur/ruangan unmapped)`
      );
      return ok(undefined);
    }

    if (booking.status !== 'active') {
      // Jika statusnya batal, kosongkan sel
      enqueueCellUpdates([
        {
          tab: coord.tab,
          cellA1: coord.cellA1,
          value: EMPTY_CELL_VALUE,
        },
      ]);
      return ok(undefined);
    }

    const cellValue = formatBookingCell(booking, user);
    enqueueCellUpdates([
      {
        tab: coord.tab,
        cellA1: coord.cellA1,
        value: cellValue,
      },
    ]);

    return ok(undefined);
  } catch (error) {
    log.error(`Gagal sinkronisasi booking ID ${bookingId}`, error);
    return err(
      new AppError({
        code: ErrorCode.EXTERNAL_API_ERROR,
        userMessage: 'Gagal menjadwalkan sinkronisasi booking ke Google Sheets.',
        metadata: { bookingId },
        cause: error,
      })
    );
  }
}

/**
 * Menyinkronkan kumpulan booking (misal multi-slot 1 transaksi) ke Google Sheets via antrean
 */
export async function syncBatchBookings(bookingIds: readonly number[]): Promise<Result<void>> {
  if (bookingIds.length === 0) return ok(undefined);

  try {
    const rows = await db
      .select({
        booking: bookings,
        user: users,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.userJid, users.jid))
      .where(inArray(bookings.id, [...bookingIds]))
      .all();

    const updates: CellUpdateItem[] = [];

    for (const r of rows) {
      const b = r.booking;
      const u = r.user;
      const coord = getCellCoordinate(b.roomCode, b.bookingDate, b.slotCode);
      if (!coord) continue;

      if (b.status !== 'active') {
        updates.push({
          tab: coord.tab,
          cellA1: coord.cellA1,
          value: EMPTY_CELL_VALUE,
        });
      } else {
        const val = formatBookingCell(b, u);
        updates.push({
          tab: coord.tab,
          cellA1: coord.cellA1,
          value: val,
        });
      }
    }

    enqueueCellUpdates(updates);
    return ok(undefined);
  } catch (error) {
    log.error('Gagal sinkronisasi batch bookings', error);
    return err(
      new AppError({
        code: ErrorCode.EXTERNAL_API_ERROR,
        userMessage: 'Gagal menjadwalkan batch sinkronisasi ke Google Sheets.',
        metadata: { bookingIds },
        cause: error,
      })
    );
  }
}

/**
 * Mengosongkan sel slot yang baru saja dibatalkan via antrean background
 */
export async function syncCancelledSlot(
  roomCode: string,
  bookingDate: string,
  slotCode: string
): Promise<Result<void>> {
  const coord = getCellCoordinate(roomCode, bookingDate, slotCode);
  if (!coord) return ok(undefined);

  enqueueCellUpdates([
    {
      tab: coord.tab,
      cellA1: coord.cellA1,
      value: EMPTY_CELL_VALUE,
    },
  ]);

  return ok(undefined);
}

/**
 * Menyinkronkan seluruh data ruangan untuk 1 tanggal penuh (Full Day Reconciliation)
 * Langsung mengeksekusi 1 batchUpdate atomik ke Google Sheets
 */
export async function syncDateFull(
  isoDate: string
): Promise<Result<{ tab: DayTabName; totalUpdated: number }>> {
  const tab = dateToDayTab(isoDate);
  if (!tab) {
    log.info(`Tanggal ${isoDate} bukan hari kerja (Senin-Jumat). Sinkronisasi dilewati.`);
    return ok({ tab: 'SENIN', totalUpdated: 0 });
  }

  try {
    // 1. Ambil format DD/MM/YYYY untuk header tanggal A3
    const [y, m, d] = isoDate.split('-');
    const formattedDate = `${d}/${m}/${y}`;

    // 2. Ambil seluruh booking aktif pada tanggal terkait
    const activeRows = await db
      .select({
        booking: bookings,
        user: users,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.userJid, users.jid))
      .where(and(eq(bookings.bookingDate, isoDate), eq(bookings.status, 'active')))
      .all();

    // 3. Ambil seluruh force events aktif yang mencakup tanggal terkait
    const activeForceEvents = await db
      .select()
      .from(forceEvents)
      .where(
        and(
          eq(forceEvents.status, 'active'),
          lte(forceEvents.startDate, isoDate),
          gte(forceEvents.endDate, isoDate)
        )
      )
      .all();

    // 4. Kumpulkan seluruh pembaruan sel
    const cellValueMap = new Map<string, string>();

    // Masukkan booking reguler/korti
    for (const r of activeRows) {
      const b = r.booking;
      const u = r.user;
      const coord = getCellCoordinate(b.roomCode, b.bookingDate, b.slotCode);
      if (coord && coord.tab === tab) {
        cellValueMap.set(coord.cellA1, formatBookingCell(b, u));
      }
    }

    // Timpa jika ada force event
    for (const ev of activeForceEvents) {
      const row = ROOM_ROW_MAP[ev.roomCode.toUpperCase()];
      if (!row) continue;

      const eventSlots = ev.slotCode
        ? ev.slotCode.toUpperCase().split('')
        : Object.keys(SLOT_COL_MAP);

      for (const slot of eventSlots) {
        const col = SLOT_COL_MAP[slot];
        if (col) {
          const cellA1 = `${col}${row}`;
          cellValueMap.set(cellA1, formatForceEventCell(ev.eventName));
        }
      }
    }

    // 5. Bersihkan data slot lama pada tab tersebut agar booking yang batal kembali kosong
    await batchClearRanges([
      `'${tab}'!C6:Q21`,
      `'${tab}'!C27:Q39`,
      `'${tab}'!C45:Q45`,
    ]);

    // 6. Susun payload batchUpdate
    const batchData: BatchUpdateRangeItem[] = [];

    // Header cell A1 (DATE_HEADER_CELL)
    batchData.push({
      range: `'${tab}'!${DATE_HEADER_CELL}`,
      values: [[`TANGGAL: ${formattedDate}`]],
    });

    for (const [cellA1, value] of cellValueMap.entries()) {
      batchData.push({
        range: `'${tab}'!${cellA1}`,
        values: [[value]],
      });
    }

    log.info(`Menyinkronkan rekonsiliasi penuh ${isoDate} ke tab "${tab}" (${batchData.length} sel)...`);
    const updateResult = await batchUpdateValues(batchData);

    if (!updateResult.success) {
      return updateResult;
    }

    return ok({
      tab,
      totalUpdated: updateResult.data.totalUpdatedCells,
    });
  } catch (error) {
    log.error(`Gagal melakukan syncDateFull untuk ${isoDate}`, error);
    return err(
      new AppError({
        code: ErrorCode.EXTERNAL_API_ERROR,
        userMessage: `Gagal rekonsiliasi tanggal ${isoDate} ke Google Sheets.`,
        metadata: { isoDate },
        cause: error,
      })
    );
  }
}

/**
 * Memperbarui teks header tanggal A1 pada kelima tab hari (SENIN - JUMAT)
 * tanpa menghapus atau mengubah grid jadwal ruangan yang sudah ada.
 */
export async function updateWeekHeaders(
  referenceIsoDate?: string
): Promise<Result<{ weekDays: Record<DayTabName, { iso: string; formatted: string }> }>> {
  const baseIso = referenceIsoDate ?? getTodayIso();
  const weekDays = getWeekDaysForDate(baseIso);

  const updates: BatchUpdateRangeItem[] = [];
  for (const [tab, dayInfo] of Object.entries(weekDays) as [DayTabName, { iso: string; formatted: string }][]) {
    updates.push({
      range: `'${tab}'!${DATE_HEADER_CELL}`,
      values: [[`TANGGAL: ${dayInfo.formatted}`]],
    });
  }

  log.info(
    `Memperbarui header tanggal minggu untuk kelima tab (Senin ${weekDays.SENIN.formatted} - Jumat ${weekDays.JUMAT.formatted})...`
  );
  const updateRes = await batchUpdateValues(updates);
  if (!updateRes.success) {
    return updateRes;
  }

  return ok({ weekDays });
}

/**
 * Menyinkronkan seluruh minggu (Senin s.d. Jumat)
 * Mengupdate header tanggal A1 dan seluruh jadwal ruangan untuk setiap hari kerja.
 */
export async function syncCurrentWeek(
  referenceIsoDate?: string
): Promise<Result<{ totalDays: number; weekDays: Record<DayTabName, { iso: string; formatted: string }> }>> {
  const baseIso = referenceIsoDate ?? getTodayIso();
  const weekDays = getWeekDaysForDate(baseIso);

  log.info(
    `Memulai rekonsiliasi mingguan Google Sheets (Senin ${weekDays.SENIN.formatted} - Jumat ${weekDays.JUMAT.formatted})...`
  );

  let count = 0;
  for (const dayInfo of Object.values(weekDays)) {
    const res = await syncDateFull(dayInfo.iso);
    if (res.success) {
      count++;
    }
  }

  log.info(`Rekonsiliasi mingguan selesai. Berhasil menyinkronkan ${count} hari kerja.`);
  return ok({ totalDays: count, weekDays });
}
