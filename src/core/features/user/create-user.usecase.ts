import { createUser, type User } from '@/core/db/index.ts';
import { ErrorCode, ValidationError, type AppError } from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import { createUserInputSchema } from '@/core/validators/index.ts';
import type { CreateUserUseCaseInput } from './types.ts';

const log = logger.child({ module: 'CREATE_USER_USECASE' });

/**
 * Use case murni untuk pendaftaran pengguna baru (V2).
 * Memvalidasi skema input Zod, menormalisasi data, dan menyimpan ke tabel users.
 */
export async function createUserUseCase(
  input: CreateUserUseCaseInput
): Promise<Result<User, AppError>> {
  const parsed = createUserInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi data pengguna gagal.';
    log.warn('Gagal memvalidasi data pengguna baru', { input, issues: parsed.error.issues });
    return err(
      new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, errorMessage, {
        issues: parsed.error.issues,
        hint: 'Periksa kembali kelengkapan field (jid/nomor telepon, nama, kelas, fakultas, prodi, semester, role).',
      })
    );
  }

  const validated = parsed.data;
  const dbResult = await createUser(validated);
  if (!dbResult.success) {
    return dbResult;
  }

  log.info(`Berhasil mendaftarkan pengguna baru: ${dbResult.data.nama} (${dbResult.data.jid})`);
  return ok(dbResult.data);
}
