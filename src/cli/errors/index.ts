export {
  CliError,
  CliArgumentError,
  CliCommandNotFoundError,
} from './cli-error.ts';
export { formatCliError, handleCliError } from './handler.ts';
export type { CliErrorOptions, FormattedCliError } from './types.ts';
