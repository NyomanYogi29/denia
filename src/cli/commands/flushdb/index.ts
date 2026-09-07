import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config';
import { CliArgumentError, type CliError } from '@/cli/errors';
import { normalizeFlushTarget, type FlushResult, type FlushTarget } from '@/core/services';
import type { Result } from '@/core/types';
import { flushDbAction, type FlushDbActionOptions } from './action.ts';

/**
 * Spesifikasi opsi/flag khusus untuk perintah `flushdb`
 */
export const FLUSHDB_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
  force: {
    type: 'boolean',
    short: 'f',
    default: false,
  },
  target: {
    type: 'string',
    short: 't',
  },
});

/**
 * Metadata dan deskripsi perintah
 */
export const FLUSHDB_COMMAND = Object.freeze({
  name: 'flushdb',
  description: '⚠️ [DANGER ZONE] Menghapus data tabel tertentu (all, user, rooms, force_events, bookings) secara permanen.',
  options: FLUSHDB_OPTIONS,
});

/**
 * Handler eksekusi utama perintah `flushdb` dari CLI runner
 */
export async function executeFlushDb(
  rawArgs: Record<string, unknown> = {},
  runtimeConfig?: CliRuntimeConfig,
  positionalTarget?: string
): Promise<Result<FlushResult, CliError>> {
  const isQuiet = Boolean(runtimeConfig?.isQuiet);
  const isJsonOutput = Boolean(runtimeConfig?.isJsonOutput);
  const force = Boolean(rawArgs.force || rawArgs.f);

  const rawTarget = positionalTarget || (typeof rawArgs.target === 'string' ? rawArgs.target : undefined);

  if (!rawTarget) {
    return {
      success: false,
      error: new CliArgumentError(
        'Target flushdb wajib dicantumkan.',
        'Gunakan: denia flushdb <all | user | rooms | force_events | bookings> (Contoh: denia flushdb all --force)'
      ),
    };
  }

  const normalized = normalizeFlushTarget(rawTarget);
  if (!normalized) {
    return {
      success: false,
      error: new CliArgumentError(
        `Target flushdb "${rawTarget}" tidak valid.`,
        'Pilihan yang tersedia: all, user, rooms, force_events, bookings.'
      ),
    };
  }

  const actionOptions: FlushDbActionOptions = {
    force,
    isQuiet,
    isJsonOutput,
  };

  return flushDbAction(normalized, actionOptions);
}

export * from './action.ts';
export * from './ui.ts';
