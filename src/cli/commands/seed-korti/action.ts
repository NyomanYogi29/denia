import { CliError } from '@/cli/errors/index.ts';
import {
  seedKortiUseCase,
  type SeedKortiSummary,
} from '@/core/features/seeder/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import { renderSeedHeader, renderSeedSummary } from './ui.ts';

export interface SeedKortiActionOptions {
  readonly filePath?: string;
  readonly dryRun?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Consumer CLI untuk perintah `seed korti`
 */
export async function seedKortiAction(
  options: SeedKortiActionOptions = {}
): Promise<Result<SeedKortiSummary, CliError>> {
  if (!options.isQuiet && !options.isJsonOutput) {
    renderSeedHeader();
  }

  const result = await seedKortiUseCase({
    filePath: options.filePath,
    dryRun: options.dryRun,
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

  const summary = result.data;

  if (options.isJsonOutput) {
    console.log(JSON.stringify(summary, null, 2));
  } else if (!options.isQuiet) {
    renderSeedSummary(summary);
  }

  return ok(summary);
}
