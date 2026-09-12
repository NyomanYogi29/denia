import { z } from 'zod';
import type { RoomInfo } from '@/core/constants';
import { checkSlotAvailability } from '@/core/db/repositories/booking';
import {
  SlotConflictError,
  type AppError,
  ErrorCode,
  ValidationError,
} from '@/core/errors';
import { logger } from '@/core/logger';
import { err, ok, type Result } from '@/core/types';
import {
  parseDateString,
  validateBookingLeadTime,
  parseRoomCode,
  parseSlotString,
  type ParsedDate,
  type ParsedSlot,
} from '@/core/utils';
import { isValidWhatsAppJid, normalizeToWhatsAppJid } from '@/core/utils/jid.ts';

const log = logger.child({ module: 'BOOKING_VALIDATOR' });

/**
 * Zod schema untuk validasi input peminjaman ruangan dari pengguna (WhatsApp Bot atau CLI).
 */
export const createBookingInputSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .min(1, 'Kode ruangan wajib diisi')
    .transform((val) => val.toUpperCase()),
  date: z
    .string()
    .trim()
    .min(1, 'Tanggal peminjaman wajib diisi'),
  slotCode: z
    .string()
    .trim()
    .min(1, 'Kode slot wajib diisi')
    .transform((val) => val.toUpperCase()),
  userJid: z
    .string()
    .trim()
    .min(1, 'Nomor WhatsApp atau JID peminjam wajib diisi')
    .refine((val) => isValidWhatsAppJid(val), {
      message:
        'Format nomor WhatsApp tidak valid. Masukkan nomor telepon (contoh: 08123456789 atau 628123456789) atau JID (628xxx@s.whatsapp.net).',
    })
    .transform((val) => normalizeToWhatsAppJid(val)),
  userRole: z
    .enum(['korti', 'staff', 'admin'] as const)
    .default('korti'),
  bookingType: z
    .enum(['regular', 'adhoc', 'institutional'] as const)
    .default('adhoc'),
  notes: z
    .string()
    .trim()
    .max(255, 'Catatan maksimal 255 karakter')
    .optional()
    .nullable(),
});

export type CreateBookingInput = z.infer<typeof createBookingInputSchema>;
export type CreateBookingRawInput = z.input<typeof createBookingInputSchema>;

/**
 * Zod schema untuk validasi input pembatalan peminjaman ruangan dari pengguna.
 */
export const cancelBookingInputSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .min(1, 'Kode ruangan wajib diisi')
    .transform((val) => val.toUpperCase()),
  date: z
    .string()
    .trim()
    .min(1, 'Tanggal peminjaman wajib diisi'),
  slotCode: z
    .string()
    .trim()
    .min(1, 'Kode slot wajib diisi')
    .transform((val) => val.toUpperCase()),
  userJid: z
    .string()
    .trim()
    .min(1, 'Nomor WhatsApp atau JID pemohon pembatalan wajib diisi')
    .refine((val) => isValidWhatsAppJid(val), {
      message:
        'Format nomor WhatsApp tidak valid. Masukkan nomor telepon (contoh: 08123456789 atau 628123456789) atau JID (628xxx@s.whatsapp.net).',
    })
    .transform((val) => normalizeToWhatsAppJid(val)),
});

export type CancelBookingInput = z.infer<typeof cancelBookingInputSchema>;
export type CancelBookingRawInput = z.input<typeof cancelBookingInputSchema>;

export interface BookingValidationInput {
  readonly roomCodeRaw: string;
  readonly dateRaw: string; // DD/MM/YYYY
  readonly slotCodeRaw: string; // e.g. 'DEF'
  readonly userRole?: string; // 'korti' | 'staff' | 'admin'
  readonly userJid?: string;
}

export interface ValidatedBookingData {
  readonly room: RoomInfo;
  readonly date: ParsedDate;
  readonly slot: ParsedSlot;
  readonly userRole: string;
}

