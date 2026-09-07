import { ErrorCode, type ErrorCodeType } from './codes.ts';
import { AppError } from './app-error.ts';

export interface ResolvedError {
  code: ErrorCodeType;
  userMessage: string;
  suggestion: string;
  logLevel: 'warn' | 'error';
  rawError: unknown;
}

/**
 * Resolver berbasis switch-case untuk mengurai segala bentuk error yang masuk ke sistem,
 * mengonversinya menjadi format terstandarisasi untuk notifikasi WhatsApp Japri/DM dan logging.
 */
export const resolveError = (error: unknown): ResolvedError => {
  // 1. Jika error sudah merupakan instance AppError
  if (error instanceof AppError) {
    return resolveAppError(error);
  }

  // 2. Deteksi error database SQLite (Unique Constraint / SQLITE_CONSTRAINT)
  if (error instanceof Error) {
    const errorStr = error.message || '';

    // Cek pelanggaran Unique Constraint pada SQLite (misal: double-booking race condition)
    if (
      errorStr.includes('UNIQUE constraint failed') ||
      errorStr.includes('SQLITE_CONSTRAINT') ||
      errorStr.includes('idx_bookings_unique_active_slot')
    ) {
      return {
        code: ErrorCode.SLOT_CONFLICT,
        userMessage: 'Gagal memesan ruangan: Slot ruangan pada tanggal tersebut baru saja dipesan oleh kelas lain.',
        suggestion: 'Gunakan perintah `!cekruangan [DD/MM/YYYY]` untuk melihat slot lain yang masih tersedia.',
        logLevel: 'warn',
        rawError: error,
      };
    }

    // Error koneksi / I/O database
    if (errorStr.includes('SQLITE_BUSY') || errorStr.includes('SQLITE_LOCKED')) {
      return {
        code: ErrorCode.DATABASE_ERROR,
        userMessage: 'Sistem database sedang sibuk memproses transaksi lain. Silakan coba kembali sesaat lagi.',
        suggestion: 'Tunggu beberapa detik dan kirim ulang perintah Anda.',
        logLevel: 'error',
        rawError: error,
      };
    }
  }

  // 3. Fallback untuk Unknown / Internal System Errors
  return {
    code: ErrorCode.INTERNAL_ERROR,
    userMessage: 'Terjadi kendala internal pada sistem bot.',
    suggestion: 'Silakan hubungi administrator atau staf SDP jika kendala terus berulang.',
    logLevel: 'error',
    rawError: error,
  };
};

/**
 * Switch-case mapping untuk menghasilkan pesan edukatif dan saran perbaikan
 * berdasarkan ErrorCode dari AppError.
 */
const resolveAppError = (error: AppError): ResolvedError => {
  let suggestion = '';
  let logLevel: 'warn' | 'error' = 'warn';

  switch (error.code) {
    case ErrorCode.USER_NOT_REGISTERED:
    case ErrorCode.UNAUTHORIZED:
      suggestion = 'Minta staf SDP atau admin untuk mendaftarkan nomor Anda via perintah: `!register @mention [NIM] [Kelas]`.';
      logLevel = 'warn';
      break;

    case ErrorCode.FORBIDDEN_ROLE:
      suggestion = 'Perintah ini hanya dapat diakses oleh Staf SDP atau Admin.';
      logLevel = 'warn';
      break;

    case ErrorCode.SLOT_CONFLICT:
    case ErrorCode.FORCE_BLOCKED:
      suggestion = 'Gunakan perintah `!cekruangan [DD/MM/YYYY]` untuk memeriksa slot ruangan lain yang masih kosong.';
      logLevel = 'warn';
      break;

    case ErrorCode.INVALID_SLOT_FORMAT:
      suggestion = 'Gunakan kode slot alfabetik dari A sampai O (Contoh: `DEF`).';
      logLevel = 'warn';
      break;

    case ErrorCode.INVALID_SLOT_SEQUENCE:
      suggestion = 'Slot yang dipesan harus berurutan secara kontigu (Contoh: `DEF` valid, sedangkan `ADF` tidak valid).';
      logLevel = 'warn';
      break;

    case ErrorCode.SLOT_LIMIT_EXCEEDED:
      suggestion = 'Maksimal pemesanan adalah 3–4 SKS per transaksi booking.';
      logLevel = 'warn';
      break;

    case ErrorCode.INVALID_DATE_FORMAT:
      suggestion = 'Format tanggal harus menggunakan pola `DD/MM/YYYY` (Contoh: `10/09/2026`).';
      logLevel = 'warn';
      break;

    case ErrorCode.PAST_DATE_NOT_ALLOWED:
      suggestion = 'Pastikan tanggal booking adalah hari ini atau hari di masa mendatang.';
      logLevel = 'warn';
      break;

    case ErrorCode.INVALID_BOOKING_LEAD_TIME:
      suggestion = 'Pemesanan ruangan untuk Korti harus diajukan minimal H-1 sebelum hari pemakaian. Untuk kebutuhan mendesak pada hari H, silakan hubungi Staf SDP.';
      logLevel = 'warn';
      break;

    case ErrorCode.ROOM_NOT_FOUND:
      suggestion = 'Pastikan kode ruangan terdaftar di SDP Undiksha (Contoh: `RAK_4.1`).';
      logLevel = 'warn';
      break;

    case ErrorCode.BOOKING_NOT_FOUND:
      suggestion = 'Pastikan data peminjaman yang ingin dibatalkan memang ada dan aktif.';
      logLevel = 'warn';
      break;

    case ErrorCode.NOT_BOOKING_OWNER:
      suggestion = 'Anda hanya dapat membatalkan peminjaman yang Anda pesan sendiri.';
      logLevel = 'warn';
      break;

    case ErrorCode.RESOURCE_NOT_FOUND:
      suggestion = 'Pastikan berkas atau sumber daya yang diminta tersedia pada lokasi yang ditentukan.';
      logLevel = 'warn';
      break;

    case ErrorCode.INVALID_COMMAND_SYNTAX:
      suggestion = 'Ketik `!help` atau `!info` untuk melihat petunjuk dan format sintaks perintah yang benar.';
      logLevel = 'warn';
      break;

    case ErrorCode.DATABASE_ERROR:
    case ErrorCode.INTERNAL_ERROR:
      suggestion = 'Terjadi kesalahan sistem. Silakan coba kembali atau hubungi pengelola SDP.';
      logLevel = 'error';
      break;

    default:
      suggestion = 'Silakan periksa kembali pesan perintah Anda.';
      logLevel = 'warn';
      break;
  }

  return {
    code: error.code,
    userMessage: error.userMessage,
    suggestion,
    logLevel,
    rawError: error,
  };
};
