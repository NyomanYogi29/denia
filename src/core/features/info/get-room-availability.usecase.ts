import { SLOT_CODES, type RoomInfo } from '@/core/constants';
import { getRoomAvailabilityRawData } from '@/core/db/repositories';
import { ErrorCode, ValidationError, type AppError } from '@/core/errors';
import { logger } from '@/core/logger';
import {
  formatAvailabilityMatrix,
  type AvailabilityMatrixData,
  type RoomScheduleItem,
  type RoomSlotStatus,
} from '@/core/templates';
import { err, ok, type Result } from '@/core/types';
import {
  formatIndonesianDate,
  getTodayIso,
  isoToDateString,
  parseDateString,
  parseRoomCode,
  type ParsedDate,
} from '@/core/utils';
import { roomInfoInputSchema } from '@/core/validators';
import type { GetRoomAvailabilityInput, GetRoomAvailabilityResult } from './types.ts';

const log = logger.child({ module: 'GET_ROOM_AVAILABILITY_USECASE' });

/**
 * Use case murni untuk memeriksa matriks ketersediaan seluruh ruangan per slot SKS pada tanggal tertentu (Fase 5.3).
 *
 * Alur bisnis:
 * 1. Validasi skema input pengguna via Zod (`roomInfoInputSchema`).
 * 2. Resolusi tanggal: jika kosong/tidak diisi, default ke tanggal hari ini (WITA).
 * 3. Jika kode ruangan diisi, validasi apakah terdaftar pada sistem SDP Undiksha.
 * 4. Query data mentah ruangan, peminjaman aktif, dan pemblokiran force events dari database.
 * 5. Konstruksi matriks ketersediaan per slot SKS (A sampai O) untuk setiap ruangan.
 * 6. Format matriks menjadi pesan terstruktur yang siap dikonsumsi oleh bot WhatsApp maupun CLI.
 */
