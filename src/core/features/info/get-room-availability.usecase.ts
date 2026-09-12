import { SLOT_CODES, type RoomInfo } from '@/core/constants';
import { getRoomAvailabilityRawData } from '@/core/db/repositories';
import { redisGet, redisSet } from '@/core/db/redis.ts';
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
  getCurrentWitaTime,
  getPassedSlots,
  getTodayIso,
  getTomorrowIso,
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

  // 2. Resolusi Tanggal (Mendukung tanggal spesifik, 'besok', atau default hari ini)
  let date: ParsedDate;
  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();
  let isToday = false;
  let isTomorrow = false;

  if (validated.date && validated.date.trim()) {
    const rawTrimmed = validated.date.trim().toLowerCase();
    const dateResult = parseDateString(rawTrimmed, { allowPast: true });
    if (!dateResult.success) {
      log.warn('Info ruangan ditolak: Format tanggal tidak valid', {
        date: validated.date,
        error: dateResult.error.userMessage,
      });
      return dateResult;
    }
    date = dateResult.data;
    if (date.iso === tomorrowIso) {
      isTomorrow = true;
    } else if (date.iso === todayIso) {
      isToday = true;
    }
  } else {
    // Default ke hari ini (WITA)
    const todayFormatted = isoToDateString(todayIso);
    if (!todayFormatted.success) {
      return err(todayFormatted.error);
    }
    const todayDateResult = parseDateString(todayFormatted.data, { allowPast: true });
    if (!todayDateResult.success) {
      return err(todayDateResult.error);
    }
    date = todayDateResult.data;
    isToday = true;
  }

  // Jika mengecek jadwal hari ini, hitung slot-slot yang telah mulai/terlewat berdasarkan jam WITA
  const currentWita = getCurrentWitaTime();
  const passedSlotCodes = isToday ? getPassedSlots(currentWita.timeStr) : [];

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

  // 4. Periksa cache Redis lokal dengan TTL singkat (3 detik)
  const cacheKey = filterRoomCode
    ? `room:schedule:${date.iso}:${filterRoomCode}`
    : `room:schedule:${date.iso}`;

  const cached = await redisGet(cacheKey);
  if (cached.success && cached.data) {
    try {
      const parsedCachedResult = JSON.parse(cached.data) as GetRoomAvailabilityResult;
      log.debug(`Menyajikan matriks ketersediaan ruangan dari cache Redis (${cacheKey})`);
      return ok(parsedCachedResult);
    } catch {
      // Fallback ke fresh database query jika JSON parsing gagal
    }
  }

  // 5. Query data mentah dari basis data SQLite
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

      // Periksa apakah slot ini telah terlewat hari ini (karena jam sekarang >= startTime)
      if (isToday && passedSlotCodes.includes(slotCode)) {
        const slotStatus: RoomSlotStatus = Object.freeze({
          slotCode,
          status: 'passed',
        });
        slotStatuses.push(slotStatus);
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
  const activeSlotCount = isToday ? SLOT_CODES.length - passedSlotCodes.length : SLOT_CODES.length;
  const fullyAvailableRooms = scheduleItems.filter(
    (item) => activeSlotCount > 0 && item.availableSlots.length === activeSlotCount
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
    isToday,
    isTomorrow,
    currentTimeWita: currentWita.timeStr,
    passedSlots: Object.freeze(passedSlotCodes),
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

  const result: GetRoomAvailabilityResult = Object.freeze({
    matrixData,
    formattedMessage,
  });

  // Simpan ke Redis cache lokal dengan TTL 3 detik (EX 3)
  try {
    await redisSet(cacheKey, JSON.stringify(result), 3);
  } catch (cacheErr) {
    log.debug('Gagal menyimpan cache Redis untuk info jadwal (non-fatal)', {
      error: String(cacheErr),
    });
  }

  return ok(result);
}
