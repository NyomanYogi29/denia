import type { ErrorCodeType } from '@/core/errors';

export interface CliErrorOptions {
  readonly message: string;
  readonly code?: ErrorCodeType;
  readonly exitCode?: number;
  readonly hint?: string;
  readonly cause?: unknown;
}

export interface FormattedCliError {
  readonly header: string;
  readonly message: string;
  readonly hint?: string;
  readonly exitCode: number;
  readonly renderedText: string;
}
