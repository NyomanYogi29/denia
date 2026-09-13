import { inArray } from 'drizzle-orm';
import { db, sqlite } from '@/core/db/index.ts';
import { forceEvents, type ForceEvent } from '@/core/db/schema.ts';
import {
  type AppError,
  DatabaseError,
  ErrorCode,
  SlotConflictError,
  ValidationError,
} from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';

const log = logger.child({ module: 'FORCE_EVENT_REPOSITORY' });

export interface CreateForceEventParams {
  readonly roomCodes: readonly string[];
  readonly startDate: string; // ISO 'YYYY-MM-DD'
  readonly endDate: string; // ISO 'YYYY-MM-DD'
  readonly dateIsos: readonly string[]; // Seluruh ISO tanggal di dalam rentang
  readonly eventName: string;
  readonly userJid: string;
}

export interface DisplacedEventBooking {
  readonly id: number;
  readonly roomCode: string;
  readonly bookingDate: string;
  readonly slotCode: string;
  readonly userJid: string;
  readonly userName?: string;
  readonly userClass?: string;
}

export interface CreateForceEventResult {
  readonly events: readonly ForceEvent[];
  readonly displacedBookings: readonly DisplacedEventBooking[];
  readonly isDuplicate: boolean;
}

/**
 * Mendaftarkan agenda pemblokiran sejumlah ruangan sekaligus untuk rentang tanggal tertentu (Fase 5.5).
 * Dieksekusi secara atomik menggunakan SQLite BEGIN IMMEDIATE:
 * 1. Memeriksa konflik agenda force_events aktif lain pada ruangan dan rentang tanggal yang diminta.
 * 2. Memeriksa idempotensi (jika pembuat yang sama mendaftarkan event yang sama persis pada seluruh ruangan).
 * 3. Mengidentifikasi seluruh booking aktif milik Korti/pengguna lain yang terdampak,
 *    mengubah status booking menjadi 'force_cancelled', dan mencatat data korti untuk notifikasi DM.
 * 4. Menyimpan record baru di tabel force_events untuk setiap ruangan dengan slot_code = null (seharian penuh).
 */
