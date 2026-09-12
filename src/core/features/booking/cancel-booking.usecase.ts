import {
  cancelBookingImmediate,
  findUserByJid,
} from '@/core/db/repositories/index.ts';
import { invalidateScheduleCache } from '@/core/db/redis.ts';
import {
  ErrorCode,
  UnauthorizedError,
  ValidationError,
  type AppError,
} from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import {
  parseDateString,
  parseRoomCode,
  parseSlotString,
} from '@/core/utils/index.ts';
import { cancelBookingInputSchema } from '@/core/validators/index.ts';
import type {
  CancelBookingUseCaseInput,
  CancelledBookingDetails,
} from './types.ts';

const log = logger.child({ module: 'CANCEL_BOOKING_USECASE' });

/**
 * Use case murni untuk pembatalan peminjaman ruangan perkuliahan SDP Undiksha (Fase 5.2).
 *
 * Alur bisnis:
 * 1. Validasi skema input pengguna via Zod (`cancelBookingInputSchema`).
 * 2. Auto-resolusi & verifikasi identitas pengguna dari tabel `users` via JID.
 * 3. Validasi domain terpusat (kode ruangan terdaftar, format tanggal DD/MM/YYYY, slot alfabetik A-O 1-4 SKS).
 * 4. Validasi kepemilikan slot:
 *    - Mahasiswa/Korti hanya dapat membatalkan peminjaman yang ia pesan sendiri.
 *    - Staf atau Admin berhak membatalkan peminjaman siapa pun.
 * 5. Eksekusi pembaruan status booking menjadi `cancelled` secara atomik (BEGIN IMMEDIATE).
 */
export async function cancelBookingUseCase(
  input: CancelBookingUseCaseInput
): Promise<Result<CancelledBookingDetails, AppError>> {
  // 1. Validasi skema input dari user menggunakan Zod
  const parsed = cancelBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi data pembatalan peminjaman gagal.';
    log.warn('Validasi input pembatalan peminjaman gagal (Zod schema)', {
      input,
      issues: parsed.error.issues,
    });
    return err(
      new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, errorMessage, {
        issues: parsed.error.issues,
        hint: 'Format pembatalan: [kode_ruangan] [DD/MM/YYYY] [kode_slot]. Contoh: RAK_2.1 15/10/2026 DEF',
      })
    );
  }

  const validated = parsed.data;

  // 2. Auto-resolution dan verifikasi pengguna dari whitelist database
  const userResult = await findUserByJid(validated.userJid);
  if (!userResult.success) {
    log.error('Gagal mencari identitas pengguna di basis data', userResult.error);
    return userResult;
  }

  const user = userResult.data;
  if (!user) {
    log.warn(`Pembatalan ditolak: JID "${validated.userJid}" belum terdaftar di whitelist.`);
    return err(
      new UnauthorizedError(
        'Nomor WhatsApp Anda belum terdaftar pada sistem whitelist SDP Undiksha. Harap hubungi staf/admin kampus untuk mendaftarkan nomor Anda.',
        { userJid: validated.userJid }
      )
    );
  }

  // 3. Validasi Kode Ruangan
  const roomResult = parseRoomCode(validated.roomCode);
  if (!roomResult.success) {
    log.warn('Pembatalan ditolak: Kode ruangan tidak valid', {
      roomCode: validated.roomCode,
      error: roomResult.error.userMessage,
    });
    return roomResult;
  }
  const room = roomResult.data.room;

  // 4. Validasi Format Tanggal Kalender (DD/MM/YYYY)
  const dateResult = parseDateString(validated.date);
  if (!dateResult.success) {
    log.warn('Pembatalan ditolak: Format tanggal tidak valid', {
      date: validated.date,
      error: dateResult.error.userMessage,
    });
    return dateResult;
  }
  const date = dateResult.data;

  // 5. Validasi Format Slot, Kontiguitas, dan Batas SKS (1 - 4 SKS)
  const slotResult = parseSlotString(validated.slotCode);
  if (!slotResult.success) {
    log.warn('Pembatalan ditolak: Format slot tidak valid atau tidak sekuensial', {
      slotCode: validated.slotCode,
      error: slotResult.error.userMessage,
    });
    return slotResult;
  }
  const slot = slotResult.data;

  // 6. Eksekusi pembatalan atomik SQLite dengan BEGIN IMMEDIATE
  const isStaffOrAdmin = user.role === 'staff' || user.role === 'admin';
  const cancelResult = await cancelBookingImmediate({
    roomCode: room.code,
    bookingDate: date.iso,
    slotCodes: slot.slots,
    userJid: user.jid,
    isStaffOrAdmin,
  });

  if (!cancelResult.success) {
    return cancelResult;
  }

  const isDuplicate = Boolean((cancelResult.data as any).isDuplicate);

  const cancelledDetails: CancelledBookingDetails = Object.freeze({
    room,
    date,
    slot,
    user,
    cancelledBookings: Object.freeze(cancelResult.data),
    isStaffOrAdmin,
    isDuplicate,
  });

  log.info(
    `Berhasil membatalkan peminjaman ruangan ${room.code} untuk tanggal ${date.raw} (${slot.raw}) oleh ${user.nama} (${user.kelas})`
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

  return ok(cancelledDetails);
}
