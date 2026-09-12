import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from '@/core/db/index.ts';
import {
  bookings,
  forceEvents,
  rooms,
  users,
  type Booking,
  type ForceEvent,
  type Room,
} from '@/core/db/schema.ts';
import { DatabaseError, type AppError } from '@/core/errors';
import { logger } from '@/core/logger';
import { err, ok, type Result } from '@/core/types';

const log = logger.child({ module: 'AVAILABILITY_REPOSITORY' });

export interface ActiveBookingWithUser extends Booking {
  readonly userNama?: string | null;
  readonly userKelas?: string | null;
  readonly userRole?: string | null;
}

export interface RoomAvailabilityRawData {
  readonly bookingDate: string; // ISO: 'YYYY-MM-DD'
  readonly rooms: readonly Room[];
  readonly activeBookings: readonly ActiveBookingWithUser[];
  readonly activeEvents: readonly ForceEvent[];
}

export interface AvailabilityQueryParams {
  readonly bookingDate: string; // ISO: 'YYYY-MM-DD'
  readonly roomCode?: string;
}

/**
 * Mengambil data mentah ketersediaan ruangan (master rooms, booking aktif, dan agenda force events)
 * pada tanggal tertentu untuk penyusunan matriks ketersediaan jadwal (Fase 5.3).
 */
export async function getRoomAvailabilityRawData(
  params: AvailabilityQueryParams
): Promise<Result<RoomAvailabilityRawData, AppError>> {
  const { bookingDate, roomCode } = params;

  try {
    // 1. Ambil daftar ruangan aktif
    let roomsQuery = db.select().from(rooms).where(eq(rooms.isActive, true));
    if (roomCode) {
      roomsQuery = db
        .select()
        .from(rooms)
        .where(and(eq(rooms.isActive, true), eq(rooms.code, roomCode.toUpperCase()))) as any;
    }
    const activeRooms = await roomsQuery.all();

    // 2. Ambil booking aktif pada tanggal terkait beserta informasi penggunanya
    const bookingConditions = [
      eq(bookings.bookingDate, bookingDate),
      eq(bookings.status, 'active'),
    ];
    if (roomCode) {
      bookingConditions.push(eq(bookings.roomCode, roomCode.toUpperCase()));
    }

    const activeBookingsRows = await db
      .select({
        id: bookings.id,
        roomCode: bookings.roomCode,
        bookingDate: bookings.bookingDate,
        slotCode: bookings.slotCode,
        userJid: bookings.userJid,
        status: bookings.status,
        bookingType: bookings.bookingType,
        notes: bookings.notes,
        createdAt: bookings.createdAt,
        userNama: users.nama,
        userKelas: users.kelas,
        userRole: users.role,
      })
      .from(bookings)
      .leftJoin(users, eq(bookings.userJid, users.jid))
      .where(and(...bookingConditions))
      .all();

    // 3. Ambil agenda force events aktif yang memblokir pada tanggal ini
    const eventConditions = [
      eq(forceEvents.status, 'active'),
      lte(forceEvents.startDate, bookingDate),
      gte(forceEvents.endDate, bookingDate),
    ];
    if (roomCode) {
      eventConditions.push(eq(forceEvents.roomCode, roomCode.toUpperCase()));
    }

    const activeEvents = await db
      .select()
      .from(forceEvents)
      .where(and(...eventConditions))
      .all();

    const data: RoomAvailabilityRawData = Object.freeze({
      bookingDate,
      rooms: Object.freeze(activeRooms),
      activeBookings: Object.freeze(activeBookingsRows),
      activeEvents: Object.freeze(activeEvents),
    });

    log.debug('Berhasil mengambil data ketersediaan ruangan dari basis data', {
      bookingDate,
      roomCount: activeRooms.length,
      bookingsCount: activeBookingsRows.length,
      eventsCount: activeEvents.length,
    });

    return ok(data);
  } catch (error) {
    log.error('Gagal mengambil data ketersediaan ruangan dari basis data', error);
    return err(
      new DatabaseError(
        'Gagal mengambil data ketersediaan ruangan dari basis data.',
        { params },
        error
      )
    );
  }
}
