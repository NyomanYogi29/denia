import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config';
import type { CliError } from '@/cli/errors';
import type { User } from '@/core/db';
import type { Result } from '@/core/types';
import { userAddAction, type UserAddActionOptions } from './action.ts';
import type { UserAddRawInput } from './schema.ts';

/**
 * Spesifikasi opsi/flag khusus untuk perintah `user add`
 */
export const USER_ADD_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
  jid: {
    type: 'string',
  },
  nama: {
    type: 'string',
  },
  nim: {
    type: 'string',
  },
  kelas: {
    type: 'string',
  },
  role: {
    type: 'string',
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
export const USER_ADD_COMMAND = Object.freeze({
  name: 'user add',
  alias: 'user:add',
  description: 'Mendaftarkan pengguna baru (korti, staff, admin) ke whitelist database.',
  options: USER_ADD_OPTIONS,
});

/**
 * Handler eksekusi utama perintah `user add` dari CLI runner
 */
export async function executeUserAdd(
  rawArgs: Record<string, unknown> = {},
  runtimeConfig?: CliRuntimeConfig
): Promise<Result<User, CliError>> {
  const isInteractive = Boolean(rawArgs.interactive || runtimeConfig?.rc?.interactive);
  const isQuiet = Boolean(runtimeConfig?.isQuiet);
  const isJsonOutput = Boolean(runtimeConfig?.isJsonOutput);

  const rawInput: Partial<UserAddRawInput> = {
    jid: typeof rawArgs.jid === 'string' ? rawArgs.jid : undefined,
    nama: typeof rawArgs.nama === 'string' ? rawArgs.nama : undefined,
    nim: typeof rawArgs.nim === 'string' ? rawArgs.nim : undefined,
    kelas: typeof rawArgs.kelas === 'string' ? rawArgs.kelas : runtimeConfig?.rc?.defaultKelas,
    role: (typeof rawArgs.role === 'string' ? rawArgs.role : runtimeConfig?.rc?.defaultRole) as any,
  };

  const actionOptions: UserAddActionOptions = {
    isInteractive,
    isQuiet,
    isJsonOutput,
  };

  return userAddAction(rawInput, actionOptions);
}

export * from './action.ts';
export * from './repository.ts';
export * from './schema.ts';
export * from './ui.ts';
