import type { ParseArgsOptionsConfig } from 'util';

/**
 * Flag global yang dapat diterima oleh seluruh perintah CLI Denia
 */
export interface CliGlobalFlags {
  readonly verbose: boolean;
  readonly quiet: boolean;
  readonly json: boolean;
  readonly noColor: boolean;
  readonly configPath: string | null;
}

/**
 * Konfigurasi persisten dari file RC (.deniarc / .deniarc.json)
 */
export interface CliRcConfig {
  readonly defaultRole?: 'korti' | 'staff' | 'admin';
  readonly defaultKelas?: string;
  readonly dbPath?: string;
  readonly interactive?: boolean;
}

/**
 * Konfigurasi runtime gabungan (flags CLI + file RC + default)
 */
export interface CliRuntimeConfig {
  readonly flags: CliGlobalFlags;
  readonly rc: CliRcConfig;
  readonly isVerbose: boolean;
  readonly isQuiet: boolean;
  readonly isJsonOutput: boolean;
}

/**
 * Definisi spesifikasi opsi flag global untuk util.parseArgs
 */
export type GlobalFlagOptionMap = ParseArgsOptionsConfig;
