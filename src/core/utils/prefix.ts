import { AppError, ErrorCode, ValidationError } from '@/core/errors';
import { logger } from '@/core/logger';
import { err, ok, type Result } from '@/core/types';

const log = logger.child({ module: 'PREFIX_FILTER' });

export const DEFAULT_COMMAND_PREFIX = '!';

/**
 * Representasi objek perintah WhatsApp yang berhasil di-parsing
 */
export interface ParsedCommand {
  /**
   * Prefix karakter pemicu perintah (default: '!')
   */
  readonly prefix: string;
  /**
   * Nama perintah dalam format huruf kecil / lowercase (contoh: 'pinjam', 'batal', 'info', 'force')
   */
  readonly command: string;
  /**
   * Daftar argumen perintah yang dipisahkan oleh spasi / whitespace
   */
  readonly args: readonly string[];
  /**
   * Seluruh teks argumen mentah setelah nama perintah
   */
  readonly rawArgs: string;
  /**
   * Teks mentah asli dari pesan pengguna
   */
  readonly rawText: string;
}

/**
 * Memeriksa apakah teks pesan diawali dengan prefix perintah (default: '!')
 *
 * Contoh:
 * hasCommandPrefix('!pinjam RAK_2.1') -> true
 * hasCommandPrefix('Halo bot') -> false
 */
export function hasCommandPrefix(
  text: string | null | undefined,
  prefix: string = DEFAULT_COMMAND_PREFIX
): boolean {
  if (typeof text !== 'string') {
    return false;
  }
  const trimmed = text.trim();
  return trimmed.startsWith(prefix);
}

/**
 * Memeriksa apakah pesan teks merupakan perintah WhatsApp yang valid (diawali prefix dan memiliki nama perintah)
 *
 * Contoh:
 * isCommandMessage('!pinjam RAK_2.1') -> true
 * isCommandMessage('!') -> false
 * isCommandMessage('!   ') -> false
 * isCommandMessage('halo') -> false
 */
export function isCommandMessage(
  text: string | null | undefined,
  prefix: string = DEFAULT_COMMAND_PREFIX
): boolean {
  if (!hasCommandPrefix(text, prefix)) {
    return false;
  }

  const trimmed = (text as string).trim();
  const withoutPrefix = trimmed.slice(prefix.length).trim();
  return withoutPrefix.length > 0;
}

/**
 * Mengekstrak data perintah dari string tanpa melempar error (mengembalikan null jika bukan perintah yang valid)
 */
export function extractCommand(
  text: string | null | undefined,
  prefix: string = DEFAULT_COMMAND_PREFIX
): ParsedCommand | null {
  if (!isCommandMessage(text, prefix)) {
    return null;
  }

  const trimmed = (text as string).trim();
  const content = trimmed.slice(prefix.length).trim();

  // Pisahkan token nama perintah dan argumen
  const tokens = content.split(/\s+/).filter(Boolean);
  const commandName = tokens[0]?.toLowerCase() ?? '';

  if (!commandName) {
    return null;
  }

  const args = tokens.slice(1);

  // Ambil rawArgs dengan memotong nama perintah dari content asli
  const commandIndex = content.indexOf(tokens[0]!);
  const afterCommand = content.slice(commandIndex + tokens[0]!.length).trim();

  return Object.freeze({
    prefix,
    command: commandName,
    args: Object.freeze(args),
    rawArgs: afterCommand,
    rawText: text as string,
  });
}

/**
 * Melakukan parsing teks perintah WhatsApp dengan Result Pattern
 *
 * Contoh:
 * parseCommand('!pinjam RAK_2.1 10/09/2026 DEF') -> ok({ prefix: '!', command: 'pinjam', args: [...], ... })
 * parseCommand('Halo bot') -> err(ValidationError(INVALID_COMMAND_SYNTAX))
 */
export function parseCommand(
  text: string | null | undefined,
  prefix: string = DEFAULT_COMMAND_PREFIX
): Result<ParsedCommand, AppError> {
  if (typeof text !== 'string' || !text.trim()) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Pesan perintah tidak boleh kosong.',
        { text }
      )
    );
  }

  const trimmed = text.trim();

  if (!trimmed.startsWith(prefix)) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        `Pesan harus diawali dengan prefix perintah "${prefix}".`,
        { text: trimmed, expectedPrefix: prefix }
      )
    );
  }

  const content = trimmed.slice(prefix.length).trim();
  if (!content) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Nama perintah tidak boleh kosong setelah prefix tanda seru (!).',
        { text: trimmed }
      )
    );
  }

  const parsed = extractCommand(text, prefix);
  if (!parsed) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Gagal memproses struktur perintah pesan.',
        { text: trimmed }
      )
    );
  }

  log.debug('Berhasil mem-parsing perintah WhatsApp', {
    command: parsed.command,
    argsCount: parsed.args.length,
  });

  return ok(parsed);
}
