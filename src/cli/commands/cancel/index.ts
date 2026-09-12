import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config';
import type { CliError } from '@/cli/errors';
import type { CancelledBookingDetails } from '@/core/features/booking';
import type { Result } from '@/core/types';
import type { CancelBookingRawInput } from '@/core/validators';
import { cancelAction, type CancelActionOptions } from './action.ts';

/**
 * Spesifikasi opsi/flag khusus untuk perintah `cancel` / `batal` (Fase 5.2)
 */
export const CANCEL_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
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
  interactive: {
    type: 'boolean',
    short: 'i',
    default: false,
  },
});

/**
 * Metadata dan deskripsi perintah
 */
export const CANCEL_COMMAND = Object.freeze({
  name: 'cancel',
  alias: 'batal',
  description: 'Membatalkan peminjaman ruangan perkuliahan SDP Undiksha (Fase 5.2).',
  options: CANCEL_OPTIONS,
});

/**
 * Handler eksekusi utama perintah `cancel` dari CLI runner
 */
export async function executeCancel(
  rawArgs: Record<string, unknown> = {},
  runtimeConfig?: CliRuntimeConfig,
  positionals: string[] = []
): Promise<Result<CancelledBookingDetails, CliError>> {
  const isInteractive = Boolean(rawArgs.interactive || runtimeConfig?.rc?.interactive);
  const isQuiet = Boolean(runtimeConfig?.isQuiet);
  const isJsonOutput = Boolean(runtimeConfig?.isJsonOutput);

  // Dukung argumen posisi:
  // e.g. denia cancel [room] [date] [slot] (positionals: ['cancel', 'RAK_2.1', '15/10/2026', 'DEF'])
  // atau denia batal [room] [date] [slot]
  const commandOffset = positionals[0] === 'cancel' || positionals[0] === 'batal' ? 1 : 0;
  const posRoom = positionals[commandOffset];
  const posDate = positionals[commandOffset + 1];
  const posSlot = positionals[commandOffset + 2];

  const rawInput: Partial<CancelBookingRawInput> = {
    roomCode: (typeof rawArgs.room === 'string' ? rawArgs.room : posRoom) || undefined,
    date: (typeof rawArgs.date === 'string' ? rawArgs.date : posDate) || undefined,
    slotCode: (typeof rawArgs.slot === 'string' ? rawArgs.slot : posSlot) || undefined,
    userJid: typeof rawArgs.jid === 'string' ? rawArgs.jid : undefined,
  };

  const actionOptions: CancelActionOptions = {
    isInteractive,
    isQuiet,
    isJsonOutput,
  };

  return cancelAction(rawInput, actionOptions);
}

export * from './action.ts';
export * from './ui.ts';