export async function getRoomAvailabilityUseCase(
  input: GetRoomAvailabilityInput
): Promise<Result<GetRoomAvailabilityResult, AppError>> {
  // 1. Validasi skema input
  const parsed = roomInfoInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi input info ketersediaan ruangan gagal.';
    log.warn('Validasi input info ketersediaan gagal (Zod schema)', {
      input,
      issues: parsed.error.issues,
    });
    return err(
      new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, errorMessage, {
        issues: parsed.error.issues,
        hint: 'Format info: !info [DD/MM/YYYY] atau !info. Contoh: !info 15/10/2026',
      })
    );
  }

  const validated = parsed.data;

  // 2. Resolusi Tanggal
  let date: ParsedDate;
  if (validated.date && validated.date.trim()) {
    const dateResult = parseDateString(validated.date.trim(), { allowPast: true });
    if (!dateResult.success) {
      log.warn('Info ruangan ditolak: Format tanggal tidak valid', {
        date: validated.date,
        error: dateResult.error.userMessage,
      });
      return dateResult;
    }
    date = dateResult.data;
  } else {
    // Default ke hari ini (WITA)
    const todayIso = getTodayIso();
    const todayFormatted = isoToDateString(todayIso);
    if (!todayFormatted.success) {
      return err(todayFormatted.error);
    }
    const todayDateResult = parseDateString(todayFormatted.data, { allowPast: true });
    if (!todayDateResult.success) {
      return err(todayDateResult.error);
    }
    date = todayDateResult.data;
  }

  // 3. Validasi Filter Kode Ruangan (Opsional)
  let filterRoomCode: string | undefined;
  if (validated.roomCode && validated.roomCode.trim()) {
    const roomResult = parseRoomCode(validated.roomCode.trim());
    if (!roomResult.success) {
      log.warn('Info ruangan ditolak: Kode ruangan tidak dikenal', {
        roomCode: validated.roomCode,
        error: roomResult.error.userMessage,
      });
      return roomResult;
    }
    filterRoomCode = roomResult.data.room.code;
  }

  // 4. Query data mentah dari basis data
  const rawDataResult = await getRoomAvailabilityRawData({
    bookingDate: date.iso,
    roomCode: filterRoomCode,
  });

  if (!rawDataResult.success) {
    return rawDataResult;
  }

  const rawData = rawDataResult.data;

  // 5. Susun matriks jadwal per ruangan
  const scheduleItems: RoomScheduleItem[] = [];

  for (const r of rawData.rooms) {
    const roomInfo: RoomInfo = Object.freeze({
      code: r.code,
      name: (r as any).roomName ?? (r as any).name ?? r.code,
      building: r.building,
      floor: r.floor ?? 1,
      capacity: r.capacity ?? 40,
      isActive: Boolean(r.isActive),
      description: (r as any).description ?? undefined,
    });

    const roomBookings = rawData.activeBookings.filter((b) => b.roomCode === r.code);
    const roomEvents = rawData.activeEvents.filter((e) => e.roomCode === r.code);

    const slotStatuses: RoomSlotStatus[] = [];
    const availableSlots: string[] = [];
    const bookedSlots: RoomSlotStatus[] = [];
    const blockedSlots: RoomSlotStatus[] = [];

    for (const slotCode of SLOT_CODES) {
      // Periksa apakah slot ini diblokir force event
      const blockingEvent = roomEvents.find((e) => {
        if (!e.slotCode || e.slotCode.trim() === '') return true; // Blokir seharian
        return e.slotCode.toUpperCase().includes(slotCode);
      });

      if (blockingEvent) {
        const slotStatus: RoomSlotStatus = Object.freeze({
          slotCode,
          status: 'blocked',
          eventName: blockingEvent.eventName,
        });
        slotStatuses.push(slotStatus);
        blockedSlots.push(slotStatus);
        continue;
      }

      // Periksa apakah slot ini dipesan
      const booking = roomBookings.find((b) => b.slotCode.toUpperCase() === slotCode);
      if (booking) {
        const slotStatus: RoomSlotStatus = Object.freeze({
          slotCode,
          status: 'booked',
          borrowerClass: booking.userKelas ?? undefined,
          borrowerName: booking.userNama ?? undefined,
        });
        slotStatuses.push(slotStatus);
        bookedSlots.push(slotStatus);
        continue;
      }

      // Slot kosong / tersedia
      const slotStatus: RoomSlotStatus = Object.freeze({
        slotCode,
        status: 'available',
      });
      slotStatuses.push(slotStatus);
      availableSlots.push(slotCode);
    }

    scheduleItems.push(
      Object.freeze({
        room: roomInfo,
        slots: Object.freeze(slotStatuses),
        availableSlots: Object.freeze(availableSlots),
        bookedSlots: Object.freeze(bookedSlots),
        blockedSlots: Object.freeze(blockedSlots),
      })
    );
  }

  // 6. Susun ringkasan statistik
  const totalRooms = scheduleItems.length;
  const fullyAvailableRooms = scheduleItems.filter(
    (item) => item.availableSlots.length === SLOT_CODES.length
  ).length;
  const fullyBlockedRooms = scheduleItems.filter(
    (item) => item.availableSlots.length === 0 && item.bookedSlots.length === 0
  ).length;
  const partiallyBookedRooms = totalRooms - fullyAvailableRooms - fullyBlockedRooms;

  const formattedIndonesianDate = formatIndonesianDate(date.iso);

  const matrixData: AvailabilityMatrixData = Object.freeze({
    date,
    formattedIndonesianDate,
    rooms: Object.freeze(scheduleItems),
    summary: Object.freeze({
      totalRooms,
      fullyAvailableRooms,
      partiallyBookedRooms,
      fullyBlockedRooms,
    }),
  });

  const formattedMessage = formatAvailabilityMatrix(matrixData);

  log.info('Berhasil menyusun matriks ketersediaan ruangan', {
    bookingDate: date.iso,
    totalRooms,
    fullyAvailableRooms,
    partiallyBookedRooms,
  });

  return ok(
    Object.freeze({
      matrixData,
      formattedMessage,
    })
  );
}
