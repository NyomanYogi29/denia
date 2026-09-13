import { inArray } from 'drizzle-orm';
import { db, sqlite } from '@/core/db/index.ts';
import { bookings, forceEvents, type Booking, type ForceEvent } from '@/core/db/schema.ts';
import {
  type AppError,
  DatabaseError,
  ErrorCode,
  NotFoundError,
  ValidationError,
} from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import type { DisplacedBooking } from './force.ts';

const log = logger.child({ module: 'ABORT_REPOSITORY' });

export interface AbortForceBookingParams {
  readonly bookingIds: readonly number[];
  readonly userJid: string;
  readonly userName?: string;
  readonly isStaffOrAdmin: boolean;
  readonly autoDetectSession?: boolean;
}

export interface AbortedForceBookingResult {
  readonly bookings: readonly Booking[];
  readonly roomCode: string;
  readonly bookingDate: string;
  readonly slotCodes: readonly string[];
  readonly reason: string;
  readonly forcedByJid: string;
  readonly displacedKorti: readonly DisplacedBooking[];
  readonly isDuplicate: boolean;
}

export interface AbortForceEventParams {
  readonly eventId: number;
  readonly userJid: string;
  readonly userName?: string;
  readonly isStaffOrAdmin: boolean;
}

export interface AbortedForceEventResult {
  readonly events: readonly ForceEvent[];
  readonly eventName: string;
  readonly roomCodes: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly createdByJid: string;
  readonly displacedKorti: readonly DisplacedBooking[];
  readonly isDuplicate: boolean;
}

/**
 * Membatalkan pengambilalihan paksa (force booking) ruangan oleh admin/staf (Fase 5.6).
 * Dieksekusi secara atomik menggunakan SQLite BEGIN IMMEDIATE:
 * 1. Memeriksa keberadaan booking dan memastikan tipe booking adalah 'institutional'.
 * 2. Memeriksa idempotensi jika status sudah 'cancelled'.
 * 3. Jika hanya 1 ID yang diberikan dan autoDetectSession true, mendeteksi seluruh slot
 *    terkait dalam satu sesi pemesanan paksa yang sama.
 * 4. Mengidentifikasi apakah ada korti yang sebelumnya tergeser (force_cancelled) untuk dinotifikasi kembali.
 * 5. Mengubah status booking menjadi 'cancelled'.
 */
