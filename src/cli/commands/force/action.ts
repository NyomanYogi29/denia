import { CliArgumentError, CliError } from '@/cli/errors/index.ts';
import {
  forceBookingUseCase,
  type ForceBookingDetails,
} from '@/core/features/force/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import type { ForceBookingRawInput } from '@/core/validators/index.ts';
import { promptForceInteractive, renderHeader, renderSuccess } from './ui.ts';

export interface ForceActionOptions {
  readonly isInteractive?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Consumer CLI untuk alur pengambilalihan paksa ruangan (Fase 5.4)
 */
export async function forceAction(
  rawInput: Partial<ForceBookingRawInput> = {},
  options: ForceActionOptions = {}
): Promise<Result<ForceBookingDetails, CliError>> {
  let inputData: Partial<ForceBookingRawInput> = { ...rawInput };

  const hasMissingRequired =
    !inputData.roomCode ||
    !inputData.date ||
    !inputData.slotCode ||
    !inputData.userJid ||
    !inputData.reason;

  // Jika opsi interaktif aktif atau input belum lengkap pada terminal interaktif (TTY)
  if (options.isInteractive || (hasMissingRequired && process.stdin.isTTY && !options.isQuiet)) {
    if (!options.isQuiet && !options.isJsonOutput) {
      renderHeader();
    }
    inputData = await promptForceInteractive(inputData);
  }

  // Delegasikan ke core feature use case
  const result = await forceBookingUseCase(inputData);
  if (!result.success) {
    const error = result.error;
    const hint = typeof error.metadata?.hint === 'string' ? error.metadata.hint : undefined;

    if (error.code === 'INVALID_COMMAND_SYNTAX') {
      return err(
        new CliArgumentError(
          error.userMessage,
          hint ?? 'Gunakan: denia force <room> <date> <slot> <reason...> --jid <phone/jid>'
        )
      );
    }

    return err(
      new CliError({
        code: error.code,
        message: error.userMessage,
        hint,
        cause: error,
      })
    );
  }

  const forced = result.data;

  // Render output terminal
  if (options.isJsonOutput) {
    console.log(JSON.stringify(forced, null, 2));
  } else if (!options.isQuiet) {
    renderSuccess(forced);
  }

  return ok(forced);
}
