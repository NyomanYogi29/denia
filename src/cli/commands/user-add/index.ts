import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config';
import type { CliError } from '@/cli/errors';
import type { User } from '@/core/db';
import type { Result } from '@/core/types';
import type { CreateUserRawInput } from '@/core/validators';
import { userAddAction, type UserAddActionOptions } from './action.ts';

/**
 * Spesifikasi opsi/flag khusus untuk perintah `user add` (V2)
 */
export const USER_ADD_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
  jid: {
    type: 'string',
  },
  nama: {
    type: 'string',
  },
  fakultas: {
    type: 'string',
  },
  prodi: {
    type: 'string',
  },
  semester: {
    type: 'string',
  },
  kelas: {
    type: 'string',
  },
  phone: {
    type: 'string',
  },
  'no-telp': {
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
  description: 'Mendaftarkan pengguna baru (korti, staff, admin) ke whitelist database (Spesifikasi V2).',
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

  const rawSemester =
    typeof rawArgs.semester === 'string'
      ? parseInt(rawArgs.semester, 10)
      : typeof rawArgs.semester === 'number'
      ? rawArgs.semester
      : undefined;

  const rawPhone =
    typeof rawArgs['no-telp'] === 'string'
      ? rawArgs['no-telp']
      : typeof rawArgs.phone === 'string'
      ? rawArgs.phone
      : undefined;

  const rawInput: Partial<CreateUserRawInput> = {
    jid: typeof rawArgs.jid === 'string' ? rawArgs.jid : undefined,
    nama: typeof rawArgs.nama === 'string' ? rawArgs.nama : undefined,
    fakultas: typeof rawArgs.fakultas === 'string' ? rawArgs.fakultas : undefined,
    prodi: typeof rawArgs.prodi === 'string' ? rawArgs.prodi : undefined,
    semester: isNaN(rawSemester as number) ? undefined : rawSemester,
    kelas: typeof rawArgs.kelas === 'string' ? rawArgs.kelas : runtimeConfig?.rc?.defaultKelas,
    noTelp: rawPhone,
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
export * from './ui.ts';
