import { baseLogger } from './init.ts';

export interface LogContext {
  module?: string;
  action?: string;
  [key: string]: unknown;
}

export class AppLogger {
  constructor(private readonly defaultContext: LogContext = {}) {}

  /**
   * Membuat child logger dengan scope/konteks modul tertentu
   */
  child(context: LogContext): AppLogger {
    return new AppLogger({ ...this.defaultContext, ...context });
  }

  /**
   * Standarisasi pesan sukses / informational
   */
  success(message: string, meta?: Record<string, unknown>): void {
    baseLogger.info(
      {
        status: 'SUCCESS',
        ...this.defaultContext,
        ...meta,
      },
      message
    );
  }

  /**
   * Standarisasi pesan info umum
   */
  info(message: string, meta?: Record<string, unknown>): void {
    baseLogger.info(
      {
        ...this.defaultContext,
        ...meta,
      },
      message
    );
  }

  /**
   * Standarisasi pesan error (mendukung parsing Error object & stack trace)
   */
  error(message: string, err?: unknown, meta?: Record<string, unknown>): void {
    let errorDetails: Record<string, unknown> = {};

    if (err instanceof Error) {
      errorDetails = {
        name: err.name,
        errorMessage: err.message,
        stack: err.stack,
      };
    } else if (err !== undefined) {
      errorDetails = { rawError: err };
    }

    baseLogger.error(
      {
        status: 'ERROR',
        ...this.defaultContext,
        ...errorDetails,
        ...meta,
      },
      message
    );
  }

  /**
   * Standarisasi peringatan / non-fatal issues
   */
  warn(message: string, meta?: Record<string, unknown>): void {
    baseLogger.warn(
      {
        status: 'WARN',
        ...this.defaultContext,
        ...meta,
      },
      message
    );
  }

  /**
   * Standarisasi logging debugging
   */
  debug(message: string, meta?: Record<string, unknown>): void {
    baseLogger.debug(
      {
        status: 'DEBUG',
        ...this.defaultContext,
        ...meta,
      },
      message
    );
  }
}

export const logger = new AppLogger();
