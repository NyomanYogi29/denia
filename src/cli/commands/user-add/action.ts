import { CliArgumentError, CliError } from '@/cli/errors';
import { createUser, type User } from '@/core/db';
import { err, ok, type Result } from '@/core/types';
import { createUserInputSchema, type CreateUserRawInput } from '@/core/validators';
import { promptUserAddInteractive, renderHeader, renderSuccess } from './ui.ts';

export interface UserAddActionOptions {
  readonly isInteractive?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Controller / orchestrator CLI untuk alur pendaftaran pengguna baru (V2)
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

  // Validasi input menggunakan Core Zod Validator
  const parsed = createUserInputSchema.safeParse(inputData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi input gagal.';
    return err(
      new CliArgumentError(
        errorMessage,
        'Periksa kembali argumen/flag yang Anda berikan (--jid, --nama, --kelas, --fakultas, --prodi, --semester, --role).'
      )
    );
  }

  const validated = parsed.data;

  // Eksekusi penyimpanan ke database via Core Repository
  const dbResult = await createUser(validated);
  if (!dbResult.success) {
    const error = dbResult.error;
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

  const inserted = dbResult.data;

  // Render output terminal
  if (options.isJsonOutput) {
    console.log(JSON.stringify(inserted, null, 2));
  } else if (!options.isQuiet) {
    renderSuccess(inserted);
  }

  return ok(inserted);
}
