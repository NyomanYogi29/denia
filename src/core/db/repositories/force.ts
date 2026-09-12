import { inArray } from 'drizzle-orm';
import { db, sqlite } from '@/core/db/index.ts';
import { bookings, type Booking } from '@/core/db/schema.ts';
import {
  type AppError,
  DatabaseError,
  ErrorCode,
  SlotConflictError,
  ValidationError,
} from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';

const log = logger.child({ module: 'FORCE_REPOSITORY' });

export interface ForceBookingParams {
  readonly roomCode: string;
  readonly bookingDate: string; // ISO 'YYYY-MM-DD'
  readonly slotCodes: readonly string[]; // e.g. ['D', 'E', 'F']
  readonly userJid: string;
  readonly reason: string;
}

export interface DisplacedBooking {
  readonly id: number;
  readonly roomCode: string;
  readonly bookingDate: string;
  readonly slotCode: string;
  readonly userJid: string;
  readonly userName?: string;
  readonly userClass?: string;
}

export interface ForceBookingResult {
  readonly bookings: readonly Booking[];
  readonly displacedBookings: readonly DisplacedBooking[];
  readonly isDuplicate: boolean;
}

/**
 * Melakukan pengambilalihan paksa (force booking) ruangan untuk agenda institusi/staf/admin (Fase 5.4).
 * Dieksekusi secara atomik menggunakan SQLite BEGIN IMMEDIATE:
 * 1. Memeriksa apakah ruangan sedang diblokir oleh force_event kampus. Jika ya, ditolak.
 * 2. Memeriksa apakah slot sudah dipesan sebagai institutional oleh staf/admin lain. Jika ya, ditolak.
 * 3. Jika slot sudah dipesan oleh pemanggil sendiri dengan tipe institutional, ditangani secara idempoten.
 * 4. Jika ada booking aktif milik Korti (regular/adhoc), ubah status booking lama menjadi 'force_cancelled'
 *    dan simpan rincian data korti terdampak untuk pengiriman DM notifikasi.
 * 5. Buat entri booking baru bertipe 'institutional' dengan status 'active' dan alasan yang dicatat.
 */
