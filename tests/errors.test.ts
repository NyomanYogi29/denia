import { describe, expect, it } from 'bun:test';
import {
  AppError,
  ErrorCode,
  NotFoundError,
  resolveError,
  SlotConflictError,
  UnauthorizedError,
  ValidationError,
} from '@/errors';

describe('Errors & Resolver Module', () => {
  it('should instantiate AppError subclasses correctly', () => {
    const unauthErr = new UnauthorizedError();
    expect(unauthErr).toBeInstanceOf(AppError);
    expect(unauthErr.code).toBe(ErrorCode.UNAUTHORIZED);

    const conflictErr = new SlotConflictError();
    expect(conflictErr.code).toBe(ErrorCode.SLOT_CONFLICT);

    const validationErr = new ValidationError(ErrorCode.INVALID_SLOT_FORMAT, 'Format slot salah');
    expect(validationErr.code).toBe(ErrorCode.INVALID_SLOT_FORMAT);

    const notFoundErr = new NotFoundError(ErrorCode.ROOM_NOT_FOUND, 'Ruangan tidak ada');
    expect(notFoundErr.code).toBe(ErrorCode.ROOM_NOT_FOUND);
  });

  it('should resolve AppError to structured response with suggestion', () => {
    const conflictErr = new SlotConflictError('Ruangan sudah dipinjam');
    const resolved = resolveError(conflictErr);

    expect(resolved.code).toBe(ErrorCode.SLOT_CONFLICT);
    expect(resolved.userMessage).toBe('Ruangan sudah dipinjam');
    expect(resolved.suggestion).toContain('!cekruangan');
    expect(resolved.logLevel).toBe('warn');
  });

  it('should resolve SQLite UNIQUE constraint error to SLOT_CONFLICT', () => {
    const sqliteError = new Error('UNIQUE constraint failed: bookings.room_code, bookings.booking_date, bookings.slot_code, bookings.status');
    const resolved = resolveError(sqliteError);

    expect(resolved.code).toBe(ErrorCode.SLOT_CONFLICT);
    expect(resolved.userMessage).toContain('baru saja dipesan');
    expect(resolved.suggestion).toContain('!cekruangan');
    expect(resolved.logLevel).toBe('warn');
  });

  it('should resolve unknown error to INTERNAL_ERROR with error logLevel', () => {
    const unknownErr = new TypeError('Cannot read property of undefined');
    const resolved = resolveError(unknownErr);

    expect(resolved.code).toBe(ErrorCode.INTERNAL_ERROR);
    expect(resolved.logLevel).toBe('error');
    expect(resolved.suggestion).toContain('staf SDP');
  });
});
