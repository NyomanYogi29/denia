import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Database } from 'bun:sqlite';
import { sqlite as defaultSqlite } from '@/core/db/index.ts';
import { DatabaseError, type AppError } from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';

const log = logger.child({ module: 'DATABASE_BACKUP' });

export interface BackupOptions {
  readonly backupDir?: string;
  readonly maxRetention?: number;
  readonly sqliteClient?: Database;
}

export interface BackupResult {
  readonly filePath: string;
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly timestamp: string;
  readonly rotatedFilesCount: number;
}

/**
 * Format Date ke string ISO yang aman untuk nama file (mengganti : dengan -)
 */
function formatTimestampForFilename(date: Date): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Melakukan snapshot backup database SQLite menggunakan perintah native SQLite 'VACUUM INTO'.
 * Aman dari korupsi data WAL, tidak mengganggu transaksi yang sedang berjalan,
 * dan menerapkan rotasi otomatis (retensi N file backup terbaru).
 */
export async function backupDatabase(
  options: BackupOptions = {}
): Promise<Result<BackupResult, AppError>> {
  const backupDir = resolve(options.backupDir ?? './data/backups');
  const maxRetention = options.maxRetention ?? 5;
  const client = options.sqliteClient ?? defaultSqlite;

  try {
    // 1. Pastikan folder penyimpanan backup tersedia
    await mkdir(backupDir, { recursive: true });

    // 2. Tentukan nama file snapshot dengan timestamp unik
    const now = new Date();
    const timestampStr = formatTimestampForFilename(now);
    const fileName = `bot-backup-${timestampStr}.db`;
    const targetFilePath = resolve(backupDir, fileName);

    // Format target path dengan forward slash untuk kompatibilitas SQL SQLite pada Windows
    const sqlSafePath = targetFilePath.replace(/\\/g, '/');

    // 3. Jalankan perintah VACUUM INTO secara atomic
    client.run(`VACUUM INTO '${sqlSafePath}'`);

    // 4. Periksa file backup yang baru terbuat
    const fileStat = await stat(targetFilePath);
    const sizeBytes = fileStat.size;

    // 5. Rotasi retensi: hapus snapshot lama jika melebihi batas maxRetention
    let rotatedCount = 0;
    try {
      const entries = await readdir(backupDir, { withFileTypes: true });
      const backupFiles = entries
        .filter((entry) => entry.isFile() && entry.name.startsWith('bot-backup-') && entry.name.endsWith('.db'))
        .map((entry) => ({
          name: entry.name,
          fullPath: resolve(backupDir, entry.name),
        }));

      // Dapatkan metadata waktu mtime untuk mengurutkan file
      const filesWithTime = await Promise.all(
        backupFiles.map(async (file) => {
          const s = await stat(file.fullPath);
          return { ...file, mtimeMs: s.mtimeMs };
        })
      );

      // Urutkan dari yang terbaru ke terlama
      filesWithTime.sort((a, b) => b.mtimeMs - a.mtimeMs);

      // Hapus file yang melebihi batas retensi
      if (filesWithTime.length > maxRetention) {
        const filesToDelete = filesWithTime.slice(maxRetention);
        for (const file of filesToDelete) {
          await unlink(file.fullPath);
          rotatedCount++;
          log.debug(`File backup lama dihapus oleh rotasi retensi: ${file.name}`);
        }
      }
    } catch (rotateErr) {
      log.warn('Peringatan saat membersihkan rotasi file backup lama', { error: String(rotateErr) });
    }

    log.success('Snapshot backup database SQLite berhasil dibuat.', {
      fileName,
      sizeBytes,
      backupDir,
      rotatedCount,
      retainedCount: Math.min(maxRetention, 1 + rotatedCount),
    });

    return ok({
      filePath: targetFilePath,
      fileName,
      sizeBytes,
      timestamp: now.toISOString(),
      rotatedFilesCount: rotatedCount,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log.error('Gagal membuat snapshot backup database SQLite', { error: errorMsg });
    return err(
      new DatabaseError(`Gagal membuat snapshot backup database SQLite: ${errorMsg}`, {
        backupDir,
      })
    );
  }
}
