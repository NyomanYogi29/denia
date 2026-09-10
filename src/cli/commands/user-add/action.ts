import { CliArgumentError, CliError } from '@/cli/errors/index.ts';
import type { User } from '@/core/db/index.ts';
import { createUserUseCase } from '@/core/features/user/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import type { CreateUserRawInput } from '@/core/validators/index.ts';
import { promptUserAddInteractive, renderHeader, renderSuccess } from './ui.ts';

export interface UserAddActionOptions {
  readonly isInteractive?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Consumer CLI untuk alur pendaftaran pengguna baru (V2)
 */
export async function userAddAction(
  rawInput: Partial<CreateUserRawInput> = {},
  options: UserAddActionOptions = {}
): Promise<Result<User, CliError>> {
  let inputData: Partial<CreateUserRawInput> = { ...rawInput };

  const hasMissingRequired =
    !inputData.jid || !inputData.nama || !inputData.kelas;

  // Jika opsi interaktif aktif atau input belum lengkap pada terminal interaktif (TTY)
  if (options.isInteractive || (hasMissingRequired && process.stdin.isTTY && !options.isQuiet)) {
    if (!options.isQuiet && !options.isJsonOutput) {
      renderHeader();
    }
    inputData = await promptUserAddInteractive(inputData);
  }

  // Delegasikan validasi & eksekusi use case ke core feature
  const result = await createUserUseCase(inputData);
  if (!result.success) {
    const error = result.error;
    const hint = typeof error.metadata?.hint === 'string' ? error.metadata.hint : undefined;

    if (error.code === 'INVALID_COMMAND_SYNTAX') {
      return err(
        new CliArgumentError(
          error.userMessage,
          hint ?? 'Periksa kembali argumen/flag yang Anda berikan (--jid, --nama, --kelas, --fakultas, --prodi, --semester, --role).'
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

  const inserted = result.data;

  // Render output terminal
  if (options.isJsonOutput) {
    console.log(JSON.stringify(inserted, null, 2));
  } else if (!options.isQuiet) {
    renderSuccess(inserted);
  }

  return ok(inserted);
}
