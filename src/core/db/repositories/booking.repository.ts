import { and, eq, inArray, lte, gte } from 'drizzle-orm';
import { db, sqlite } from '@/core/db/index.ts';
import {
  bookings,
  forceEvents,
  type Booking,
  type ForceEvent,
  type BookingType,
} from '@/core/db/schema.ts';
import {
  AppError,
  DatabaseError,
  ErrorCode,
  NotFoundError,
  SlotConflictError,
  ValidationError,
} from '@/core/errors';
import { logger } from '@/core/logger';
import { err, ok, type Result } from '@/core/types';

const log = logger.child({ module: 'BOOKING_REPOSITORY' });

export interface CheckAvailabilityParams {
  readonly roomCode: string;
  readonly bookingDate: string; // Format ISO: 'YYYY-MM-DD'
  readonly slotCodes: readonly string[]; // Array slot e.g. ['D', 'E', 'F']
}

export interface SlotAvailabilityResult {
  readonly isAvailable: boolean;
  readonly conflictingBookings: readonly Booking[];
  readonly conflictingEvents: readonly ForceEvent[];
}

export interface CreateBookingParams {
  readonly roomCode: string;
  readonly bookingDate: string; // 'YYYY-MM-DD'
  readonly slotCodes: readonly string[]; // Unit slot e.g. ['D', 'E', 'F']
  readonly userJid: string;
  readonly bookingType?: BookingType;
  readonly notes?: string;
}

/**
 * Memeriksa apakah suatu slot pada tanggal dan ruangan tertentu sedang terisi oleh booking aktif
 * atau diblokir oleh agenda force event kampus.
 */
export async function checkSlotAvailability(
  params: CheckAvailabilityParams
): Promise<Result<SlotAvailabilityResult, AppError>> {
  const { roomCode, bookingDate, slotCodes } = params;

  if (slotCodes.length === 0) {
    return err(
      new ValidationError(ErrorCode.INVALID_SLOT_FORMAT, 'Daftar kode slot tidak boleh kosong.')
    );
  }

  try {
    // 1. Cek booking aktif pada slot yang diminta
    const activeBookings = await db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.roomCode, roomCode),
          eq(bookings.bookingDate, bookingDate),
          eq(bookings.status, 'active'),
          inArray(bookings.slotCode, [...slotCodes])
        )
      )
      .all();

    // 2. Cek force events yang aktif meliputi tanggal ini
    const activeEvents = await db
      .select()
      .from(forceEvents)
      .where(
        and(
          eq(forceEvents.roomCode, roomCode),
          eq(forceEvents.status, 'active'),
          lte(forceEvents.startDate, bookingDate),
          gte(forceEvents.endDate, bookingDate)
        )
      )
      .all();

    // Filter force event yang mencakup slot terkait (jika event.slotCode null berarti memblokir seharian penuh)
    const conflictingEvents = activeEvents.filter((ev) => {
      if (!ev.slotCode) return true; // Blokir seharian penuh
      const eventSlots = ev.slotCode.toUpperCase().split('');
      return slotCodes.some((code) => eventSlots.includes(code.toUpperCase()));
    });

    const isAvailable = activeBookings.length === 0 && conflictingEvents.length === 0;

    return ok({
      isAvailable,
      conflictingBookings: activeBookings,
      conflictingEvents,
    });
  } catch (error) {
    log.error('Gagal memeriksa ketersediaan slot di basis data', error);
    return err(
      new DatabaseError(
        'Gagal memeriksa ketersediaan slot pada basis data.',
        { params },
        error
      )
    );
  }
}

/**
 * Mencatat peminjaman ruangan dengan transaksi atomik SQLite (BEGIN IMMEDIATE).
 * Jika ada slot yang bertabrakan di milidetik bersamaan, transaksi dibatalkan (rollback)
 * dan mengembalikan SlotConflictError.
 */
