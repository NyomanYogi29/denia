import { CliArgumentError, type CliError } from '@/cli/errors';
import type { User } from '@/core/db';
import { err, ok, type Result } from '@/core/types';
import { insertUser } from './repository.ts';
import { userAddInputSchema, type UserAddRawInput } from './schema.ts';
import { promptUserAddInteractive, renderHeader, renderSuccess } from './ui.ts';

export interface UserAddActionOptions {
  readonly isInteractive?: boolean;
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

/**
 * Controller / orchestrator CLI untuk alur pendaftaran pengguna baru
 */
export async function userAddAction(
  rawInput: Partial<UserAddRawInput> = {},
  options: UserAddActionOptions = {}
): Promise<Result<User, CliError>> {
  let inputData: Partial<UserAddRawInput> = { ...rawInput };

  const hasMissingRequired =
    !inputData.jid || !inputData.nama || !inputData.nim || !inputData.kelas;

  // Jika opsi interaktif aktif atau input belum lengkap pada terminal interaktif (TTY)
  if (options.isInteractive || (hasMissingRequired && process.stdin.isTTY && !options.isQuiet)) {
    if (!options.isQuiet && !options.isJsonOutput) {
      renderHeader();
    }
    inputData = await promptUserAddInteractive(inputData);
  }

  // Validasi input menggunakan Zod
  const parsed = userAddInputSchema.safeParse(inputData);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi input gagal.';
    return err(
      new CliArgumentError(
        errorMessage,
        'Periksa kembali argumen/flag yang Anda berikan (--jid, --nama, --nim, --kelas, --role).'
      )
    );
  }

  const validated = parsed.data;

  // Eksekusi penyimpanan ke database via repository
  const dbResult = await insertUser(validated);
  if (!dbResult.success) {
    return err(dbResult.error);
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
