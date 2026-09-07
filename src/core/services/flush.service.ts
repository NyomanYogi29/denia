import { db } from '@/core/db';
import { bookings, forceEvents, rooms, users } from '@/core/db/schema.ts';
import { AppError, ErrorCode, ValidationError } from '@/core/errors';
import { err, ok, type Result } from '@/core/types';

export type FlushTarget = 'all' | 'user' | 'rooms' | 'force_events' | 'bookings';

export interface FlushCounts {
  readonly bookings?: number;
  readonly forceEvents?: number;
  readonly users?: number;
  readonly rooms?: number;
}

export interface FlushResult {
  readonly target: FlushTarget;
  readonly deletedCounts: FlushCounts;
}

/**
 * Memvalidasi apakah target flushdb valid
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
 * Menghapus data dari database sesuai dengan target spesifik
 */
export async function flushDatabase(target: FlushTarget): Promise<Result<FlushResult, AppError>> {
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
        return err(
          new ValidationError(
            ErrorCode.INVALID_COMMAND_SYNTAX,
            `Target flushdb "${target}" tidak dikenali. Pilihan valid: all, user, rooms, force_events, bookings.`,
            { target }
          )
        );
      }
    }

    return ok({
      target,
      deletedCounts: Object.freeze(deletedCounts),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
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