export async function createBookingImmediate(
  params: CreateBookingParams
): Promise<Result<Booking[], AppError>> {
  const { roomCode, bookingDate, slotCodes, userJid, bookingType = 'adhoc', notes } = params;

  if (slotCodes.length === 0) {
    return err(
      new ValidationError(ErrorCode.INVALID_SLOT_FORMAT, 'Daftar slot peminjaman tidak boleh kosong.')
    );
  }

  try {
    // Gunakan BEGIN IMMEDIATE bawaan bun:sqlite untuk mengunci penulisan secara eksklusif
    // Mencegah race condition multi-korti
    const transaction = sqlite.transaction(() => {
      // 1. Double check ketersediaan slot di dalam transaksi terisolasi
      const activeConflicts = sqlite
        .query(
          `SELECT id, room_code, booking_date, slot_code, user_jid FROM bookings 
           WHERE room_code = ? AND booking_date = ? AND status = 'active' 
           AND slot_code IN (${slotCodes.map(() => '?').join(',')})`
        )
        .all(roomCode, bookingDate, ...slotCodes) as any[];

      if (activeConflicts.length > 0) {
        throw new SlotConflictError(
          `Slot ruangan ${roomCode} pada tanggal ${bookingDate} baru saja dipesan oleh kelas lain.`,
          { conflictingSlots: activeConflicts.map((c) => c.slot_code) }
        );
      }

      // 2. Cek force events yang memblokir
      const eventConflicts = sqlite
        .query(
          `SELECT id, event_name, slot_code FROM force_events
           WHERE room_code = ? AND status = 'active'
           AND start_date <= ? AND end_date >= ?`
        )
        .all(roomCode, bookingDate, bookingDate) as any[];

      const hasEventConflict = eventConflicts.some((ev) => {
        if (!ev.slot_code) return true;
        const evSlots = ev.slot_code.toUpperCase().split('');
        return slotCodes.some((s) => evSlots.includes(s.toUpperCase()));
      });

      if (hasEventConflict) {
        throw new SlotConflictError(
          `Ruangan ${roomCode} pada tanggal ${bookingDate} sedang diblokir untuk agenda institusi.`,
          { eventConflicts }
        );
      }

      // 3. Masukkan record pemesanan per 1 unit SKS
      const createdIds: number[] = [];
      const insertStmt = sqlite.query(
        `INSERT INTO bookings (room_code, booking_date, slot_code, user_jid, status, booking_type, notes)
         VALUES (?, ?, ?, ?, 'active', ?, ?)
         RETURNING id`
      );

      for (const slot of slotCodes) {
        const row = insertStmt.get(
          roomCode,
          bookingDate,
          slot.toUpperCase(),
          userJid,
          bookingType,
          notes ?? null
        ) as { id: number };
        createdIds.push(row.id);
      }

      return createdIds;
    });

    const createdIds = transaction.immediate();

    // Query data hasil menggunakan Drizzle agar mapping properti camelCase (roomCode, bookingDate, slotCode, dll.) presisi
    const insertedRows = await db
      .select()
      .from(bookings)
      .where(inArray(bookings.id, createdIds))
      .all();

    log.info(`Berhasil menyimpan ${insertedRows.length} unit slot booking untuk ${userJid}`, {
      roomCode,
      bookingDate,
      slots: slotCodes,
    });

    return ok(insertedRows);
  } catch (error) {
    if (error instanceof SlotConflictError) {
      log.warn('Pemesanan ruangan ditolak karena konflik slot', error.metadata);
      return err(error);
    }

    const errStr = error instanceof Error ? error.message : String(error);
    if (
      errStr.includes('UNIQUE constraint failed') ||
      errStr.includes('SQLITE_CONSTRAINT') ||
      errStr.includes('idx_bookings_unique_active_slot')
    ) {
      log.warn('Pemesanan ruangan bertabrakan (UNIQUE constraint violation)', { params });
      return err(
        new SlotConflictError(
          `Slot pada ruangan ${roomCode} baru saja dipesan oleh orang lain sesaat yang lalu.`,
          { error: errStr }
        )
      );
    }

    log.error('Terjadi kesalahan database saat membuat booking dengan BEGIN IMMEDIATE', error);
    return err(
      new DatabaseError(
        'Gagal mencatat pemesanan ruangan pada database.',
        { params },
        error
      )
    );
  }
}

export interface CancelBookingParams {
  readonly roomCode: string;
  readonly bookingDate: string; // ISO 'YYYY-MM-DD'
  readonly slotCodes: readonly string[]; // e.g. ['D', 'E', 'F']
  readonly userJid: string;
  readonly isStaffOrAdmin?: boolean;
}

/**
 * Membatalkan peminjaman ruangan yang aktif dengan transaksi atomik SQLite (BEGIN IMMEDIATE).
 * Memvalidasi kepemilikan peminjaman (hanya pemilik atau admin/staf yang berhak membatalkan).
 */
