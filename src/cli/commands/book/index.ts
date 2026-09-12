import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config';
import type { CliError } from '@/cli/errors';
import type { BookedRoomDetails } from '@/core/features/booking';
import type { Result } from '@/core/types';
import type { CreateBookingRawInput } from '@/core/validators';
import { bookAction, type BookActionOptions } from './action.ts';

/**
 * Spesifikasi opsi/flag khusus untuk perintah `book` / `pinjam` (Fase 5.1)
 */
export const BOOK_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
  room: {
    type: 'string',
    short: 'r',
  },
  date: {
    type: 'string',
    short: 'd',
  },
  slot: {
    type: 'string',
    short: 's',
  },
  jid: {
    type: 'string',
    short: 'j',
  },
  notes: {
    type: 'string',
    short: 'n',
  },
  type: {
    type: 'string',
    short: 't',
  },
  interactive: {
    type: 'boolean',
    short: 'i',
    default: false,
  },
});

/**
 * Metadata dan deskripsi perintah
 */
export const BOOK_COMMAND = Object.freeze({
  name: 'book',
  alias: 'pinjam',
  description: 'Melakukan peminjaman ruangan perkuliahan SDP Undiksha (Fase 5.1).',
  options: BOOK_OPTIONS,
});

/**
 * Handler eksekusi utama perintah `book` dari CLI runner
 */
export async function executeBook(
  rawArgs: Record<string, unknown> = {},
  runtimeConfig?: CliRuntimeConfig,
  positionals: string[] = []
): Promise<Result<BookedRoomDetails, CliError>> {
  const isInteractive = Boolean(rawArgs.interactive || runtimeConfig?.rc?.interactive);
  const isQuiet = Boolean(runtimeConfig?.isQuiet);
  const isJsonOutput = Boolean(runtimeConfig?.isJsonOutput);

  // Dukung argumen posisi:
  // e.g. denia book [room] [date] [slot] (positionals: ['book', 'RAK_2.1', '15/10/2026', 'DEF'])
  // atau denia pinjam [room] [date] [slot]
  const commandOffset = positionals[0] === 'book' || positionals[0] === 'pinjam' ? 1 : 0;
  const posRoom = positionals[commandOffset];
  const posDate = positionals[commandOffset + 1];
  const posSlot = positionals[commandOffset + 2];

  const rawInput: Partial<CreateBookingRawInput> = {
    roomCode: (typeof rawArgs.room === 'string' ? rawArgs.room : posRoom) || undefined,
    date: (typeof rawArgs.date === 'string' ? rawArgs.date : posDate) || undefined,
    slotCode: (typeof rawArgs.slot === 'string' ? rawArgs.slot : posSlot) || undefined,
    userJid: typeof rawArgs.jid === 'string' ? rawArgs.jid : undefined,
    notes: typeof rawArgs.notes === 'string' ? rawArgs.notes : undefined,
    bookingType: (typeof rawArgs.type === 'string' ? rawArgs.type : 'adhoc') as any,
  };

  const actionOptions: BookActionOptions = {
    isInteractive,
    isQuiet,
    isJsonOutput,
  };

  return bookAction(rawInput, actionOptions);
}

export * from './action.ts';
export * from './ui.ts';
