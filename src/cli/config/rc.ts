import { CliError } from '@/cli/errors';
import { ErrorCode } from '@/core/errors';
import { err, ok, type Result } from '@/core/types';
import type { CliRcConfig } from './types.ts';

const DEFAULT_RC_CANDIDATES = ['.deniarc', '.deniarc.json'] as const;

/**
 * Membaca dan mem-parse berkas RC konfigurasi CLI (.deniarc / .deniarc.json)
 */
export async function loadRcConfig(customPath?: string | null): Promise<Result<CliRcConfig, CliError>> {
  const pathsToCheck: string[] = customPath ? [customPath] : [...DEFAULT_RC_CANDIDATES];

  for (const filePath of pathsToCheck) {
    const file = Bun.file(filePath);
    const exists = await file.exists();

    if (exists) {
      try {
        const content = await file.json();
        if (typeof content !== 'object' || content === null || Array.isArray(content)) {
          return err(
            new CliError({
              code: ErrorCode.INVALID_COMMAND_SYNTAX,
              message: `Format berkas konfigurasi "${filePath}" tidak valid. Harus berupa JSON object.`,
              hint: 'Pastikan berkas RC berisi object JSON yang valid (contoh: { "defaultRole": "korti" }).',
            })
          );
        }

        const rcConfig: CliRcConfig = Object.freeze({
          defaultRole: content.defaultRole,
          defaultKelas: content.defaultKelas,
          dbPath: content.dbPath,
          interactive: typeof content.interactive === 'boolean' ? content.interactive : undefined,
        });

        return ok(rcConfig);
      } catch (error) {
        return err(
          new CliError({
            code: ErrorCode.INVALID_COMMAND_SYNTAX,
            message: `Gagal membaca berkas konfigurasi "${filePath}": ${
              error instanceof Error ? error.message : String(error)
            }`,
            hint: 'Periksa kembali sintaks JSON di dalam berkas konfigurasi Anda.',
            cause: error,
          })
        );
      }
    }
  }

  // Jika custom path ditentukan tetapi tidak ditemukan, kembalikan error
  if (customPath) {
    return err(
      new CliError({
        code: ErrorCode.INVALID_COMMAND_SYNTAX,
        message: `Berkas konfigurasi yang ditentukan tidak ditemukan: "${customPath}"`,
        hint: 'Pastikan path berkas konfigurasi yang dimasukkan benar dan dapat diakses.',
      })
    );
  }

  // Fallback default: konfigurasi RC kosong
  return ok(Object.freeze({}));
}
