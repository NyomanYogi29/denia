import type { AppError } from '../errors/index.ts';

/**
 * Representasi hasil operasi yang sukses.
 */
export interface Ok<T> {
  readonly success: true;
  readonly data: T;
}

/**
 * Representasi hasil operasi yang gagal.
 */
export interface Err<E> {
  readonly success: false;
  readonly error: E;
}

/**
 * Tipe union Result pattern untuk standardisasi response contract.
 * Default error type adalah `AppError`.
 */
export type Result<T, E = AppError> = Ok<T> | Err<E>;

/**
 * Helper function untuk membungkus data sukses ke dalam `Result`.
 *
 * @param data Data yang dihasilkan dari operasi sukses
 * @returns Object Result dengan status sukses (`success: true`)
 */
export const ok = <T>(data: T): Ok<T> => ({
  success: true,
  data,
});

/**
 * Helper function untuk membungkus error kegagalan ke dalam `Result`.
 *
 * @param error Error/kegagalan yang terjadi
 * @returns Object Result dengan status gagal (`success: false`)
 */
export const err = <E = AppError>(error: E): Err<E> => ({
  success: false,
  error,
});
