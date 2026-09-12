import { CliArgumentError, CliError } from '@/cli/errors/index.ts';
import {
  getRoomAvailabilityUseCase,
  type GetRoomAvailabilityResult,
} from '@/core/features/info/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import type { RoomInfoRawInput } from '@/core/validators/index.ts';
import { renderHeader, renderMatrixTerminal } from './ui.ts';

export interface InfoActionOptions {
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Consumer CLI untuk alur informasi ketersediaan ruangan perkuliahan (Fase 5.3)
 */
export async function infoAction(
  rawInput: Partial<RoomInfoRawInput> = {},
  options: InfoActionOptions = {}
): Promise<Result<GetRoomAvailabilityResult, CliError>> {
  if (!options.isQuiet && !options.isJsonOutput) {
    renderHeader();
  }

  // Delegasikan ke core feature use case
  const result = await getRoomAvailabilityUseCase(rawInput);
  if (!result.success) {
    const error = result.error;
    const hint = typeof error.metadata?.hint === 'string' ? error.metadata.hint : undefined;

    if (error.code === 'INVALID_COMMAND_SYNTAX') {
      return err(
        new CliArgumentError(
          error.userMessage,
          hint ?? 'Gunakan: denia info [date] [room] atau denia info --date DD/MM/YYYY --room <room_code>'
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

  const availability = result.data;

  // Render output terminal
  if (options.isJsonOutput) {
    console.log(JSON.stringify(availability.matrixData, null, 2));
  } else if (!options.isQuiet) {
    renderMatrixTerminal(availability.matrixData);
  }

  return ok(availability);
}
