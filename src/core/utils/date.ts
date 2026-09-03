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
