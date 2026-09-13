import {
  abortForceBookingImmediate,
  findUserByJid,
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
  isoToDateString,
  parseDateString,
  parseRoomCode,
  parseSlotString,
} from '@/core/utils/index.ts';
import { abortForceInputSchema } from '@/core/validators/index.ts';
import type {
  AbortForceBookingDetails,
  AbortForceUseCaseInput,
} from './types.ts';

const log = logger.child({ module: 'ABORT_FORCE_USECASE' });

/**
 * Use case murni untuk membatalkan pengambilalihan paksa (abort force) ruangan perkuliahan (Fase 5.6).
 *
 * Alur bisnis:
 * 1. Validasi skema input via Zod (`abortForceInputSchema`).
 * 2. Auto-resolusi & verifikasi pengguna dari tabel `users` via JID.
 * 3. Otorisasi peran: hanya Staf atau Admin yang berhak mengeksekusi abort force.
 * 4. Eksekusi pembatalan force booking secara atomik (SQLite BEGIN IMMEDIATE) via `abortForceBookingImmediate`.
 * 5. Invalidasi cache jadwal Redis untuk ruangan dan tanggal terkait.
 * 6. Mengembalikan rincian data pembatalan beserta daftar korti terdampak yang slotnya dipulihkan.
 */
export async function abortForceBookingUseCase(
  input: AbortForceUseCaseInput
): Promise<Result<AbortForceBookingDetails, AppError>> {
  // 1. Validasi skema input dari user menggunakan Zod
  const parsed = abortForceInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi input abort force gagal.';
    log.warn('Validasi input abort force gagal (Zod schema)', {
      input,
      issues: parsed.error.issues,
    });
    return err(
      new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, errorMessage, {
        issues: parsed.error.issues,
        hint: 'Gunakan format: !abort force [id_booking]\nContoh: !abort force 15',
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
    log.warn(`Abort force ditolak: JID "${validated.userJid}" belum terdaftar di whitelist.`);
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
      `Abort force ditolak: Pengguna ${user.nama} (${user.jid}) bukan staf/admin [role: ${user.role}]`
    );
    return err(
      new AppError({
        code: ErrorCode.FORBIDDEN_ROLE,
        userMessage:
          'Perintah pembatalan pengambilalihan paksa (!abort force) hanya dapat dieksekusi oleh Staf atau Admin kampus.',
        metadata: { userJid: user.jid, role: user.role },
      })
    );
  }

  // 4. Eksekusi pembatalan secara atomik di database
  const abortResult = await abortForceBookingImmediate({
    bookingIds: validated.id,
    userJid: user.jid,
    userName: user.nama,
    isStaffOrAdmin,
    autoDetectSession: validated.autoDetectSession,
  });

  if (!abortResult.success) {
    return abortResult;
  }

  const aborted = abortResult.data;

  // 5. Resolusi data ruangan
  const roomResult = parseRoomCode(aborted.roomCode);
  if (!roomResult.success) {
    return roomResult;
  }
  const room = roomResult.data.room;

  // 6. Resolusi format tanggal
  const dateFormattedResult = isoToDateString(aborted.bookingDate);
  const dateRaw = dateFormattedResult.success ? dateFormattedResult.data : aborted.bookingDate;
  const dateResult = parseDateString(dateRaw);
  if (!dateResult.success) {
    return dateResult;
  }
  const date = dateResult.data;

  // 7. Resolusi format slot
  const combinedSlots = aborted.slotCodes.join('');
  const slotResult = parseSlotString(combinedSlots);
  if (!slotResult.success) {
    return slotResult;
  }
  const slot = slotResult.data;

  // 8. Invalidasi Redis cache
  if (!aborted.isDuplicate) {
    try {
      await invalidateScheduleCache(aborted.bookingDate, aborted.roomCode);
    } catch (cacheErr) {
      log.debug('Gagal melakukan invalidasi cache jadwal (non-fatal)', {
        error: String(cacheErr),
      });
    }
  }

  const details: AbortForceBookingDetails = Object.freeze({
    bookings: aborted.bookings,
    room,
    date,
    slot,
    user,
    reason: aborted.reason,
    forcedByJid: aborted.forcedByJid,
    displacedKorti: aborted.displacedKorti,
    isDuplicate: aborted.isDuplicate,
  });

  log.info(
    `Berhasil mengeksekusi abort force booking untuk ruangan ${room.code} pada ${date.raw} (${slot.raw}) oleh ${user.nama}`
  );

  return ok(details);
}
