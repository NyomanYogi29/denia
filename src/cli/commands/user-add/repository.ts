import { CliError } from '@/cli/errors';
import { db, users, type User } from '@/core/db';
import { ErrorCode } from '@/core/errors';
import { err, ok, type Result } from '@/core/types';
import type { UserAddInput } from './schema.ts';

/**
 * Menyimpan data pengguna baru ke dalam database SQLite
 */
export async function insertUser(input: UserAddInput): Promise<Result<User, CliError>> {
  try {
    const [inserted] = await db
      .insert(users)
      .values({
        jid: input.jid,
        nama: input.nama,
        nim: input.nim,
        kelas: input.kelas,
        role: input.role,
      })
      .returning();

    if (!inserted) {
      return err(
        new CliError({
          code: ErrorCode.DATABASE_ERROR,
          message: 'Gagal mencatat data pengguna ke dalam database.',
        })
      );
    }

    return ok(inserted);
  } catch (error) {
    const causeMessage =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : String((error as any)?.cause ?? '');
    const errMessage = `${error instanceof Error ? error.message : String(error)} ${causeMessage}`;

    // Tangani SQLite unique constraint collision pada JID atau NIM
    if (
      errMessage.includes('users.jid') ||
      errMessage.includes('SQLITE_CONSTRAINT_PRIMARYKEY') ||
      errMessage.includes('PRIMARY KEY')
    ) {
      return err(
        new CliError({
          code: ErrorCode.DATABASE_ERROR,
          message: `Pengguna dengan nomor/JID "${input.jid}" sudah terdaftar di sistem.`,
          hint: 'Gunakan nomor lain atau perbarui data pengguna tersebut.',
        })
      );
    }

    if (errMessage.includes('users.nim') || errMessage.includes('SQLITE_CONSTRAINT_UNIQUE')) {
      return err(
        new CliError({
          code: ErrorCode.DATABASE_ERROR,
          message: `Pengguna dengan NIM/NIP "${input.nim}" sudah terdaftar di sistem.`,
          hint: 'Pastikan NIM/NIP yang dimasukkan belum pernah terdaftar sebelumnya.',
        })
      );
    }

    return err(
      new CliError({
        code: ErrorCode.DATABASE_ERROR,
        message: `Terjadi kegagalan database: ${errMessage}`,
        cause: error,
      })
    );
  }
}
