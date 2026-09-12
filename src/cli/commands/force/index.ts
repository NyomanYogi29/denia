import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config/index.ts';
import type { CliError } from '@/cli/errors/index.ts';
import type { ForceBookingDetails } from '@/core/features/force/index.ts';
import type { Result } from '@/core/types/index.ts';
import type { ForceBookingRawInput } from '@/core/validators/index.ts';
import { forceAction, type ForceActionOptions } from './action.ts';

/**
 * Spesifikasi opsi/flag khusus untuk perintah `force` (Fase 5.4)
 */
export const FORCE_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
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
  reason: {
    type: 'string',
    short: 'm',
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
export const FORCE_COMMAND = Object.freeze({
  name: 'force',
  alias: 'ambilalih',
  description:
    'Melakukan pengambilalihan paksa ruangan untuk agenda institusi oleh Staf/Admin (Fase 5.4).',
  options: FORCE_OPTIONS,
});

/**
 * Handler eksekusi utama perintah `force` dari CLI runner
 */
export async function executeForce(
  rawArgs: Record<string, unknown> = {},
  runtimeConfig?: CliRuntimeConfig,
  positionals: string[] = []
): Promise<Result<ForceBookingDetails, CliError>> {
  const isInteractive = Boolean(rawArgs.interactive || runtimeConfig?.rc?.interactive);
  const isQuiet = Boolean(runtimeConfig?.isQuiet);
  const isJsonOutput = Boolean(runtimeConfig?.isJsonOutput);

  // Dukung argumen posisi:
  // e.g. denia force [room] [date] [slot] [reason...]
  const commandOffset =
    positionals[0] === 'force' || positionals[0] === 'ambilalih' ? 1 : 0;
  const posRoom = positionals[commandOffset];
  const posDate = positionals[commandOffset + 1];
  const posSlot = positionals[commandOffset + 2];
  const posReason = positionals.slice(commandOffset + 3).join(' ') || undefined;

  const rawInput: Partial<ForceBookingRawInput> = {
    roomCode: (typeof rawArgs.room === 'string' ? rawArgs.room : posRoom) || undefined,
    date: (typeof rawArgs.date === 'string' ? rawArgs.date : posDate) || undefined,
    slotCode: (typeof rawArgs.slot === 'string' ? rawArgs.slot : posSlot) || undefined,
    userJid: typeof rawArgs.jid === 'string' ? rawArgs.jid : undefined,
    reason:
      (typeof rawArgs.reason === 'string' ? rawArgs.reason : posReason) || undefined,
  };

  const actionOptions: ForceActionOptions = {
    isInteractive,
    isQuiet,
    isJsonOutput,
  };

  return forceAction(rawInput, actionOptions);
}

export * from './action.ts';
export * from './ui.ts';
