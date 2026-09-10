import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config/index.ts';
import type { CliError } from '@/cli/errors/index.ts';
import type { SeedKortiSummary } from '@/core/features/seeder/index.ts';
import type { Result } from '@/core/types/index.ts';
import { seedKortiAction, type SeedKortiActionOptions } from './action.ts';

/**
 * Spesifikasi opsi/flag khusus untuk perintah `seed korti`
 */
export const SEED_KORTI_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
  file: {
    type: 'string',
    short: 'f',
  },
  'dry-run': {
    type: 'boolean',
    short: 'd',
    default: false,
  },
});

/**
 * Metadata dan deskripsi perintah
 */
export const SEED_KORTI_COMMAND = Object.freeze({
  name: 'seed korti',
  alias: 'seed:korti',
  description: 'Mengimpor dan menyinkronkan data Korti dari master spreadsheet Excel ke database SQLite.',
  options: SEED_KORTI_OPTIONS,
});

/**
 * Handler eksekusi utama perintah `seed korti` dari CLI runner
 */
export async function executeSeedKorti(
  rawArgs: Record<string, unknown> = {},
  runtimeConfig?: CliRuntimeConfig
): Promise<Result<SeedKortiSummary, CliError>> {
  const isQuiet = Boolean(runtimeConfig?.isQuiet);
  const isJsonOutput = Boolean(runtimeConfig?.isJsonOutput);
  const filePath = typeof rawArgs.file === 'string' ? rawArgs.file : undefined;
  const dryRun = Boolean(rawArgs['dry-run'] || rawArgs.d);

  const actionOptions: SeedKortiActionOptions = {
    filePath,
    dryRun,
    isQuiet,
    isJsonOutput,
  };

  return seedKortiAction(actionOptions);
}

export * from './action.ts';
export * from './ui.ts';
