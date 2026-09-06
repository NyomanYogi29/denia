import { AppError } from '@/core/errors';
import { CliError } from './cli-error.ts';
import type { FormattedCliError } from './types.ts';

/**
 * Memformat error apa pun menjadi representasi teks terminal terstruktur tanpa emoji
 */
export function formatCliError(error: unknown): FormattedCliError {
  let header = '[CLI ERROR]';
  let message = 'Terjadi kesalahan pada perintah CLI.';
  let hint: string | undefined;
  let exitCode = 1;

  if (error instanceof CliError) {
    header = `[CLI ERROR] (${error.code})`;
    message = error.userMessage;
    hint = error.hint;
    exitCode = error.exitCode;
  } else if (error instanceof AppError) {
    header = `[APP ERROR] (${error.code})`;
    message = error.userMessage;
    exitCode = 1;
  } else if (error instanceof Error) {
    header = '[SYSTEM ERROR]';
    message = error.message;
    exitCode = 1;
  } else if (error !== undefined && error !== null) {
    header = '[UNKNOWN ERROR]';
    message = String(error);
    exitCode = 1;
  }

  const lines: string[] = [header, `Pesan: ${message}`];
  if (hint) {
    lines.push(`Saran: ${hint}`);
  }

  return Object.freeze({
    header,
    message,
    hint,
    exitCode,
    renderedText: lines.join('\n'),
  });
}

/**
 * Menangani error CLI dengan mencetak ke stderr dan mematikan proses sesuai exitCode
 */
export function handleCliError(error: unknown): never {
  const formatted = formatCliError(error);
  console.error(formatted.renderedText);
  process.exit(formatted.exitCode);
}
