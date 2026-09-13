import { CliArgumentError, CliError } from '@/cli/errors/index.ts';
import {
  forceEventUseCase,
  type ForceEventDetails,
} from '@/core/features/force-event/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import type { ForceEventRawInput } from '@/core/validators/index.ts';
import { promptForceEventInteractive, renderHeader, renderSuccess } from './ui.ts';

export interface ForceEventActionOptions {
  readonly isInteractive?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Consumer CLI untuk alur pemblokiran ruangan agenda kampus (Fase 5.5)
 */
export async function forceEventAction(
  rawInput: Partial<ForceEventRawInput> = {},
  options: ForceEventActionOptions = {}
): Promise<Result<ForceEventDetails, CliError>> {
  let inputData: Partial<ForceEventRawInput> = { ...rawInput };

  const hasMissingRequired =
    !inputData.roomCodes ||
    !inputData.dateRange ||
    !inputData.userJid ||
    !inputData.eventName;

  // Jika opsi interaktif aktif atau input belum lengkap pada terminal interaktif (TTY)
  if (options.isInteractive || (hasMissingRequired && process.stdin.isTTY && !options.isQuiet)) {
    if (!options.isQuiet && !options.isJsonOutput) {
      renderHeader();
    }
    inputData = await promptForceEventInteractive(inputData);
  }

  // Delegasikan ke core feature use case
  const result = await forceEventUseCase(inputData);
  if (!result.success) {
    const error = result.error;
    const hint = typeof error.metadata?.hint === 'string' ? error.metadata.hint : undefined;

    if (error.code === 'INVALID_COMMAND_SYNTAX') {
      return err(
        new CliArgumentError(
          error.userMessage,
          hint ?? 'Gunakan: denia forceevent <rooms> <dateRange> <eventName...> --jid <phone/jid>'
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

  const eventDetails = result.data;

  // Render output terminal
  if (options.isJsonOutput) {
    console.log(JSON.stringify(eventDetails, null, 2));
  } else if (!options.isQuiet) {
    renderSuccess(eventDetails);
  }

  return ok(eventDetails);
}
