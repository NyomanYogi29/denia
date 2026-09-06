import { describe, expect, it } from 'bun:test';
import {
  CliArgumentError,
  CliCommandNotFoundError,
  CliError,
  formatCliError,
} from '@/cli/errors';
import { AppError, ErrorCode, ValidationError } from '@/core/errors';

describe('CLI Errors Module', () => {
  it('should instantiate CliError correctly with default values', () => {
    const error = new CliError({
      message: 'Operasi CLI gagal',
      hint: 'Periksa argumen yang diberikan',
    });

    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe('CliError');
    expect(error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
    expect(error.userMessage).toBe('Operasi CLI gagal');
    expect(error.exitCode).toBe(1);
    expect(error.hint).toBe('Periksa argumen yang diberikan');
  });

  it('should instantiate specialized CliArgumentError and CliCommandNotFoundError', () => {
    const argError = new CliArgumentError('Parameter --nim wajib diisi', 'Gunakan --nim <nomor>');
    expect(argError).toBeInstanceOf(CliError);
    expect(argError.name).toBe('CliArgumentError');
    expect(argError.exitCode).toBe(2);
    expect(argError.userMessage).toBe('Parameter --nim wajib diisi');
    expect(argError.hint).toBe('Gunakan --nim <nomor>');

    const cmdError = new CliCommandNotFoundError('unknown-cmd');
    expect(cmdError).toBeInstanceOf(CliError);
    expect(cmdError.name).toBe('CliCommandNotFoundError');
    expect(cmdError.exitCode).toBe(127);
    expect(cmdError.code).toBe(ErrorCode.UNKNOWN_COMMAND);
    expect(cmdError.userMessage).toContain('unknown-cmd');
  });

  it('should format CliError without any emoji', () => {
    const error = new CliArgumentError('Opsi tidak valid', 'Gunakan opsi yang benar');
    const formatted = formatCliError(error);

    expect(formatted.exitCode).toBe(2);
    expect(formatted.header).toBe(`[CLI ERROR] (${ErrorCode.INVALID_COMMAND_SYNTAX})`);
    expect(formatted.message).toBe('Opsi tidak valid');
    expect(formatted.hint).toBe('Gunakan opsi yang benar');
    expect(formatted.renderedText).toContain('[CLI ERROR]');
    expect(formatted.renderedText).toContain('Pesan: Opsi tidak valid');
    expect(formatted.renderedText).toContain('Saran: Gunakan opsi yang benar');

    // Pastikan tidak ada emoji
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u;
    expect(emojiRegex.test(formatted.renderedText)).toBe(false);
  });

  it('should format AppError correctly without emoji', () => {
    const appError = new ValidationError(ErrorCode.INVALID_DATE_FORMAT, 'Format tanggal salah');
    const formatted = formatCliError(appError);

    expect(formatted.exitCode).toBe(1);
    expect(formatted.header).toBe(`[APP ERROR] (${ErrorCode.INVALID_DATE_FORMAT})`);
    expect(formatted.message).toBe('Format tanggal salah');
    expect(formatted.hint).toBeUndefined();
    expect(formatted.renderedText).toContain('[APP ERROR]');
    expect(formatted.renderedText).not.toContain('Saran:');
  });

  it('should format standard Error and unknown error gracefully', () => {
    const sysError = new Error('Database connection failed');
    const formattedSys = formatCliError(sysError);

    expect(formattedSys.exitCode).toBe(1);
    expect(formattedSys.header).toBe('[SYSTEM ERROR]');
    expect(formattedSys.message).toBe('Database connection failed');

    const unknownFormatted = formatCliError('Network timeout string');
    expect(unknownFormatted.exitCode).toBe(1);
    expect(unknownFormatted.header).toBe('[UNKNOWN ERROR]');
    expect(unknownFormatted.message).toBe('Network timeout string');
  });
});
