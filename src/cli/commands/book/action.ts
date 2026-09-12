import { CliArgumentError, CliError } from '@/cli/errors/index.ts';
import {
  createBookingUseCase,
  type BookedRoomDetails,
} from '@/core/features/booking/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import type { CreateBookingRawInput } from '@/core/validators/index.ts';
import { promptBookInteractive, renderHeader, renderSuccess } from './ui.ts';

export interface BookActionOptions {
  readonly isInteractive?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Consumer CLI untuk alur peminjaman ruangan perkuliahan (Fase 5.1)
 */
export async function bookAction(
  rawInput: Partial<CreateBookingRawInput> = {},
  options: BookActionOptions = {}
): Promise<Result<BookedRoomDetails, CliError>> {
  let inputData: Partial<CreateBookingRawInput> = { ...rawInput };

  const hasMissingRequired =
    !inputData.roomCode || !inputData.date || !inputData.slotCode || !inputData.userJid;

  // Jika opsi interaktif aktif atau input belum lengkap pada terminal interaktif (TTY)
  if (options.isInteractive || (hasMissingRequired && process.stdin.isTTY && !options.isQuiet)) {
    if (!options.isQuiet && !options.isJsonOutput) {
      renderHeader();
    }
    inputData = await promptBookInteractive(inputData);
  }

  // Delegasikan ke core feature use case
  const result = await createBookingUseCase(inputData);
  if (!result.success) {
    const error = result.error;
    const hint = typeof error.metadata?.hint === 'string' ? error.metadata.hint : undefined;

    if (error.code === 'INVALID_COMMAND_SYNTAX') {
      return err(
        new CliArgumentError(
          error.userMessage,
          hint ?? 'Gunakan: denia book <room> <date> <slot> --jid <phone/jid>'
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

  const booked = result.data;

  // Render output terminal
  if (options.isJsonOutput) {
    console.log(JSON.stringify(booked, null, 2));
  } else if (!options.isQuiet) {
    renderSuccess(booked);
  }

  return ok(booked);
}
