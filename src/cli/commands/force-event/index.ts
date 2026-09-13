import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config/index.ts';
import type { CliError } from '@/cli/errors/index.ts';
import type { ForceEventDetails } from '@/core/features/force-event/index.ts';
import type { Result } from '@/core/types/index.ts';
import type { ForceEventRawInput } from '@/core/validators/index.ts';
import { forceEventAction, type ForceEventActionOptions } from './action.ts';

/**
 * Spesifikasi opsi/flag khusus untuk perintah `forceevent` (Fase 5.5)
 */
export const FORCE_EVENT_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
  rooms: {
    type: 'string',
    short: 'r',
  },
  dates: {
    type: 'string',
    short: 'd',
  },
  name: {
    type: 'string',
    short: 'n',
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
export const FORCE_EVENT_COMMAND = Object.freeze({
  name: 'forceevent',
  alias: 'event',
  description:
    'Melakukan pemblokiran sekumpulan ruangan sekaligus untuk rentang tanggal tertentu bagi agenda kampus (Fase 5.5).',
  options: FORCE_EVENT_OPTIONS,
});

/**
 * Handler eksekusi utama perintah `forceevent` dari CLI runner
 */
export async function executeForceEvent(
  rawArgs: Record<string, unknown> = {},
  runtimeConfig?: CliRuntimeConfig,
  positionals: string[] = []
): Promise<Result<ForceEventDetails, CliError>> {
  const isInteractive = Boolean(rawArgs.interactive || runtimeConfig?.rc?.interactive);
  const isQuiet = Boolean(runtimeConfig?.isQuiet);
  const isJsonOutput = Boolean(runtimeConfig?.isJsonOutput);

  // Dukung argumen posisi:
  // e.g. denia forceevent [rooms] [dateRange] [eventName...]
  const commandOffset =
    positionals[0] === 'forceevent' || positionals[0] === 'event' ? 1 : 0;
  const posRooms = positionals[commandOffset];
  const posDateRange = positionals[commandOffset + 1];
  const posEventName = positionals.slice(commandOffset + 2).join(' ') || undefined;

  const rawInput: Partial<ForceEventRawInput> = {
    roomCodes: (typeof rawArgs.rooms === 'string' ? rawArgs.rooms : posRooms) || undefined,
    dateRange: (typeof rawArgs.dates === 'string' ? rawArgs.dates : posDateRange) || undefined,
    userJid: typeof rawArgs.jid === 'string' ? rawArgs.jid : undefined,
    eventName:
      (typeof rawArgs.name === 'string' ? rawArgs.name : posEventName) || undefined,
  };

  const actionOptions: ForceEventActionOptions = {
    isInteractive,
    isQuiet,
    isJsonOutput,
  };

  return forceEventAction(rawInput, actionOptions);
}

export * from './action.ts';
export * from './ui.ts';