/**
 * Memvalidasi permintaan peminjaman ruangan secara komprehensif:
 * 1. Validasi keberadaan kode ruangan (parseRoomCode)
 * 2. Validasi format tanggal & kalender (parseDateString)
 * 3. Validasi aturan lead time H-1 untuk Korti (validateBookingLeadTime)
 * 4. Validasi format karakter slot A-O, kontinuitas urutan, dan batas kuota SKS (parseSlotString)
 * 5. Validasi ketersediaan slot di database (tidak bentrok dengan booking aktif atau force event)
 */
export async function validateBookingRequest(
  input: BookingValidationInput
): Promise<Result<ValidatedBookingData, AppError>> {
  const { roomCodeRaw, dateRaw, slotCodeRaw, userRole = 'korti' } = input;

  // 1. Validasi Kode Ruangan
  const roomResult = parseRoomCode(roomCodeRaw);
  if (!roomResult.success) {
    log.warn('Validasi booking gagal: Kode ruangan tidak valid', { roomCodeRaw, error: roomResult.error.message });
    return roomResult;
  }
  const roomParsed = roomResult.data;
  const room = roomParsed.room;

  // 2. Validasi Format & Batas Tanggal (DD/MM/YYYY)
  const dateResult = parseDateString(dateRaw);
  if (!dateResult.success) {
    log.warn('Validasi booking gagal: Format tanggal tidak valid', { dateRaw, error: dateResult.error.message });
    return dateResult;
  }
  const date = dateResult.data;

  // 3. Validasi Aturan H-1 Peminjaman (Lead Time Rule)
  const leadTimeResult = validateBookingLeadTime(date.iso, userRole);
  if (!leadTimeResult.success) {
    log.warn('Validasi booking gagal: Aturan lead time H-1 dilanggar', {
      date: date.iso,
      userRole,
      error: leadTimeResult.error.message,
    });
    return leadTimeResult;
  }

  // 4. Validasi Slot Alfabetik, Kontiguitas, dan Batas SKS (1-4 SKS)
  const slotResult = parseSlotString(slotCodeRaw);
  if (!slotResult.success) {
    log.warn('Validasi booking gagal: Slot tidak valid atau tidak kontigu', {
      slotCodeRaw,
      error: slotResult.error.message,
    });
    return slotResult;
  }
  const slot = slotResult.data;

  // 5. Validasi Ketersediaan Slot di Basis Data (Pengecekan Konflik)
  const availabilityResult = await checkSlotAvailability({
    roomCode: room.code,
    bookingDate: date.iso,
    slotCodes: slot.slots,
  });

  if (!availabilityResult.success) {
    return availabilityResult;
  }

  const availability = availabilityResult.data;
  if (!availability.isAvailable) {
    // Jika terbentur agenda force event
    if (availability.conflictingEvents.length > 0) {
      const event = availability.conflictingEvents[0]!;
      log.warn('Pemesanan ditolak: Ruangan diblokir untuk force event institusi', {
        room: room.code,
        date: date.iso,
        eventName: event.eventName,
      });
      return err(
        new SlotConflictError(
          `Ruangan ${room.code} pada tanggal ${date.raw} sedang diblokir untuk agenda kampus: "${event.eventName}".`,
          { event }
        )
      );
    }

    // Jika terbentur booking aktif lain
    log.warn('Pemesanan ditolak: Slot sudah terisi booking aktif lain', {
      room: room.code,
      date: date.iso,
      slots: slot.slots,
      conflicts: availability.conflictingBookings,
    });
    return err(
      new SlotConflictError(
        `Ruangan ${room.code} untuk slot ${slot.raw} pada tanggal ${date.raw} sudah dipesan oleh kelas lain.`,
        { conflicts: availability.conflictingBookings }
      )
    );
  }

  const validatedData: ValidatedBookingData = Object.freeze({
    room,
    date,
    slot,
    userRole,
  });

  log.debug('Permintaan booking berhasil lolos seluruh validasi', {
    room: room.code,
    date: date.iso,
    slot: slot.raw,
    userRole,
  });

  return ok(validatedData);
}
