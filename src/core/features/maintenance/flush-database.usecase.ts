import { db } from '@/core/db/index.ts';
import { bookings, forceEvents, rooms, users } from '@/core/db/schema.ts';
import { AppError, ErrorCode, ValidationError } from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import type { FlushResult, FlushTarget } from './types.ts';

const log = logger.child({ module: 'MAINTENANCE_USECASE' });

/**
 * Memvalidasi dan menormalisasi string target flushdb menjadi tipe FlushTarget yang sah
 */
export function normalizeFlushTarget(rawTarget: string): FlushTarget | null {
  const normalized = rawTarget.toLowerCase().trim().replace(/[-_]/g, '_');

  if (normalized === 'all') return 'all';
  if (normalized === 'user' || normalized === 'users') return 'user';
  if (normalized === 'rooms' || normalized === 'room') return 'rooms';
  if (normalized === 'force_events' || normalized === 'forceevents' || normalized === 'force') return 'force_events';
  if (normalized === 'bookings' || normalized === 'booking') return 'bookings';

  return null;
}

/**
 * Use case murni untuk menghapus data tabel tertentu dari database dengan penanganan relasi cascade.
 */
export async function flushDatabaseUseCase(
  target: FlushTarget
): Promise<Result<FlushResult, AppError>> {
  log.warn(`Memulai eksekusi flush database untuk target: "${target}"`);

  try {
    const deletedCounts: {
      bookings?: number;
      forceEvents?: number;
      users?: number;
      rooms?: number;
    } = {};

    switch (target) {
      case 'all': {
        const deletedBookings = await db.delete(bookings).returning();
        const deletedForce = await db.delete(forceEvents).returning();
        const deletedUsers = await db.delete(users).returning();
        const deletedRooms = await db.delete(rooms).returning();

        deletedCounts.bookings = deletedBookings.length;
        deletedCounts.forceEvents = deletedForce.length;
        deletedCounts.users = deletedUsers.length;
        deletedCounts.rooms = deletedRooms.length;
        break;
      }

      case 'user': {
        // Hapus dependent bookings & forceEvents terlebih dahulu jika ada relasi
        const deletedBookings = await db.delete(bookings).returning();
        const deletedForce = await db.delete(forceEvents).returning();
        const deletedUsers = await db.delete(users).returning();

        deletedCounts.bookings = deletedBookings.length;
        deletedCounts.forceEvents = deletedForce.length;
        deletedCounts.users = deletedUsers.length;
        break;
      }

      case 'rooms': {
        // Hapus dependent bookings & forceEvents terlebih dahulu jika ada relasi
        const deletedBookings = await db.delete(bookings).returning();
        const deletedForce = await db.delete(forceEvents).returning();
        const deletedRooms = await db.delete(rooms).returning();

        deletedCounts.bookings = deletedBookings.length;
        deletedCounts.forceEvents = deletedForce.length;
        deletedCounts.rooms = deletedRooms.length;
        break;
      }

      case 'force_events': {
        const deletedForce = await db.delete(forceEvents).returning();
        deletedCounts.forceEvents = deletedForce.length;
        break;
      }

      case 'bookings': {
        const deletedBookings = await db.delete(bookings).returning();
        deletedCounts.bookings = deletedBookings.length;
        break;
      }

      default: {
        log.warn(`Target flushdb tidak dikenali: "${target}"`);
        return err(
          new ValidationError(
            ErrorCode.INVALID_COMMAND_SYNTAX,
            `Target flushdb "${target}" tidak dikenali. Pilihan valid: all, user, rooms, force_events, bookings.`,
            { target }
          )
        );
      }
    }

    const result: FlushResult = Object.freeze({
      target,
      deletedCounts: Object.freeze(deletedCounts),
    });

    log.info(`Berhasil melakukan flush database untuk target: "${target}"`, deletedCounts);
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error(`Gagal melakukan flush database untuk target "${target}"`, error);
    return err(
      new AppError({
        code: ErrorCode.DATABASE_ERROR,
        userMessage: `Gagal melakukan flush database untuk target "${target}": ${message}`,
        metadata: { target },
        cause: error,
      })
    );
  }
}
