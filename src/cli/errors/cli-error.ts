import { AppError, ErrorCode } from '@/core/errors';
import type { CliErrorOptions } from './types.ts';

/**
 * Base custom error class untuk seluruh operasi di lingkungan CLI Denia
 */
export class CliError extends AppError {
  readonly exitCode: number;
  readonly hint?: string;

  constructor(options: CliErrorOptions) {
    super({
      code: options.code ?? ErrorCode.INVALID_COMMAND_SYNTAX,
      userMessage: options.message,
      cause: options.cause,
    });
    this.name = 'CliError';
    this.exitCode = options.exitCode ?? 1;
    this.hint = options.hint;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Error ketika argumen/opsi CLI yang diberikan tidak valid atau kurang
 */
export class CliArgumentError extends CliError {
  constructor(message: string, hint?: string) {
    super({
      code: ErrorCode.INVALID_COMMAND_SYNTAX,
      message,
      exitCode: 2,
      hint,
    });
    this.name = 'CliArgumentError';
  }
}

/**
 * Error ketika subcommand CLI yang dipanggil tidak ditemukan
 */
export class CliCommandNotFoundError extends CliError {
  constructor(commandName: string) {
    super({
      code: ErrorCode.UNKNOWN_COMMAND,
      message: `Perintah "${commandName}" tidak dikenali.`,
      exitCode: 127,
      hint: 'Gunakan opsi "--help" untuk melihat daftar perintah yang tersedia.',
    });
    this.name = 'CliCommandNotFoundError';
  }
}
