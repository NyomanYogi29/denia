import { CliArgumentError, CliError } from '@/cli/errors/index.ts';
import {
  cancelBookingUseCase,
  type CancelledBookingDetails,
} from '@/core/features/booking/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import type { CancelBookingRawInput } from '@/core/validators/index.ts';
import { promptCancelInteractive, renderHeader, renderSuccess } from './ui.ts';

export interface CancelActionOptions {
  readonly isInteractive?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Consumer CLI untuk alur pembatalan peminjaman ruangan perkuliahan (Fase 5.2)
 */
export async function cancelAction(
  rawInput: Partial<CancelBookingRawInput> = {},
  options: CancelActionOptions = {}
): Promise<Result<CancelledBookingDetails, CliError>> {
  let inputData: Partial<CancelBookingRawInput> = { ...rawInput };

  const hasMissingRequired =
    !inputData.roomCode || !inputData.date || !inputData.slotCode || !inputData.userJid;

  // Jika opsi interaktif aktif atau input belum lengkap pada terminal interaktif (TTY)
  if (options.isInteractive || (hasMissingRequired && process.stdin.isTTY && !options.isQuiet)) {
    if (!options.isQuiet && !options.isJsonOutput) {
      renderHeader();
    }
    inputData = await promptCancelInteractive(inputData);
  }

  // Delegasikan ke core feature use case
  const result = await cancelBookingUseCase(inputData);
  if (!result.success) {
    const error = result.error;
    const hint = typeof error.metadata?.hint === 'string' ? error.metadata.hint : undefined;

    if (error.code === 'INVALID_COMMAND_SYNTAX') {
      return err(
        new CliArgumentError(
          error.userMessage,
          hint ?? 'Gunakan: denia cancel <room> <date> <slot> --jid <phone/jid>'
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

  const cancelled = result.data;

  // Render output terminal
  if (options.isJsonOutput) {
    console.log(JSON.stringify(cancelled, null, 2));
  } else if (!options.isQuiet) {
    renderSuccess(cancelled);
  }

  return ok(cancelled);
}
