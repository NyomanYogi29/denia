import type { ParseArgsOptionsConfig } from 'util';
import type { CliRuntimeConfig } from '@/cli/config/index.ts';
import type { CliError } from '@/cli/errors/index.ts';
import type { Result } from '@/core/types/index.ts';
import { abortAction, type AbortActionOptions, type AbortActionResult } from './action.ts';

export const ABORT_OPTIONS: ParseArgsOptionsConfig = Object.freeze({
  id: {
    type: 'string',
    short: 'i',
  },
  target: {
    type: 'string',
    short: 't',
  },
  jid: {
    type: 'string',
    short: 'j',
  },
  interactive: {
    type: 'boolean',
    default: false,
  },
});

export const ABORT_COMMAND = Object.freeze({
  name: 'abort',
  description:
    'Membatalkan pengambilalihan paksa (!force) atau agenda blokir (!forceevent) oleh Staf/Admin (Fase 5.6).',
  options: ABORT_OPTIONS,
});

/**
 * Handler eksekusi utama perintah `abort` dari CLI runner
 * Mendukung:
 * - denia abort force [id] --jid <phone>
 * - denia abort event [id] --jid <phone>
 * - denia abort [id] --jid <phone>
 */
export async function executeAbort(
  rawArgs: Record<string, unknown> = {},
  runtimeConfig?: CliRuntimeConfig,
  positionals: string[] = []
): Promise<Result<AbortActionResult, CliError>> {
  const isInteractive = Boolean(rawArgs.interactive || runtimeConfig?.rc?.interactive);
  const isQuiet = Boolean(runtimeConfig?.isQuiet);
  const isJsonOutput = Boolean(runtimeConfig?.isJsonOutput);

  // Parse argumen posisi: denia abort [subcommand: force | event] [id]
  const commandOffset = positionals[0] === 'abort' ? 1 : 0;
  let targetArg = positionals[commandOffset]?.toLowerCase();
  let idArg = positionals[commandOffset + 1];

  // Jika positional pertama langsung angka (misal: denia abort 15), default ke 'force'
  if (targetArg && /^\d+$/.test(targetArg)) {
    idArg = targetArg;
    targetArg = 'force';
  }

  let resolvedTarget: 'force' | 'forceevent' | undefined;
  if (targetArg === 'force') {
    resolvedTarget = 'force';
  } else if (targetArg === 'event' || targetArg === 'forceevent') {
    resolvedTarget = 'forceevent';
  } else if (typeof rawArgs.target === 'string') {
    resolvedTarget = rawArgs.target === 'force' ? 'force' : 'forceevent';
  }

  const resolvedId =
    (typeof rawArgs.id === 'string' ? rawArgs.id : idArg) || undefined;

  const actionOptions: AbortActionOptions = {
    target: resolvedTarget,
    id: resolvedId,
    userJid: typeof rawArgs.jid === 'string' ? rawArgs.jid : undefined,
    isInteractive,
    isQuiet,
    isJsonOutput,
  };

  return abortAction(actionOptions);
}

export * from './action.ts';
export * from './ui.ts';