export async function abortForceBookingImmediate(
  params: AbortForceBookingParams
): Promise<Result<AbortedForceBookingResult, AppError>> {
  const { bookingIds, userJid, userName, autoDetectSession = true } = params;

  if (bookingIds.length === 0) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Daftar ID pemesanan yang akan dibatalkan tidak boleh kosong.'
      )
    );
  }

  try {
    const transaction = sqlite.transaction(() => {
      // 1. Ambil data booking yang ditargetkan
      const idPlaceholders = bookingIds.map(() => '?').join(',');
      const rows = sqlite
        .query(
          `SELECT b.id, b.room_code, b.booking_date, b.slot_code, b.user_jid,
                  b.status, b.booking_type, b.notes, b.created_at,
                  u.nama as user_name
           FROM bookings b
           LEFT JOIN users u ON b.user_jid = u.jid
           WHERE b.id IN (${idPlaceholders})`
        )
        .all(...bookingIds) as Array<{
          id: number;
          room_code: string;
          booking_date: string;
          slot_code: string;
          user_jid: string;
          status: string;
          booking_type: string;
          notes: string | null;
          created_at: string;
          user_name: string | null;
        }>;

      if (rows.length === 0) {
        throw new NotFoundError(
          `Peminjaman paksa dengan ID #${bookingIds.join(', #')} tidak ditemukan di database.`,
          { bookingIds }
        );
      }

      // Validasi tipe booking: hanya booking bertipe 'institutional' yang dapat di-abort
      for (const row of rows) {
        if (row.booking_type !== 'institutional') {
          throw new ValidationError(
            ErrorCode.INVALID_COMMAND_SYNTAX,
            `Peminjaman #${row.id} bukan merupakan peminjaman paksa/institusional (tipe: ${row.booking_type}). Gunakan perintah !batal untuk membatalkan peminjaman reguler.`,
            { bookingId: row.id, bookingType: row.booking_type }
          );
        }
      }

      // Cek apakah seluruh booking sudah berstatus 'cancelled' (idempotent duplicate)
      const isAllAlreadyCancelled = rows.every((r) => r.status === 'cancelled');
      if (isAllAlreadyCancelled) {
        const first = rows[0]!;
        return {
          isDuplicate: true,
          bookingIds: rows.map((r) => r.id),
          roomCode: first.room_code,
          bookingDate: first.booking_date,
          slotCodes: rows.map((r) => r.slot_code),
          reason: first.notes ?? '-',
          forcedByJid: first.user_jid,
          displacedKorti: [] as DisplacedBooking[],
        };
      }

      // Kumpulkan ID booking yang berstatus 'active'
      let activeRows = rows.filter((r) => r.status === 'active');
      if (activeRows.length === 0) {
        throw new ValidationError(
          ErrorCode.INVALID_COMMAND_SYNTAX,
          `Peminjaman #${bookingIds.join(', #')} saat ini tidak dalam status aktif (status: ${rows[0]?.status}).`,
          { bookingIds, statuses: rows.map((r) => r.status) }
        );
      }

      const primary = activeRows[0]!;

      // 2. Auto-detect sesi: jika hanya 1 ID diberikan, cari slot lain dari sesi force yang sama
      if (autoDetectSession && bookingIds.length === 1) {
        const companionRows = sqlite
          .query(
            `SELECT b.id, b.room_code, b.booking_date, b.slot_code, b.user_jid,
                    b.status, b.booking_type, b.notes, b.created_at,
                    u.nama as user_name
             FROM bookings b
             LEFT JOIN users u ON b.user_jid = u.jid
             WHERE b.room_code = ? AND b.booking_date = ? AND b.user_jid = ?
               AND b.booking_type = 'institutional' AND b.status = 'active'
               AND b.notes = ?`
          )
          .all(
            primary.room_code,
            primary.booking_date,
            primary.user_jid,
            primary.notes
          ) as typeof rows;

        if (companionRows.length > activeRows.length) {
          activeRows = companionRows;
        }
      }

      const targetIds = activeRows.map((r) => r.id);
      const roomCode = primary.room_code;
      const bookingDate = primary.booking_date;
      const slotCodes = activeRows.map((r) => r.slot_code);
      const reason = primary.notes ?? '-';
      const forcedByJid = primary.user_jid;

      // 3. Identifikasi korti yang sebelumnya tergeser (force_cancelled) pada ruangan, tanggal, dan slot ini
      const slotPlaceholders = slotCodes.map(() => '?').join(',');
      const displacedKortiRows = sqlite
        .query(
          `SELECT b.id, b.room_code, b.booking_date, b.slot_code, b.user_jid,
                  u.nama, u.kelas
           FROM bookings b
           LEFT JOIN users u ON b.user_jid = u.jid
           WHERE b.room_code = ? AND b.booking_date = ?
             AND b.slot_code IN (${slotPlaceholders})
             AND b.status = 'force_cancelled'`
        )
        .all(roomCode, bookingDate, ...slotCodes) as Array<{
          id: number;
          room_code: string;
          booking_date: string;
          slot_code: string;
          user_jid: string;
          nama: string | null;
          kelas: string | null;
        }>;

      const displacedKorti: DisplacedBooking[] = displacedKortiRows.map((d) => ({
        id: d.id,
        roomCode: d.room_code,
        bookingDate: d.booking_date,
        slotCode: d.slot_code,
        userJid: d.user_jid,
        userName: d.nama ?? undefined,
        userClass: d.kelas ?? undefined,
      }));

      // 4. Ubah status booking menjadi 'cancelled'
      const auditNote = userName ? ` [ABORTED BY: ${userName}]` : ` [ABORTED BY ADMIN: ${userJid}]`;
      const updatePlaceholders = targetIds.map(() => '?').join(',');
      sqlite
        .query(
          `UPDATE bookings
           SET status = 'cancelled',
               notes = COALESCE(notes, '') || ?
           WHERE id IN (${updatePlaceholders})`
        )
        .run(auditNote, ...targetIds);

      return {
        isDuplicate: false,
        bookingIds: targetIds,
        roomCode,
        bookingDate,
        slotCodes,
        reason,
        forcedByJid,
        displacedKorti,
      };
    });

    const result = transaction.immediate();

    const cancelledRows = await db
      .select()
      .from(bookings)
      .where(inArray(bookings.id, result.bookingIds))
      .all();

    log.info(
      `Berhasil membatalkan pengambilalihan paksa (abort force) pada ruangan ${result.roomCode} (${result.bookingDate}) untuk slot ${result.slotCodes.join('')} oleh ${userJid}`,
      {
        bookingIds: result.bookingIds,
        roomCode: result.roomCode,
        bookingDate: result.bookingDate,
        slots: result.slotCodes,
        displacedKortiCount: result.displacedKorti.length,
        isDuplicate: result.isDuplicate,
      }
    );

    return ok({
      bookings: Object.freeze(cancelledRows),
      roomCode: result.roomCode,
      bookingDate: result.bookingDate,
      slotCodes: Object.freeze(result.slotCodes),
      reason: result.reason,
      forcedByJid: result.forcedByJid,
      displacedKorti: Object.freeze(result.displacedKorti),
      isDuplicate: result.isDuplicate,
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      return err(error);
    }

    log.error('Terjadi kesalahan database saat eksekusi abortForceBookingImmediate', error);
    return err(
      new DatabaseError(
        'Gagal membatalkan pengambilalihan paksa ruangan pada database.',
        { params },
        error
      )
    );
  }
}

