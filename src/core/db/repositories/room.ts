import { eq } from 'drizzle-orm';
import { db } from '@/core/db/index.ts';
import { rooms, type Room } from '@/core/db/schema.ts';
import { DatabaseError, type AppError } from '@/core/errors';
import { err, ok, type Result } from '@/core/types';

export interface RoomListFilter {
  readonly isActive?: boolean;
  readonly building?: string;
  readonly floor?: number;
}

/**
 * Mencari data ruangan berdasarkan kode unik ruangan (case-insensitive)
 */
export async function findRoomByCode(code: string): Promise<Result<Room | null, AppError>> {
  try {
    const normalizedCode = code.trim().toUpperCase();
    const room = await db
      .select()
      .from(rooms)
      .where(eq(rooms.code, normalizedCode))
      .get();

    return ok(room ?? null);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(
      new DatabaseError(
        `Gagal mencari data ruangan dengan kode "${code}": ${message}`,
        { code },
        error
      )
    );
  }
}

/**
 * Mengambil daftar seluruh ruangan dengan filter opsional
 */
export async function listRooms(filter: RoomListFilter = {}): Promise<Result<Room[], AppError>> {
  try {
    let query = db.select().from(rooms);

    if (filter.isActive !== undefined) {
      query = query.where(eq(rooms.isActive, filter.isActive)) as any;
    }
    if (filter.building !== undefined) {
      query = query.where(eq(rooms.building, filter.building)) as any;
    }
    if (filter.floor !== undefined) {
      query = query.where(eq(rooms.floor, filter.floor)) as any;
    }

    const result = await query.all();
    return ok(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err(
      new DatabaseError(
        `Gagal mengambil daftar ruangan dari basis data: ${message}`,
        { filter },
        error
      )
    );
  }
}
