import {
  findUserByJid,
  createForceEventImmediate,
} from '@/core/db/repositories/index.ts';
import { invalidateScheduleCache } from '@/core/db/redis.ts';
import {
  AppError,
  ErrorCode,
  UnauthorizedError,
  ValidationError,
} from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import {
  parseDateRangeString,
  parseRoomCodes,
  validateBookingLeadTime,
} from '@/core/utils/index.ts';
import { forceEventInputSchema } from '@/core/validators/index.ts';
import type {
  ForceEventDetails,
  ForceEventUseCaseInput,
} from './types.ts';

const log = logger.child({ module: 'FORCE_EVENT_USECASE' });

/**
 * Use case murni untuk pemblokiran sekumpulan ruangan sekaligus untuk rentang tanggal tertentu (Fase 5.5).
 *
 * Alur bisnis:
 * 1. Validasi skema input via Zod (`forceEventInputSchema`).
 * 2. Auto-resolusi & verifikasi pengguna dari tabel `users` via JID.
 * 3. Otorisasi peran: hanya Staf atau Admin yang berhak mengeksekusi force event agenda kampus.
 * 4. Validasi domain (seluruh kode ruangan terdaftar, format rentang tanggal DD/MM/YYYY-DD/MM/YYYY atau DD/MM/YYYY).
 * 5. Validasi tanggal tidak lampau.
 * 6. Eksekusi pemblokiran dan pembatalan paksa booking terdampak secara atomik (SQLite BEGIN IMMEDIATE).
 * 7. Invalidasi cache jadwal Redis untuk seluruh tanggal dan ruangan terdampak.
 * 8. Mengembalikan rincian data agenda kampus beserta daftar booking korti yang tergeser (displaced).
 */
export async function forceEventUseCase(
  input: ForceEventUseCaseInput
): Promise<Result<ForceEventDetails, AppError>> {
  // 1. Validasi skema input dari user menggunakan Zod
  const parsed = forceEventInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi data force event gagal.';
    log.warn('Validasi input force event gagal (Zod schema)', {
      input,
      issues: parsed.error.issues,
    });
    return err(
      new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, errorMessage, {
        issues: parsed.error.issues,
        hint: 'Format pemblokiran agenda kampus: !forceevent [list_ruangan] [DD/MM/YYYY-DD/MM/YYYY] [nama_acara]\nContoh: !forceevent RAK_1.1,RAK_2.1 15/10/2026-17/10/2026 Seminar Nasional TI',
      })
    );
  }

  const validated = parsed.data;

  // 2. Auto-resolution dan verifikasi pengguna dari basis data
  const userResult = await findUserByJid(validated.userJid);
  if (!userResult.success) {
    log.error('Gagal mencari identitas pengguna di basis data', userResult.error);
    return userResult;
  }

  const user = userResult.data;
  if (!user) {
    log.warn(`Force event ditolak: JID "${validated.userJid}" belum terdaftar di whitelist.`);
    return err(
      new UnauthorizedError(
        'Nomor WhatsApp Anda belum terdaftar pada sistem whitelist SDP Undiksha. Harap hubungi staf/admin kampus.',
        { userJid: validated.userJid }
      )
    );
  }

  // 3. Otorisasi Peran: Hanya Staf atau Admin yang diizinkan
  const isStaffOrAdmin = user.role === 'staff' || user.role === 'admin';
  if (!isStaffOrAdmin) {
    log.warn(
      `Force event ditolak: Pengguna ${user.nama} (${user.jid}) bukan staf/admin [role: ${user.role}]`
    );
    return err(
      new AppError({
        code: ErrorCode.FORBIDDEN_ROLE,
        userMessage:
          'Perintah pembuatan agenda institusi (!forceevent) hanya dapat dieksekusi oleh Staf atau Admin kampus.',
        metadata: { userJid: user.jid, role: user.role },
      })
    );
  }

  // 4. Validasi Daftar Kode Ruangan
  const roomsResult = parseRoomCodes(validated.roomCodes);
  if (!roomsResult.success) {
    log.warn('Force event ditolak: Kode ruangan tidak valid', {
      roomCodes: validated.roomCodes,
      error: roomsResult.error.userMessage,
    });
    return roomsResult;
  }
  const rooms = roomsResult.data;

  // 5. Validasi Rentang Tanggal Kalender
  const dateRangeResult = parseDateRangeString(validated.dateRange);
  if (!dateRangeResult.success) {
    log.warn('Force event ditolak: Format rentang tanggal tidak valid', {
      dateRange: validated.dateRange,
      error: dateRangeResult.error.userMessage,
    });
    return dateRangeResult;
  }
  const dateRange = dateRangeResult.data;

  // 6. Validasi Tanggal Tidak Lampau (Staf/Admin diizinkan menjadwalkan mulai hari H)
  const leadTimeResult = validateBookingLeadTime(dateRange.startDate.iso, user.role);
  if (!leadTimeResult.success) {
    log.warn('Force event ditolak: Pelanggaran tanggal acara', {
      startDate: dateRange.startDate.iso,
      userRole: user.role,
      error: leadTimeResult.error.userMessage,
    });
    return leadTimeResult;
  }

  // 7. Eksekusi pembuatan force_event dan pembatalan booking terdampak secara atomik
  const roomCodes = rooms.map((r) => r.code);
  const eventResult = await createForceEventImmediate({
    roomCodes,
    startDate: dateRange.startDate.iso,
    endDate: dateRange.endDate.iso,
    dateIsos: dateRange.dateIsos,
    eventName: validated.eventName,
    userJid: user.jid,
  });

  if (!eventResult.success) {
    return eventResult;
  }

  const { events: createdEvents, displacedBookings, isDuplicate } = eventResult.data;

  const eventDetails: ForceEventDetails = Object.freeze({
    rooms,
    dateRange,
    user,
    eventName: validated.eventName,
    events: createdEvents,
    displacedBookings,
    isDuplicate,
  });

  log.info(
    `Berhasil mengeksekusi force event "${validated.eventName}" untuk ruangan ${roomCodes.join(', ')} (${dateRange.formattedRange}) oleh ${user.nama} (${user.role}), menggeser ${displacedBookings.length} pemesanan`
  );

  // 8. Invalidasi cache jadwal Redis untuk seluruh tanggal dan ruangan terkait
  if (!isDuplicate) {
    for (const dateIso of dateRange.dateIsos) {
      for (const room of rooms) {
        try {
          await invalidateScheduleCache(dateIso, room.code);
        } catch (cacheErr) {
          log.debug('Gagal melakukan invalidasi cache jadwal (non-fatal)', {
            error: String(cacheErr),
          });
        }
      }
    }
  }

  return ok(eventDetails);
}
