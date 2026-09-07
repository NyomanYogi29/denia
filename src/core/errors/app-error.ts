import { ErrorCode, type ErrorCodeType } from './codes.ts';

export interface AppErrorOptions {
  code: ErrorCodeType;
  userMessage: string;
  metadata?: Record<string, unknown>;
  cause?: unknown;
}

/**
 * Custom base error class untuk seluruh domain aplikasi Denia
 */
export class AppError extends Error {
  readonly code: ErrorCodeType;
  readonly userMessage: string;
  readonly metadata?: Record<string, unknown>;

  constructor(options: AppErrorOptions) {
    super(options.userMessage);
    this.name = 'AppError';
    this.code = options.code;
    this.userMessage = options.userMessage;
    this.metadata = options.metadata;
    if (options.cause) {
      this.cause = options.cause;
    }
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error ketika pengguna belum terdaftar atau tidak memiliki hak akses
 */
export class UnauthorizedError extends AppError {
  constructor(userMessage = 'Nomor Anda belum terdaftar sebagai Korti atau Staf.', metadata?: Record<string, unknown>) {
    super({
      code: ErrorCode.UNAUTHORIZED,
      userMessage,
      metadata,
    });
    this.name = 'UnauthorizedError';
  }
}

/**
 * Error ketika terjadi bentrok jadwal atau ruangan sedang diblokir
 */
export class SlotConflictError extends AppError {
  constructor(userMessage = 'Ruangan pada tanggal dan slot tersebut sudah dipesan atau diblokir untuk agenda kampus.', metadata?: Record<string, unknown>) {
    super({
      code: ErrorCode.SLOT_CONFLICT,
      userMessage,
      metadata,
    });
    this.name = 'SlotConflictError';
  }
}

/**
 * Error validasi input (tanggal, slot, format sintaks)
 */
export class ValidationError extends AppError {
  constructor(code: ErrorCodeType, userMessage: string, metadata?: Record<string, unknown>) {
    super({
      code,
      userMessage,
      metadata,
    });
    this.name = 'ValidationError';
  }
}

/**
 * Error ketika ruangan atau data booking tidak ditemukan
 */
export class NotFoundError extends AppError {
  constructor(code: ErrorCodeType, userMessage: string, metadata?: Record<string, unknown>) {
    super({
      code,
      userMessage,
      metadata,
    });
    this.name = 'NotFoundError';
  }
}

/**
 * Error operasi basis data (SQLite constraint, kegagalan query)
 */
export class DatabaseError extends AppError {
  constructor(userMessage: string, metadata?: Record<string, unknown>, cause?: unknown) {
    super({
      code: ErrorCode.DATABASE_ERROR,
      userMessage,
      metadata,
      cause,
    });
    this.name = 'DatabaseError';
  }
}

