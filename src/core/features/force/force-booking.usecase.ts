import {
  findUserByJid,
  forceBookingImmediate,
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
  parseDateString,
  parseRoomCode,
  parseSlotString,
  validateBookingLeadTime,
} from '@/core/utils/index.ts';
import { forceBookingInputSchema } from '@/core/validators/index.ts';
import type {
  ForceBookingDetails,
  ForceBookingUseCaseInput,
} from './types.ts';

const log = logger.child({ module: 'FORCE_BOOKING_USECASE' });

/**
 * Use case murni untuk pengambilalihan paksa (force booking) ruangan perkuliahan (Fase 5.4).
 *
 * Alur bisnis:
 * 1. Validasi skema input via Zod (`forceBookingInputSchema`).
 * 2. Auto-resolusi & verifikasi pengguna dari tabel `users` via JID.
 * 3. Otorisasi peran: hanya Staf atau Admin yang berhak mengeksekusi force booking.
 * 4. Validasi domain (kode ruangan terdaftar, format tanggal DD/MM/YYYY, slot alfabetik A-O kontigu 1-4 SKS).
 * 5. Eksekusi pengambilalihan slot secara atomik (SQLite BEGIN IMMEDIATE) via `forceBookingImmediate`.
 * 6. Mengembalikan data rincian pemesanan institusi beserta daftar booking lama yang tergeser (displaced).
 */
export async function forceBookingUseCase(
  input: ForceBookingUseCaseInput
): Promise<Result<ForceBookingDetails, AppError>> {
  // 1. Validasi skema input dari user menggunakan Zod
  const parsed = forceBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi data force booking gagal.';
    log.warn('Validasi input force booking gagal (Zod schema)', {
      input,
      issues: parsed.error.issues,
    });
    return err(
      new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, errorMessage, {
        issues: parsed.error.issues,
        hint: 'Format pengambilalihan ruangan: !force [kode_ruangan] [DD/MM/YYYY] [kode_slot] [alasan]\nContoh: !force RAK_2.1 15/10/2026 DEF Ujian Sidang Skripsi Mendadak',
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
    log.warn(`Force booking ditolak: JID "${validated.userJid}" belum terdaftar di whitelist.`);
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
      `Force booking ditolak: Pengguna ${user.nama} (${user.jid}) bukan staf/admin [role: ${user.role}]`
    );
    return err(
      new AppError({
        code: ErrorCode.FORBIDDEN_ROLE,
        userMessage:
          'Perintah pengambilalihan paksa (!force) hanya dapat dieksekusi oleh Staf atau Admin kampus.',
        metadata: { userJid: user.jid, role: user.role },
      })
    );
  }

  // 4. Validasi Kode Ruangan
  const roomResult = parseRoomCode(validated.roomCode);
  if (!roomResult.success) {
    log.warn('Force booking ditolak: Kode ruangan tidak valid', {
      roomCode: validated.roomCode,
      error: roomResult.error.userMessage,
    });
    return roomResult;
  }
  const room = roomResult.data.room;

  // 5. Validasi Format Tanggal Kalender (DD/MM/YYYY)
  const dateResult = parseDateString(validated.date);
  if (!dateResult.success) {
    log.warn('Force booking ditolak: Format tanggal tidak valid', {
      date: validated.date,
      error: dateResult.error.userMessage,
    });
    return dateResult;
  }
  const date = dateResult.data;

  // 6. Validasi Lead Time (Staf/Admin diizinkan memesan hari H, namun tanggal lampau dilarang)
  const leadTimeResult = validateBookingLeadTime(date.iso, user.role);
  if (!leadTimeResult.success) {
    log.warn('Force booking ditolak: Pelanggaran tanggal booking', {
      date: date.iso,
      userRole: user.role,
      error: leadTimeResult.error.userMessage,
    });
    return leadTimeResult;
  }

  // 7. Validasi Format Slot, Kontiguitas, dan Batas SKS (1 - 4 SKS)
  const slotResult = parseSlotString(validated.slotCode);
  if (!slotResult.success) {
    log.warn('Force booking ditolak: Format slot tidak valid atau tidak sekuensial', {
      slotCode: validated.slotCode,
      error: slotResult.error.userMessage,
    });
    return slotResult;
  }
  const slot = slotResult.data;

  // 8. Eksekusi pengambilalihan paksa secara atomik di basis data
  const forceResult = await forceBookingImmediate({
    roomCode: room.code,
    bookingDate: date.iso,
    slotCodes: slot.slots,
    userJid: user.jid,
    reason: validated.reason,
  });

  if (!forceResult.success) {
    return forceResult;
  }

  const { bookings: createdBookings, displacedBookings, isDuplicate } = forceResult.data;

  const forceDetails: ForceBookingDetails = Object.freeze({
    room,
    date,
    slot,
    user,
    reason: validated.reason,
    bookings: createdBookings,
    displacedBookings,
    isDuplicate,
  });

  log.info(
    `Berhasil mengeksekusi force booking untuk ${room.code} pada ${date.raw} (${slot.raw}) oleh ${user.nama} (${user.role}), menggeser ${displacedBookings.length} pemesanan`
  );

  if (!isDuplicate) {
    try {
      await invalidateScheduleCache(date.iso, room.code);
    } catch (cacheErr) {
      log.debug('Gagal melakukan invalidasi cache jadwal (non-fatal)', {
        error: String(cacheErr),
      });
    }
  }

  return ok(forceDetails);
}
