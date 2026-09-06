import type { CliError } from '@/cli/errors';
import { err, ok, type Result } from '@/core/types';
import { parseGlobalFlags } from './flags.ts';
import { loadRcConfig } from './rc.ts';
import type { CliRuntimeConfig } from './types.ts';

/**
 * Membangun konfigurasi runtime CLI yang immutable dari kombinasi flags baris perintah dan berkas RC
 */
export async function createRuntimeConfig(
  rawValues: Record<string, unknown> = {},
  customRcPath?: string | null
): Promise<Result<CliRuntimeConfig, CliError>> {
  const flags = parseGlobalFlags(rawValues);
  const rcPath = flags.configPath ?? customRcPath;

  const rcResult = await loadRcConfig(rcPath);
  if (!rcResult.success) {
    return err(rcResult.error);
  }

  const rc = rcResult.data;

  const runtimeConfig: CliRuntimeConfig = Object.freeze({
    flags,
    rc,
    isVerbose: flags.verbose,
    isQuiet: flags.quiet,
    isJsonOutput: flags.json,
  });

  return ok(runtimeConfig);
}