export async function createForceEventImmediate(
  params: CreateForceEventParams
): Promise<Result<CreateForceEventResult, AppError>> {
  const { roomCodes, startDate, endDate, dateIsos, eventName, userJid } = params;

  if (roomCodes.length === 0) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Daftar kode ruangan untuk agenda tidak boleh kosong.'
      )
    );
  }

  if (dateIsos.length === 0) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_DATE_FORMAT,
        'Daftar tanggal agenda tidak boleh kosong.'
      )
    );
  }

  const normalizedRooms = roomCodes.map((r) => r.toUpperCase());

  try {
    const transaction = sqlite.transaction(() => {
      // 1. Cek pemblokiran agenda institusi yang sedang aktif pada ruangan dan rentang tanggal ini
      const roomPlaceholders = normalizedRooms.map(() => '?').join(',');
      const existingEvents = sqlite
        .query(
          `SELECT id, event_name, room_code, start_date, end_date, created_by_jid
           FROM force_events
           WHERE room_code IN (${roomPlaceholders})
           AND status = 'active'
           AND start_date <= ? AND end_date >= ?`
        )
        .all(...normalizedRooms, endDate, startDate) as Array<{
          id: number;
          event_name: string;
          room_code: string;
          start_date: string;
          end_date: string;
          created_by_jid: string;
        }>;

      // Cek apakah seluruh ruangan sudah terblokir oleh event identik milik pemanggil sendiri (idempotent duplicate)
      if (existingEvents.length > 0) {
        const isAllIdentical =
          existingEvents.length >= normalizedRooms.length &&
          existingEvents.every(
            (ev) =>
              ev.event_name.toLowerCase() === eventName.toLowerCase() &&
              ev.created_by_jid === userJid &&
              ev.start_date === startDate &&
              ev.end_date === endDate
          );

        if (isAllIdentical) {
          return {
            isDuplicate: true,
            eventIds: existingEvents.map((ev) => ev.id),
            displacedBookings: [] as DisplacedEventBooking[],
          };
        }

        // Jika terdapat event lain yang bertabrakan, tolak dengan SlotConflictError
        const firstConflict = existingEvents[0]!;
        const conflictingRooms = [...new Set(existingEvents.map((e) => e.room_code))];
        throw new SlotConflictError(
          `Ruangan (${conflictingRooms.join(', ')}) pada rentang tanggal tersebut sudah diblokir untuk agenda resmi "${firstConflict.event_name}" (${firstConflict.start_date} s.d. ${firstConflict.end_date}).`,
          { existingEvents, conflictingRooms }
        );
      }

      // 2. Kumpulkan seluruh booking aktif yang menempati ruangan dan tanggal terkait
      const datePlaceholders = dateIsos.map(() => '?').join(',');
      const activeBookings = sqlite
        .query(
          `SELECT b.id, b.room_code, b.booking_date, b.slot_code, b.user_jid,
                  u.nama, u.kelas
           FROM bookings b
           LEFT JOIN users u ON b.user_jid = u.jid
           WHERE b.room_code IN (${roomPlaceholders})
           AND b.booking_date IN (${datePlaceholders})
           AND b.status = 'active'`
        )
        .all(...normalizedRooms, ...dateIsos) as Array<{
          id: number;
          room_code: string;
          booking_date: string;
          slot_code: string;
          user_jid: string;
          nama: string | null;
          kelas: string | null;
        }>;

      const displacedBookings: DisplacedEventBooking[] = activeBookings.map((b) => ({
        id: b.id,
        roomCode: b.room_code,
        bookingDate: b.booking_date,
        slotCode: b.slot_code,
        userJid: b.user_jid,
        userName: b.nama ?? undefined,
        userClass: b.kelas ?? undefined,
      }));

      // 3. Batalkan paksa (force_cancelled) setiap booking aktif yang bertabrakan
      if (displacedBookings.length > 0) {
        for (const displaced of displacedBookings) {
          // Bersihkan riwayat force_cancelled terdahulu pada slot yang sama jika ada, untuk menghindari duplikasi unique index
          sqlite
            .query(
              `DELETE FROM bookings WHERE room_code = ? AND booking_date = ? AND slot_code = ? AND status = 'force_cancelled'`
            )
            .run(displaced.roomCode, displaced.bookingDate, displaced.slotCode);

          sqlite
            .query(
              `UPDATE bookings SET status = 'force_cancelled', notes = ? WHERE id = ?`
            )
            .run(`[FORCE EVENT: ${eventName}]`, displaced.id);
        }
      }

      // 4. Masukkan entri force_events untuk masing-masing ruangan
      const insertStmt = sqlite.query(
        `INSERT INTO force_events (event_name, room_code, start_date, end_date, slot_code, created_by_jid, status)
         VALUES (?, ?, ?, ?, NULL, ?, 'active')
         RETURNING id`
      );

      const createdEventIds: number[] = [];
      for (const room of normalizedRooms) {
        const row = insertStmt.get(
          eventName,
          room,
          startDate,
          endDate,
          userJid
        ) as { id: number };
        createdEventIds.push(row.id);
      }

      return {
        isDuplicate: false,
        eventIds: createdEventIds,
        displacedBookings,
      };
    });

    const result = transaction.immediate();

    const createdRows = await db
      .select()
      .from(forceEvents)
      .where(inArray(forceEvents.id, result.eventIds))
      .all();

    log.info(
      `Berhasil mendaftarkan agenda force event "${eventName}" untuk ruangan ${normalizedRooms.join(', ')} (${startDate} s.d. ${endDate}) oleh ${userJid}, menggeser ${result.displacedBookings.length} booking lama`,
      {
        eventName,
        rooms: normalizedRooms,
        startDate,
        endDate,
        displacedCount: result.displacedBookings.length,
        isDuplicate: result.isDuplicate,
      }
    );

    return ok({
      events: Object.freeze(createdRows),
      displacedBookings: Object.freeze(result.displacedBookings),
      isDuplicate: result.isDuplicate,
    });
  } catch (error) {
    if (error instanceof SlotConflictError) {
      log.warn('Pendaftaran force event ditolak karena konflik event aktif lain', error.metadata);
      return err(error);
    }

    log.error('Terjadi kesalahan database saat eksekusi createForceEventImmediate dengan BEGIN IMMEDIATE', error);
    return err(
      new DatabaseError(
        'Gagal mendaftarkan agenda pemblokiran ruangan pada database.',
        { params },
        error
      )
    );
  }
}