export async function forceBookingImmediate(
  params: ForceBookingParams
): Promise<Result<ForceBookingResult, AppError>> {
  const { roomCode, bookingDate, slotCodes, userJid, reason } = params;

  if (slotCodes.length === 0) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_SLOT_FORMAT,
        'Daftar slot peminjaman tidak boleh kosong.'
      )
    );
  }

  const normalizedSlots = slotCodes.map((s) => s.toUpperCase());

  try {
    const transaction = sqlite.transaction(() => {
      // 1. Cek pemblokiran agenda institusi (force_events)
      const eventConflicts = sqlite
        .query(
          `SELECT id, event_name, slot_code FROM force_events
           WHERE room_code = ? AND status = 'active'
           AND start_date <= ? AND end_date >= ?`
        )
        .all(roomCode, bookingDate, bookingDate) as Array<{
          id: number;
          event_name: string;
          slot_code: string | null;
        }>;

      const hasEventConflict = eventConflicts.some((ev) => {
        if (!ev.slot_code) return true;
        const evSlots = ev.slot_code.toUpperCase().split('');
        return normalizedSlots.some((s) => evSlots.includes(s.toUpperCase()));
      });

      if (hasEventConflict) {
        throw new SlotConflictError(
          `Ruangan ${roomCode} pada tanggal ${bookingDate} sedang diblokir untuk agenda resmi institusi (${eventConflicts[0]?.event_name}).`,
          { eventConflicts }
        );
      }

      // 2. Periksa booking aktif yang saat ini menempati slot
      const placeholders = normalizedSlots.map(() => '?').join(',');
      const activeConflicts = sqlite
        .query(
          `SELECT b.id, b.room_code, b.booking_date, b.slot_code, b.user_jid, b.booking_type,
                  u.nama, u.kelas
           FROM bookings b
           LEFT JOIN users u ON b.user_jid = u.jid
           WHERE b.room_code = ? AND b.booking_date = ? AND b.status = 'active'
           AND b.slot_code IN (${placeholders})`
        )
        .all(roomCode, bookingDate, ...normalizedSlots) as Array<{
          id: number;
          room_code: string;
          booking_date: string;
          slot_code: string;
          user_jid: string;
          booking_type: string;
          nama: string | null;
          kelas: string | null;
        }>;

      // Cek apakah seluruh slot sudah dipesan oleh pemanggil sendiri dengan tipe institutional (idempotent duplicate)
      const isAllOwnedByCaller =
        activeConflicts.length === normalizedSlots.length &&
        activeConflicts.every(
          (c) => c.user_jid === userJid && c.booking_type === 'institutional'
        );

      if (isAllOwnedByCaller) {
        return {
          isDuplicate: true,
          bookingIds: activeConflicts.map((c) => c.id),
          displacedBookings: [] as DisplacedBooking[],
        };
      }

      // Cek apakah ada konflik dengan booking institusi milik staf/admin lain
      const institutionalConflicts = activeConflicts.filter(
        (c) => c.booking_type === 'institutional' && c.user_jid !== userJid
      );

      if (institutionalConflicts.length > 0) {
        const first = institutionalConflicts[0]!;
        throw new SlotConflictError(
          `Slot ${institutionalConflicts.map((c) => c.slot_code).join('')} pada ruangan ${roomCode} (${bookingDate}) sudah dipesan untuk agenda institusi oleh staf/admin lain (${first.nama ?? first.user_jid}).`,
          { institutionalConflicts }
        );
      }

      // 3. Kumpulkan data booking lama yang tergeser (displaced)
      const displacedBookings: DisplacedBooking[] = activeConflicts.map((c) => ({
        id: c.id,
        roomCode: c.room_code,
        bookingDate: c.booking_date,
        slotCode: c.slot_code,
        userJid: c.user_jid,
        userName: c.nama ?? undefined,
        userClass: c.kelas ?? undefined,
      }));

      // 4. Ubah status booking lama menjadi 'force_cancelled'
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
            .run(`[FORCE OVERRIDE: ${reason}]`, displaced.id);
        }
      }

      // 5. Masukkan entri booking institutional baru
      const insertStmt = sqlite.query(
        `INSERT INTO bookings (room_code, booking_date, slot_code, user_jid, status, booking_type, notes)
         VALUES (?, ?, ?, ?, 'active', 'institutional', ?)
         RETURNING id`
      );

      const createdIds: number[] = [];
      for (const slot of normalizedSlots) {
        const row = insertStmt.get(
          roomCode,
          bookingDate,
          slot,
          userJid,
          reason
        ) as { id: number };
        createdIds.push(row.id);
      }

      return {
        isDuplicate: false,
        bookingIds: createdIds,
        displacedBookings,
      };
    });

    const result = transaction.immediate();

    const createdRows = await db
      .select()
      .from(bookings)
      .where(inArray(bookings.id, result.bookingIds))
      .all();

    log.info(
      `Berhasil mengeksekusi force booking untuk ${userJid} pada ruangan ${roomCode} (${bookingDate}), menimpa ${result.displacedBookings.length} booking lama`,
      {
        roomCode,
        bookingDate,
        slots: normalizedSlots,
        displacedCount: result.displacedBookings.length,
        isDuplicate: result.isDuplicate,
      }
    );

    return ok({
      bookings: Object.freeze(createdRows),
      displacedBookings: Object.freeze(result.displacedBookings),
      isDuplicate: result.isDuplicate,
    });
  } catch (error) {
    if (error instanceof SlotConflictError) {
      log.warn('Force booking ditolak karena konflik institusi/event', error.metadata);
      return err(error);
    }

    log.error('Terjadi kesalahan database saat eksekusi force booking dengan BEGIN IMMEDIATE', error);
    return err(
      new DatabaseError(
        'Gagal mengeksekusi pengambilalihan ruangan pada database.',
        { params },
        error
      )
    );
  }
}
