import type { CliRuntimeConfig } from '@/cli/config/types.ts';
import { CliError } from '@/cli/errors/index.ts';
import { ErrorCode } from '@/core/errors/codes.ts';
import { err, type Result } from '@/core/types/index.ts';
import {
  sheetsTestAction,
  sheetsInitAction,
  sheetsSyncAction,
  sheetsSyncWeekAction,
} from './action.ts';

export const SHEETS_COMMAND = 'sheets';
export const SHEETS_OPTIONS = {};

export async function executeSheets(
  values: Record<string, unknown>,
  runtimeConfig: CliRuntimeConfig,
  positionals: readonly string[]
): Promise<Result<unknown, CliError>> {
  const [, subCommand, arg] = positionals;

  const actionOptions = {
    isQuiet: runtimeConfig.isQuiet,
    isJsonOutput: runtimeConfig.isJsonOutput,
  };

  switch (subCommand?.toLowerCase()) {
    case 'test':
      return sheetsTestAction(actionOptions);
    case 'init':
      return sheetsInitAction(actionOptions);
    case 'sync':
      return sheetsSyncAction(actionOptions, arg);
    case 'sync-week':
    case 'syncweek':
      return sheetsSyncWeekAction(actionOptions, arg);
    default:
      return err(
        new CliError({
          code: ErrorCode.INVALID_COMMAND_SYNTAX,
          message: `Subcommand "${subCommand || ''}" untuk "denia sheets" tidak dikenali.`,
          hint: 'Gunakan: denia sheets test | denia sheets init | denia sheets sync [tanggal] | denia sheets sync-week',
        })
      );
  }
}

export * from './action.ts';
export * from './ui.ts';
