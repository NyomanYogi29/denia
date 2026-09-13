import { CliArgumentError, CliError } from '@/cli/errors/index.ts';
import {
  abortForceBookingUseCase,
  abortForceEventUseCase,
  type AbortForceBookingDetails,
  type AbortForceEventDetails,
} from '@/core/features/abort/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import {
  promptAbortInteractive,
  renderAbortForceEventSuccess,
  renderAbortForceSuccess,
  renderHeader,
} from './ui.ts';

export interface AbortActionOptions {
  readonly target?: 'force' | 'forceevent';
  readonly id?: string | number;
  readonly userJid?: string;
  readonly isInteractive?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

export type AbortActionResult =
  | { type: 'force'; data: AbortForceBookingDetails }
  | { type: 'forceevent'; data: AbortForceEventDetails };

/**
 * Consumer CLI untuk alur pembatalan force booking / force event (Fase 5.6)
 */
export async function abortAction(
  options: AbortActionOptions = {}
): Promise<Result<AbortActionResult, CliError>> {
  let target = options.target;
  let id = options.id;
  let userJid = options.userJid;

  const hasMissingRequired = !target || !id || !userJid;

  if (options.isInteractive || (hasMissingRequired && process.stdin.isTTY && !options.isQuiet)) {
    if (!options.isQuiet && !options.isJsonOutput) {
      renderHeader();
    }
    const prompted = await promptAbortInteractive({ target, id, userJid });
    target = prompted.target;
    id = prompted.id;
    userJid = prompted.userJid;
  }

  if (!target || !id || !userJid) {
    return err(
      new CliArgumentError(
        'Parameter target, ID, dan nomor WhatsApp staf/admin (--jid) wajib diisi.',
        'Gunakan: denia abort force <id> --jid <phone/jid> atau denia abort event <id> --jid <phone/jid>'
      )
    );
  }

  if (target === 'force') {
    const result = await abortForceBookingUseCase({
      id,
      userJid,
    });

    if (!result.success) {
      const error = result.error;
      const hint = typeof error.metadata?.hint === 'string' ? error.metadata.hint : undefined;
      return err(
        new CliError({
          code: error.code,
          message: error.userMessage,
          hint,
          cause: error,
        })
      );
    }

    const details = result.data;
    if (!options.isQuiet) {
      if (options.isJsonOutput) {
        console.log(JSON.stringify({ success: true, target: 'force', data: details }, null, 2));
      } else {
        renderAbortForceSuccess(details);
      }
    }

    return ok({ type: 'force', data: details });
  }

  // target === 'forceevent'
  const result = await abortForceEventUseCase({
    eventId: id,
    userJid,
  });

  if (!result.success) {
    const error = result.error;
    const hint = typeof error.metadata?.hint === 'string' ? error.metadata.hint : undefined;
    return err(
      new CliError({
        code: error.code,
        message: error.userMessage,
        hint,
        cause: error,
      })
    );
  }

  const details = result.data;
  if (!options.isQuiet) {
    if (options.isJsonOutput) {
      console.log(JSON.stringify({ success: true, target: 'forceevent', data: details }, null, 2));
    } else {
      renderAbortForceEventSuccess(details);
    }
  }

  return ok({ type: 'forceevent', data: details });
}
