import { eq } from 'drizzle-orm';
import { db } from '@/core/db/index.ts';
import { users, type User, type UserRole } from '@/core/db/schema.ts';
import { DatabaseError, type AppError } from '@/core/errors';
import { err, ok, type Result } from '@/core/types';
import type { CreateUserInput } from '@/core/validators';

export interface UserListFilter {
  readonly role?: UserRole;
  readonly kelas?: string;
}

/**
 * Mencari data pengguna terdaftar berdasarkan WhatsApp JID
 */
export async function findUserByJid(jid: string): Promise<Result<User | null, AppError>> {
  try {
    const user = await db.select().from(users).where(eq(users.jid, jid)).get();
    return ok(user ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(
      new DatabaseError(
        `Gagal mencari data pengguna dengan JID "${jid}": ${message}`,
        { jid },
        error
      )
    );
  }
}

/**
 * Mendaftarkan pengguna baru ke dalam database SQLite
 * Mengembalikan DatabaseError jika JID sudah terdaftar sebelumnya (Primary Key Collision).
 */
export async function createUser(input: CreateUserInput): Promise<Result<User, AppError>> {
  try {
    const [inserted] = await db
      .insert(users)
      .values({
        jid: input.jid,
        nama: input.nama,
        fakultas: input.fakultas ?? null,
        prodi: input.prodi ?? null,
        semester: input.semester ?? null,
        kelas: input.kelas,
        noTelp: input.noTelp,
        role: input.role,
      })
      .returning();

    if (!inserted) {
      return err(
        new DatabaseError(
          'Gagal mencatat data pengguna ke dalam database (tidak ada data kembalian).',
          { input }
        )
      );
    }

    return ok(inserted);
  } catch (error) {
    const causeMessage =
      error instanceof Error && error.cause instanceof Error
        ? error.cause.message
        : String((error as any)?.cause ?? '');
    const errMessage = `${error instanceof Error ? error.message : String(error)} ${causeMessage}`;

    // Tangani SQLite unique/primary key constraint collision pada JID
    if (
      errMessage.includes('users.jid') ||
      errMessage.includes('SQLITE_CONSTRAINT_PRIMARYKEY') ||
      errMessage.includes('PRIMARY KEY')
    ) {
      return err(
        new DatabaseError(
          `Pengguna dengan nomor/JID "${input.jid}" sudah terdaftar di sistem.`,
          {
            jid: input.jid,
            hint: 'Gunakan nomor lain atau perbarui data pengguna tersebut.',
          },
          error
        )
      );
    }

    return err(
      new DatabaseError(
        `Terjadi kegagalan database: ${errMessage}`,
        { input },
        error
      )
    );
  }
}

/**
 * Melakukan upsert (insert jika belum ada, update jika sudah ada) data pengguna
 * Ideal untuk Automated Seeder Korti dari spreadsheet.
 */
export async function upsertUser(input: CreateUserInput): Promise<Result<User, AppError>> {
  try {
    const [saved] = await db
      .insert(users)
      .values({
        jid: input.jid,
        nama: input.nama,
        fakultas: input.fakultas ?? null,
        prodi: input.prodi ?? null,
        semester: input.semester ?? null,
        kelas: input.kelas,
        noTelp: input.noTelp,
        role: input.role,
      })
      .onConflictDoUpdate({
        target: users.jid,
        set: {
          nama: input.nama,
          fakultas: input.fakultas ?? null,
          prodi: input.prodi ?? null,
          semester: input.semester ?? null,
          kelas: input.kelas,
          noTelp: input.noTelp,
          role: input.role,
        },
      })
      .returning();

    if (!saved) {
      return err(
        new DatabaseError(
          'Gagal melakukan upsert data pengguna (tidak ada data kembalian).',
          { input }
        )
      );
    }

    return ok(saved);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(
      new DatabaseError(
        `Gagal melakukan upsert data pengguna "${input.jid}": ${message}`,
        { input },
        error
      )
    );
  }
}

/**
 * Mengambil daftar seluruh pengguna dengan filter opsional
 */
export async function listUsers(filter: UserListFilter = {}): Promise<Result<User[], AppError>> {
  try {
    let query = db.select().from(users);

    if (filter.role) {
      query = query.where(eq(users.role, filter.role)) as any;
    }
    if (filter.kelas) {
      query = query.where(eq(users.kelas, filter.kelas)) as any;
    }

    const result = await query.all();
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(
      new DatabaseError(
        `Gagal mengambil daftar pengguna: ${message}`,
        { filter },
        error
      )
    );
  }
}