/**
 * Membatalkan agenda pemblokiran sejumlah ruangan (force event) oleh admin/staf (Fase 5.6).
 */
export async function abortForceEventImmediate(
  params: AbortForceEventParams
): Promise<Result<AbortedForceEventResult, AppError>> {
  const { eventId, userJid } = params;

  try {
    const transaction = sqlite.transaction(() => {
      // 1. Ambil data force_event yang ditargetkan
      const targetEvent = sqlite
        .query(
          `SELECT id, event_name, room_code, start_date, end_date, slot_code, created_by_jid, status, created_at
           FROM force_events
           WHERE id = ?`
        )
        .get(eventId) as {
          id: number;
          event_name: string;
          room_code: string;
          start_date: string;
          end_date: string;
          slot_code: string | null;
          created_by_jid: string;
          status: string;
          created_at: string;
        } | null;

      if (!targetEvent) {
        throw new NotFoundError(
          `Agenda pemblokiran ruangan (force event) dengan ID #${eventId} tidak ditemukan.`,
          { eventId }
        );
      }

      // Cek apakah event sudah dibatalkan sebelumnya
      if (targetEvent.status === 'cancelled') {
        return {
          isDuplicate: true,
          eventIds: [targetEvent.id],
          eventName: targetEvent.event_name,
          roomCodes: [targetEvent.room_code],
          startDate: targetEvent.start_date,
          endDate: targetEvent.end_date,
          createdByJid: targetEvent.created_by_jid,
          displacedKorti: [] as DisplacedBooking[],
        };
      }

      // 2. Ambil seluruh companion events jika agenda melibatkan banyak ruangan
      const allEvents = sqlite
        .query(
          `SELECT id, event_name, room_code, start_date, end_date, created_by_jid, status
           FROM force_events
           WHERE event_name = ? AND created_by_jid = ? AND start_date = ? AND end_date = ?
             AND status = 'active'`
        )
        .all(
          targetEvent.event_name,
          targetEvent.created_by_jid,
          targetEvent.start_date,
          targetEvent.end_date
        ) as Array<{
          id: number;
          event_name: string;
          room_code: string;
          start_date: string;
          end_date: string;
          created_by_jid: string;
          status: string;
        }>;

      const eventRows = allEvents.length > 0 ? allEvents : [targetEvent];
      const targetEventIds = eventRows.map((e) => e.id);
      const roomCodes = [...new Set(eventRows.map((e) => e.room_code))];
      const eventName = targetEvent.event_name;
      const startDate = targetEvent.start_date;
      const endDate = targetEvent.end_date;
      const createdByJid = targetEvent.created_by_jid;

      // 3. Kumpulkan korti yang sebelumnya tergeser akibat agenda ini
      const roomPlaceholders = roomCodes.map(() => '?').join(',');
      const displacedKortiRows = sqlite
        .query(
          `SELECT b.id, b.room_code, b.booking_date, b.slot_code, b.user_jid,
                  u.nama, u.kelas
           FROM bookings b
           LEFT JOIN users u ON b.user_jid = u.jid
           WHERE b.room_code IN (${roomPlaceholders})
             AND b.booking_date >= ? AND b.booking_date <= ?
             AND b.status = 'force_cancelled'
             AND b.notes LIKE ?`
        )
        .all(...roomCodes, startDate, endDate, `%${eventName}%`) as Array<{
          id: number;
          room_code: string;
          booking_date: string;
          slot_code: string;
          user_jid: string;
          nama: string | null;
          kelas: string | null;
        }>;

      const displacedKorti: DisplacedBooking[] = displacedKortiRows.map((d) => ({
        id: d.id,
        roomCode: d.room_code,
        bookingDate: d.booking_date,
        slotCode: d.slot_code,
        userJid: d.user_jid,
        userName: d.nama ?? undefined,
        userClass: d.kelas ?? undefined,
      }));

      // 4. Ubah status force_events menjadi 'cancelled'
      const eventIdPlaceholders = targetEventIds.map(() => '?').join(',');
      sqlite
        .query(
          `UPDATE force_events
           SET status = 'cancelled'
           WHERE id IN (${eventIdPlaceholders})`
        )
        .run(...targetEventIds);

      return {
        isDuplicate: false,
        eventIds: targetEventIds,
        eventName,
        roomCodes,
        startDate,
        endDate,
        createdByJid,
        displacedKorti,
      };
    });

    const result = transaction.immediate();

    const cancelledEvents = await db
      .select()
      .from(forceEvents)
      .where(inArray(forceEvents.id, result.eventIds))
      .all();

    log.info(
      `Berhasil membatalkan agenda pemblokiran ruangan "${result.eventName}" (ID: ${result.eventIds.join(', ')}) oleh ${userJid}`,
      {
        eventIds: result.eventIds,
        eventName: result.eventName,
        rooms: result.roomCodes,
        startDate: result.startDate,
        endDate: result.endDate,
        isDuplicate: result.isDuplicate,
      }
    );

    return ok({
      events: Object.freeze(cancelledEvents),
      eventName: result.eventName,
      roomCodes: Object.freeze(result.roomCodes),
      startDate: result.startDate,
      endDate: result.endDate,
      createdByJid: result.createdByJid,
      displacedKorti: Object.freeze(result.displacedKorti),
      isDuplicate: result.isDuplicate,
    });
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError) {
      return err(error);
    }

    log.error('Terjadi kesalahan database saat eksekusi abortForceEventImmediate', error);
    return err(
      new DatabaseError(
        'Gagal membatalkan agenda pemblokiran ruangan pada database.',
        { params },
        error
      )
    );
  }
}
