import type { CliGlobalFlags, GlobalFlagOptionMap } from './types.ts';

/**
 * Spesifikasi opsi flag global untuk integrasi dengan util.parseArgs
 */
export const GLOBAL_FLAG_OPTIONS = Object.freeze({
  verbose: {
    type: 'boolean',
    short: 'v',
    default: false,
  },
  quiet: {
    type: 'boolean',
    short: 'q',
    default: false,
  },
  json: {
    type: 'boolean',
    default: false,
  },
  'no-color': {
    type: 'boolean',
    default: false,
  },
  config: {
    type: 'string',
    short: 'c',
  },
} as const satisfies GlobalFlagOptionMap);

/**
 * Mengurai dan menormalisasi nilai parsedArgs menjadi objek CliGlobalFlags yang immutable
 */
export function parseGlobalFlags(values: Record<string, unknown>): CliGlobalFlags {
  const verbose = Boolean(values.verbose);
  const quiet = Boolean(values.quiet);
  const json = Boolean(values.json);
  const noColor = Boolean(values['no-color']);
  const configPath = typeof values.config === 'string' && values.config.trim() !== ''
    ? values.config.trim()
    : null;

  return Object.freeze({
    verbose,
    quiet,
    json,
    noColor,
    configPath,
  });
}
