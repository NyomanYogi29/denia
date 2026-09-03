import { describe, expect, it } from 'bun:test';
import { AppError, UnauthorizedError } from '../src/errors/index.ts';
import { err, ok, type Result } from '../src/types/index.ts';

describe('Types Module (Result Pattern)', () => {
  it('should return ok result with success: true and valid payload', () => {
    const payload = { id: 'booking-1', room: 'RAK_4.1' };
    const res = ok(payload);

    expect(res.success).toBe(true);
    expect(res.data).toEqual(payload);
  });

  it('should return err result with success: false and error object', () => {
    const error = new UnauthorizedError('Akses ditolak');
    const res = err(error);

    expect(res.success).toBe(false);
    expect(res.error).toBe(error);
    expect(res.error.userMessage).toBe('Akses ditolak');
  });

  it('should work seamlessly in typed functions returning Result<T, E>', () => {
    function divide(a: number, b: number): Result<number, AppError> {
      if (b === 0) {
        return err(
          new AppError({
            code: 'VALIDATION_ERROR' as any,
            userMessage: 'Tidak bisa membagi dengan 0',
          })
        );
      }
      return ok(a / b);
    }

    const successResult = divide(10, 2);
    if (successResult.success) {
      expect(successResult.data).toBe(5);
    } else {
      throw new Error('Should have succeeded');
    }

    const failureResult = divide(10, 0);
    if (!failureResult.success) {
      expect(failureResult.error.userMessage).toBe('Tidak bisa membagi dengan 0');
    } else {
      throw new Error('Should have failed');
    }
  });
});
