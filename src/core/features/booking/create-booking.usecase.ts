import {
  createBookingImmediate,
  findUserByJid,
} from '@/core/db/repositories/index.ts';
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
  validateBookingLeadTime,
} from '@/core/utils/index.ts';
import { createBookingInputSchema } from '@/core/validators/index.ts';
import type {
  BookedRoomDetails,
  CreateBookingUseCaseInput,
} from './types.ts';

const log = logger.child({ module: 'CREATE_BOOKING_USECASE' });

/**
 * Use case murni untuk peminjaman ruangan perkuliahan SDP Undiksha (Fase 5.1).
 *
 * Alur bisnis:
 * 1. Validasi skema input pengguna via Zod (`createBookingInputSchema`).
 * 2. Auto-resolusi & verifikasi identitas pengguna dari tabel `users` via JID.
 * 3. Validasi domain terpusat (kode ruangan terdaftar, format tanggal DD/MM/YYYY, aturan H-1, slot A-O kontigu 1-4 SKS).
 * 4. Eksekusi pencatatan pemesanan multi-slot secara atomik menggunakan SQLite BEGIN IMMEDIATE untuk mencegah race condition.
 * 5. Mengembalikan rincian data pemesanan yang sukses untuk didistribusikan ke buffer WhatsApp atau antarmuka CLI.
 */
export async function createBookingUseCase(
  input: CreateBookingUseCaseInput
): Promise<Result<BookedRoomDetails, AppError>> {
  // 1. Validasi skema input dari user menggunakan Zod
  const parsed = createBookingInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi data peminjaman ruangan gagal.';
    log.warn('Validasi input peminjaman ruangan gagal (Zod schema)', {
      input,
      issues: parsed.error.issues,
    });
    return err(
      new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, errorMessage, {
        issues: parsed.error.issues,
        hint: 'Format peminjaman: [kode_ruangan] [DD/MM/YYYY] [kode_slot]. Contoh: RAK_2.1 15/10/2026 DEF',
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
    log.warn(`Peminjaman ditolak: JID "${validated.userJid}" belum terdaftar di whitelist.`);
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
    log.warn('Peminjaman ditolak: Kode ruangan tidak valid', {
      roomCode: validated.roomCode,
      error: roomResult.error.userMessage,
    });
    return roomResult;
  }
  const room = roomResult.data.room;

  // 4. Validasi Format Tanggal Kalender (DD/MM/YYYY)
  const dateResult = parseDateString(validated.date);
  if (!dateResult.success) {
    log.warn('Peminjaman ditolak: Format tanggal tidak valid', {
      date: validated.date,
      error: dateResult.error.userMessage,
    });
    return dateResult;
  }
  const date = dateResult.data;

  // 5. Validasi Aturan H-1 Peminjaman (Lead Time Rule) berdasarkan role pengguna aktual
  const leadTimeResult = validateBookingLeadTime(date.iso, user.role);
  if (!leadTimeResult.success) {
    log.warn('Peminjaman ditolak: Pelanggaran aturan lead time H-1', {
      date: date.iso,
      userRole: user.role,
      error: leadTimeResult.error.userMessage,
    });
    return leadTimeResult;
  }

  // 6. Validasi Format Slot, Kontiguitas, dan Batas SKS (1 - 4 SKS)
  const slotResult = parseSlotString(validated.slotCode);
  if (!slotResult.success) {
    log.warn('Peminjaman ditolak: Format slot tidak valid atau tidak sekuensial', {
      slotCode: validated.slotCode,
      error: slotResult.error.userMessage,
    });
    return slotResult;
  }
  const slot = slotResult.data;

  // 7. Eksekusi transaksi atomik SQLite dengan BEGIN IMMEDIATE
  const dbBookingResult = await createBookingImmediate({
    roomCode: room.code,
    bookingDate: date.iso,
    slotCodes: slot.slots,
    userJid: user.jid,
    bookingType: validated.bookingType,
    notes: validated.notes ?? undefined,
  });

  if (!dbBookingResult.success) {
    return dbBookingResult;
  }

  const bookedDetails: BookedRoomDetails = Object.freeze({
    room,
    date,
    slot,
    user,
    bookings: Object.freeze(dbBookingResult.data),
  });

  log.info(
    `Berhasil mencatat peminjaman ruangan ${room.code} untuk tanggal ${date.raw} (${slot.raw}) oleh ${user.nama} (${user.kelas})`
  );

  return ok(bookedDetails);
}