export async function cancelBookingImmediate(
  params: CancelBookingParams
): Promise<Result<Booking[], AppError>> {
  const { roomCode, bookingDate, slotCodes, userJid, isStaffOrAdmin = false } = params;

  if (slotCodes.length === 0) {
    return err(
      new ValidationError(ErrorCode.INVALID_SLOT_FORMAT, 'Daftar kode slot untuk pembatalan tidak boleh kosong.')
    );
  }

  const normalizedSlots = slotCodes.map((s) => s.toUpperCase());

  try {
    const transaction = sqlite.transaction(() => {
      // 1. Ambil data booking aktif pada slot, ruangan, dan tanggal yang bersangkutan
      const placeholders = normalizedSlots.map(() => '?').join(',');
      const activeBookings = sqlite
        .query(
          `SELECT id, room_code, booking_date, slot_code, user_jid, status 
           FROM bookings 
           WHERE room_code = ? AND booking_date = ? AND status = 'active' 
           AND slot_code IN (${placeholders})`
        )
        .all(roomCode, bookingDate, ...normalizedSlots) as Array<{
          id: number;
          room_code: string;
          booking_date: string;
          slot_code: string;
          user_jid: string;
          status: string;
        }>;

      if (activeBookings.length === 0) {
        throw new NotFoundError(
          ErrorCode.BOOKING_NOT_FOUND,
          `Tidak ditemukan peminjaman aktif untuk ruangan ${roomCode} pada tanggal ${bookingDate} (slot ${normalizedSlots.join('')}).`,
          { roomCode, bookingDate, slotCodes: normalizedSlots }
        );
      }

      const foundSlotCodes = activeBookings.map((b) => b.slot_code.toUpperCase());
      const missingSlots = normalizedSlots.filter((s) => !foundSlotCodes.includes(s));
      if (missingSlots.length > 0) {
        throw new NotFoundError(
          ErrorCode.BOOKING_NOT_FOUND,
          `Peminjaman aktif untuk slot ${missingSlots.join('')} pada ruangan ${roomCode} (${bookingDate}) tidak ditemukan atau sudah dibatalkan sebelumnya.`,
          { missingSlots, foundSlots: foundSlotCodes }
        );
      }

      // 2. Validasi kepemilikan: pengguna biasa hanya boleh membatalkan booking miliknya sendiri
      if (!isStaffOrAdmin) {
        const notOwned = activeBookings.filter((b) => b.user_jid !== userJid);
        if (notOwned.length > 0) {
          throw new AppError({
            code: ErrorCode.NOT_BOOKING_OWNER,
            userMessage: `Anda tidak memiliki izin membatalkan slot ${notOwned.map((b) => b.slot_code).join('')}. Peminjaman ini dibuat oleh pengguna lain.`,
            metadata: {
              notOwnedSlots: notOwned.map((b) => b.slot_code),
              userJid,
            },
          });
        }
      }

      // 3. Lakukan pembatalan (update status menjadi 'cancelled')
      const bookingIds = activeBookings.map((b) => b.id);
      const updatePlaceholders = bookingIds.map(() => '?').join(',');
      sqlite
        .query(`UPDATE bookings SET status = 'cancelled' WHERE id IN (${updatePlaceholders})`)
        .run(...bookingIds);

      return bookingIds;
    });

    const cancelledIds = transaction.immediate();

    // Query hasil pembaruan via Drizzle
    const cancelledRows = await db
      .select()
      .from(bookings)
      .where(inArray(bookings.id, cancelledIds))
      .all();

    log.info(`Berhasil membatalkan ${cancelledRows.length} slot peminjaman untuk ruangan ${roomCode} (${bookingDate})`, {
      roomCode,
      bookingDate,
      slots: normalizedSlots,
      userJid,
      isStaffOrAdmin,
    });

    return ok(cancelledRows);
  } catch (error) {
    if (
      error instanceof NotFoundError ||
      (error instanceof AppError && error.code === ErrorCode.NOT_BOOKING_OWNER)
    ) {
      log.warn('Pembatalan peminjaman ruangan ditolak', {
        code: (error as any).code,
        message: (error as Error).message,
      });
      return err(error as AppError);
    }

    log.error('Terjadi kesalahan database saat membatalkan peminjaman dengan BEGIN IMMEDIATE', error);
    return err(
      new DatabaseError(
        'Gagal membatalkan pemesanan ruangan pada database.',
        { params },
        error
      )
    );
  }
}
