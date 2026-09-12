import { ok, err, type Result } from '@/core/types';
import { ValidationError, ErrorCode } from '@/core/errors';
import { logger } from '@/core/logger';

const log = logger.child({ module: 'DATE_PARSER' });

export const DATE_REGEX = /^(\d{2})\/(\d{2})\/(\d{4})$/;
export const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
export const DEFAULT_TIMEZONE = 'Asia/Makassar'; // WITA (Bali)

export interface ParsedDate {
  readonly raw: string;
  readonly iso: string;
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

export interface DateParseOptions {
  readonly allowPast?: boolean;
  readonly referenceDate?: Date;
  readonly timeZone?: string;
}

/**
 * Mendapatkan tanggal hari ini dalam format ISO (YYYY-MM-DD) berdasarkan zona waktu WITA.
 */
export function getTodayIso(timeZone = DEFAULT_TIMEZONE, referenceDate = new Date()): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(referenceDate);
}

/**
 * Mendapatkan tanggal besok dalam format ISO (YYYY-MM-DD) berdasarkan zona waktu WITA.
 */
export function getTomorrowIso(timeZone = DEFAULT_TIMEZONE, referenceDate = new Date()): string {
  const tomorrow = new Date(referenceDate);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return getTodayIso(timeZone, tomorrow);
}

/**
 * Mendapatkan jam dan menit saat ini dalam format HH:mm berdasarkan zona waktu WITA.
 */
export function getCurrentWitaTime(timeZone = DEFAULT_TIMEZONE, referenceDate = new Date()): {
  readonly hours: number;
  readonly minutes: number;
  readonly timeStr: string;
} {
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(referenceDate);
  const hours = Number.parseInt(parts.find((p) => p.type === 'hour')?.value ?? '0', 10);
  const minutes = Number.parseInt(parts.find((p) => p.type === 'minute')?.value ?? '0', 10);
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  return Object.freeze({ hours, minutes, timeStr });
}

/**
 * Mengonversi tanggal ISO (YYYY-MM-DD) ke format tampilan bot (DD/MM/YYYY).
 */
export function isoToDateString(iso: string): Result<string> {
  const match = ISO_DATE_REGEX.exec(iso);
  if (!match) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_DATE_FORMAT,
        `Format tanggal ISO "${iso}" tidak valid. Harap gunakan format YYYY-MM-DD.`,
        { iso }
      )
    );
  }

  const year = match[1]!;
  const month = match[2]!;
  const day = match[3]!;

  return ok(`${day}/${month}/${year}`);
}

/**
 * Memvalidasi dan melakukan parsing format tanggal DD/MM/YYYY ke format ISO YYYY-MM-DD.
 * Mendukung kata kunci relatif seperti 'besok' / 'tomorrow' dan 'hari ini' / 'today'.
 * Memeriksa keabsahan kalender (termasuk tahun kabisat) serta memastikan bukan tanggal lampau.
 */
