import { CliArgumentError, CliError } from '@/cli/errors';
import { flushDatabase, type FlushResult, type FlushTarget } from '@/core/services';
import { err, ok, type Result } from '@/core/types';
import {
  promptFlushConfirmation,
  renderFlushAborted,
  renderFlushHeader,
  renderFlushSuccess,
} from './ui.ts';

export interface FlushDbActionOptions {
  readonly force?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Controller eksekusi perintah danger zone `flushdb`
 */
export async function flushDbAction(
  target: FlushTarget,
  options: FlushDbActionOptions = {}
): Promise<Result<FlushResult, CliError>> {
  if (!options.isQuiet && !options.isJsonOutput) {
    renderFlushHeader(target);
  }

  // Jika bukan bypass (--force), minta konfirmasi
  if (!options.force) {
    if (process.stdin.isTTY) {
      const confirmed = await promptFlushConfirmation(target);
      if (!confirmed) {
        if (!options.isQuiet && !options.isJsonOutput) {
          renderFlushAborted();
        }
        return ok({
          target,
          deletedCounts: {},
        });
      }
    } else {
      return err(
        new CliArgumentError(
          `Eksekusi perintah danger zone "flushdb ${target}" pada lingkungan non-interaktif memerlukan flag konfirmasi --force.`
        )
      );
    }
  }

  const result = await flushDatabase(target);
  if (!result.success) {
    const error = result.error;
    return err(
      new CliError({
        code: error.code,
        message: error.userMessage,
        cause: error,
      })
    );
  }

  const flushData = result.data;

  if (options.isJsonOutput) {
    console.log(JSON.stringify(flushData, null, 2));
  } else if (!options.isQuiet) {
    renderFlushSuccess(flushData);
  }

  return ok(flushData);
}
