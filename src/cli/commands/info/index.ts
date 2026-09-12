import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config';
import type { CliError } from '@/cli/errors';
import type { GetRoomAvailabilityResult } from '@/core/features/info';
import type { Result } from '@/core/types';
import { DATE_REGEX } from '@/core/utils';
import type { RoomInfoRawInput } from '@/core/validators';
import { infoAction, type InfoActionOptions } from './action.ts';

/**
 * Spesifikasi opsi/flag khusus untuk perintah `info` / `jadwal` (Fase 5.3)
 */
export const INFO_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
  date: {
    type: 'string',
    short: 'd',
  },
  room: {
    type: 'string',
    short: 'r',
  },
});

/**
 * Metadata dan deskripsi perintah
 */
export const INFO_COMMAND = Object.freeze({
  name: 'info',
  alias: 'jadwal',
  description: 'Menampilkan matriks ketersediaan seluruh ruangan perkuliahan per slot SKS (Fase 5.3).',
  options: INFO_OPTIONS,
});

/**
 * Handler eksekusi utama perintah `info` dari CLI runner
 */
export async function executeInfo(
  rawArgs: Record<string, unknown> = {},
  runtimeConfig?: CliRuntimeConfig,
  positionals: string[] = []
): Promise<Result<GetRoomAvailabilityResult, CliError>> {
  const isQuiet = Boolean(runtimeConfig?.isQuiet);
  const isJsonOutput = Boolean(runtimeConfig?.isJsonOutput);

  // Parse positional arguments:
  // e.g. denia info [date] [room] atau denia info [room] [date] atau denia jadwal [date]
  const commandOffset = positionals[0] === 'info' || positionals[0] === 'jadwal' ? 1 : 0;
  const firstPos = positionals[commandOffset];
  const secondPos = positionals[commandOffset + 1];

  let posDate: string | undefined;
  let posRoom: string | undefined;

  if (firstPos) {
    if (DATE_REGEX.test(firstPos) || firstPos.includes('/')) {
      posDate = firstPos;
      posRoom = secondPos;
    } else {
      posRoom = firstPos;
      posDate = secondPos;
    }
  }

  const rawInput: Partial<RoomInfoRawInput> = {
    date: (typeof rawArgs.date === 'string' ? rawArgs.date : posDate) || undefined,
    roomCode: (typeof rawArgs.room === 'string' ? rawArgs.room : posRoom) || undefined,
  };

  const actionOptions: InfoActionOptions = {
    isQuiet,
    isJsonOutput,
  };

  return infoAction(rawInput, actionOptions);
}

export * from './action.ts';
export * from './ui.ts';