export function parseDateString(raw: string, options?: DateParseOptions): Result<ParsedDate> {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return err(
      new ValidationError(ErrorCode.INVALID_DATE_FORMAT, 'Tanggal pemesanan tidak boleh kosong.', {
        raw,
      })
    );
  }

  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  // Dukung kata kunci tanggal relatif
  const allowRelative = options?.allowRelativeKeywords ?? true;
  if (allowRelative) {
    if (lower === 'besok' || lower === 'tomorrow') {
      const timeZone = options?.timeZone ?? DEFAULT_TIMEZONE;
      const refDate = options?.referenceDate ?? new Date();
      const tomorrowIso = getTomorrowIso(timeZone, refDate);
      const [yearStr, monthStr, dayStr] = tomorrowIso.split('-');
      const day = Number.parseInt(dayStr!, 10);
      const month = Number.parseInt(monthStr!, 10);
      const year = Number.parseInt(yearStr!, 10);
      const formatted = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
      return ok(
        Object.freeze({
          raw: formatted,
          iso: tomorrowIso,
          day,
          month,
          year,
        })
      );
    }

    if (lower === 'hari ini' || lower === 'today') {
      const timeZone = options?.timeZone ?? DEFAULT_TIMEZONE;
      const refDate = options?.referenceDate ?? new Date();
      const todayIso = getTodayIso(timeZone, refDate);
      const [yearStr, monthStr, dayStr] = todayIso.split('-');
      const day = Number.parseInt(dayStr!, 10);
      const month = Number.parseInt(monthStr!, 10);
      const year = Number.parseInt(yearStr!, 10);
      const formatted = `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
      return ok(
        Object.freeze({
          raw: formatted,
          iso: todayIso,
          day,
          month,
          year,
        })
      );
    }
  }

  const match = DATE_REGEX.exec(trimmed);

  if (!match) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_DATE_FORMAT,
        `Format tanggal "${trimmed}" tidak valid. Gunakan format DD/MM/YYYY (Contoh: 10/09/2026).`,
        { raw: trimmed }
      )
    );
  }

  const day = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10);
  const year = Number.parseInt(match[3]!, 10);

  // Validasi batas tahun wajar sistem
  if (year < 2024 || year > 2099) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_DATE_FORMAT,
        `Tahun ${year} di luar rentang operasional sistem (2024-2099).`,
        { raw: trimmed, year }
      )
    );
  }

  // Validasi bulan
  if (month < 1 || month > 12) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_DATE_FORMAT,
        `Bulan ${month} tidak valid. Bulan harus berada di antara 01 sampai 12.`,
        { raw: trimmed, month }
      )
    );
  }

  // Validasi jumlah hari dalam bulan (termasuk tahun kabisat)
  const daysInMonth = new Date(year, month, 0).getDate();
  if (day < 1 || day > daysInMonth) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_DATE_FORMAT,
        `Tanggal ${day} tidak valid untuk bulan ${month}/${year} (Maksimal ${daysInMonth} hari).`,
        { raw: trimmed, day, month, year, daysInMonth }
      )
    );
  }

  const paddedMonth = String(month).padStart(2, '0');
  const paddedDay = String(day).padStart(2, '0');
  const iso = `${year}-${paddedMonth}-${paddedDay}`;

  // Validasi tanggal lampau (past date)
  const allowPast = options?.allowPast ?? false;
  if (!allowPast) {
    const timeZone = options?.timeZone ?? DEFAULT_TIMEZONE;
    const referenceDate = options?.referenceDate ?? new Date();
    const todayIso = getTodayIso(timeZone, referenceDate);

    if (iso < todayIso) {
      return err(
        new ValidationError(
          ErrorCode.PAST_DATE_NOT_ALLOWED,
          `Tanggal booking (${trimmed}) sudah berlalu. Pemesanan ruangan hanya diperbolehkan untuk hari ini atau hari mendatang.`,
          { raw: trimmed, iso, todayIso }
        )
      );
    }
  }

  const parsedDate: ParsedDate = Object.freeze({
    raw: trimmed,
    iso,
    day,
    month,
    year,
  });

  log.debug('Berhasil mem-parsing tanggal', { raw: trimmed, iso });
  return ok(parsedDate);
}

/**
 * Format tanggal ISO ke format teks bahasa Indonesia (Contoh: "Kamis, 10 September 2026").
 */
export function formatIndonesianDate(iso: string): string {
  const match = ISO_DATE_REGEX.exec(iso);
  if (!match) return iso;

  const year = Number.parseInt(match[1]!, 10);
  const month = Number.parseInt(match[2]!, 10) - 1;
  const day = Number.parseInt(match[3]!, 10);

  const dateObj = new Date(year, month, day);
  return new Intl.DateTimeFormat('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(dateObj);
}

export interface BookingLeadTimeResult {
  readonly bookingIso: string;
  readonly todayIso: string;
  readonly leadTimeDays: number;
  readonly isAllowed: boolean;
}

export interface LeadTimeOptions {
  readonly referenceDate?: Date;
  readonly timeZone?: string;
}

/**
 * Menghitung selisih hari kalender antara tanggal booking (ISO YYYY-MM-DD) dan hari ini di zona waktu WITA.
 * - Nilai 0: Pemesanan untuk hari yang sama (hari H).
 * - Nilai 1: Pemesanan H-1 (besok).
 * - Nilai > 1: Pemesanan jauh-jauh hari (H-2, H-3, dst).
 * - Nilai < 0: Tanggal di masa lampau.
 */
export function calculateLeadTimeDays(bookingIso: string, options?: LeadTimeOptions): number {
  const timeZone = options?.timeZone ?? DEFAULT_TIMEZONE;
  const referenceDate = options?.referenceDate ?? new Date();
  const todayIso = getTodayIso(timeZone, referenceDate);

  const [tYear, tMonth, tDay] = todayIso.split('-').map(Number);
  const [bYear, bMonth, bDay] = bookingIso.split('-').map(Number);

  if (!tYear || !tMonth || !tDay || !bYear || !bMonth || !bDay) {
    return Number.NaN;
  }

  const todayUtc = Date.UTC(tYear, tMonth - 1, tDay);
  const bookingUtc = Date.UTC(bYear, bMonth - 1, bDay);
  const msPerDay = 24 * 60 * 60 * 1000;

  return Math.round((bookingUtc - todayUtc) / msPerDay);
}

/**
 * Memvalidasi aturan lead time peminjaman ruangan sesuai regulasi operasional V2:
 * - Mahasiswa / Korti (role 'korti'): Wajib diajukan minimal H-1 sebelum hari pemakaian (leadTimeDays >= 1).
 *   Pemesanan pada hari H (leadTimeDays === 0) ditolak dengan INVALID_BOOKING_LEAD_TIME.
 * - Staf / Admin (role 'staff' | 'admin'): Diizinkan memesan pada hari H (leadTimeDays >= 0)
 *   untuk mengakomodasi perkuliahan pengganti dosen atau force takeover mendadak.
 * - Seluruh peran: Pemesanan untuk tanggal lampau (leadTimeDays < 0) ditolak dengan PAST_DATE_NOT_ALLOWED.
 */
export function validateBookingLeadTime(
  bookingDateOrIso: string,
  role: string = 'korti',
  options?: LeadTimeOptions
): Result<BookingLeadTimeResult> {
  let bookingIso = bookingDateOrIso.trim();

  // Jika input dalam format DD/MM/YYYY, konversikan ke ISO YYYY-MM-DD
  if (DATE_REGEX.test(bookingIso)) {
    const parseRes = parseDateString(bookingIso, { allowPast: true });
    if (!parseRes.success) {
      return parseRes;
    }
    bookingIso = parseRes.data.iso;
  } else if (!ISO_DATE_REGEX.test(bookingIso)) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_DATE_FORMAT,
        `Format tanggal "${bookingDateOrIso}" tidak valid. Gunakan format DD/MM/YYYY atau YYYY-MM-DD.`,
        { raw: bookingDateOrIso }
      )
    );
  }

  const timeZone = options?.timeZone ?? DEFAULT_TIMEZONE;
  const referenceDate = options?.referenceDate ?? new Date();
  const todayIso = getTodayIso(timeZone, referenceDate);
  const leadTimeDays = calculateLeadTimeDays(bookingIso, { timeZone, referenceDate });

  if (leadTimeDays < 0) {
    return err(
      new ValidationError(
        ErrorCode.PAST_DATE_NOT_ALLOWED,
        `Tanggal booking (${bookingDateOrIso}) sudah berlalu. Pemesanan ruangan tidak dapat dilakukan untuk masa lampau.`,
        { bookingIso, todayIso, leadTimeDays, role }
      )
    );
  }

  const isStaffOrAdmin = role === 'staff' || role === 'admin';

  // Aturan H-1: Korti dilarang memesan pada hari H
  if (leadTimeDays === 0 && !isStaffOrAdmin) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_BOOKING_LEAD_TIME,
        'Peminjaman ruangan reguler oleh Korti wajib dilakukan minimal H-1 sebelum hari pemakaian (maksimal H-1 sebelum jadwal penggunaan).',
        { bookingIso, todayIso, leadTimeDays, role }
      )
    );
  }

  const result: BookingLeadTimeResult = Object.freeze({
    bookingIso,
    todayIso,
    leadTimeDays,
    isAllowed: true,
  });

  return ok(result);
}
