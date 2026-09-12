import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { mkdir, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Database } from 'bun:sqlite';
import { backupDatabase } from '@/core/db/backup.ts';
import { clearAuthCredentials } from '@/bot/client.ts';
import { DatabaseError } from '@/core/errors';

describe('Data Persistence & Auth Lifecycle Management (Evaluasi E.1)', () => {
  const testBackupDir = resolve('./tests/temp-backups');
  const testAuthDir = resolve('./tests/temp-auth');
  let testDb: Database;
  let testDbFile: string;

  beforeEach(async () => {
    await rm(testBackupDir, { recursive: true, force: true });
    await rm(testAuthDir, { recursive: true, force: true });
    await mkdir(testBackupDir, { recursive: true });
    await mkdir(testAuthDir, { recursive: true });

    testDbFile = resolve(testBackupDir, 'source-test.db');
    testDb = new Database(testDbFile);
    testDb.run('CREATE TABLE test_items (id INTEGER PRIMARY KEY, name TEXT);');
    testDb.run("INSERT INTO test_items (name) VALUES ('Korti 1'), ('Booking 1');");
  });

  afterEach(async () => {
    try {
      testDb.close();
    } catch {}
    await rm(testBackupDir, { recursive: true, force: true });
    await rm(testAuthDir, { recursive: true, force: true });
  });

  describe('SQLite Database Auto-Backup (backupDatabase)', () => {
    it('should create an atomic SQLite snapshot backup successfully via VACUUM INTO', async () => {
      const result = await backupDatabase({
        backupDir: testBackupDir,
        sqliteClient: testDb,
        maxRetention: 5,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fileName).toStartWith('bot-backup-');
        expect(result.data.fileName).toEndWith('.db');
        expect(result.data.sizeBytes).toBeGreaterThan(0);

        // Verifikasi integritas data backup dengan membuka database hasil snapshot
        const backupSqlite = new Database(result.data.filePath);
        const rows = backupSqlite.query('SELECT count(*) as count FROM test_items').get() as { count: number };
        expect(rows.count).toBe(2);
        backupSqlite.close();
      }
    });

    it('should automatically rotate and retain only N latest backups (retention policy)', async () => {
      const maxRetention = 3;

      // Buat 5 backup secara berurutan dengan jeda waktu singkat
      for (let i = 1; i <= 5; i++) {
        const res = await backupDatabase({
          backupDir: testBackupDir,
          sqliteClient: testDb,
          maxRetention,
        });
        expect(res.success).toBe(true);
        // Delay 10ms agar timestamp unik
        await new Promise((r) => setTimeout(r, 20));
      }

      const files = await readdir(testBackupDir);
      const backupDbFiles = files.filter((f) => f.startsWith('bot-backup-') && f.endsWith('.db'));

      // Harus tepat tersisa sejumlah maxRetention (3 file)
      expect(backupDbFiles.length).toBe(maxRetention);
    });

    it('should return Result.err(DatabaseError) without throwing fatal exception if backup fails', async () => {
      // Mock client yang melempar error
      const brokenClient = {
        run: () => {
          throw new Error('Disk I/O error or permission denied');
        },
      } as unknown as Database;

      const result = await backupDatabase({
        backupDir: testBackupDir,
        sqliteClient: brokenClient,
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeInstanceOf(DatabaseError);
        expect(result.error.message).toContain('Disk I/O error');
      }
    });
  });

  describe('Isolated Auth Cleanup (clearAuthCredentials)', () => {
    it('should clean all files in auth directory without touching database files', async () => {
      // Buat file simulasi sesi auth
      await writeFile(join(testAuthDir, 'creds.json'), '{"registered": true}');
      await writeFile(join(testAuthDir, 'pre-key-1.json'), '{"key": "test"}');

      let beforeFiles = await readdir(testAuthDir);
      expect(beforeFiles.length).toBe(2);

      await clearAuthCredentials(testAuthDir);

      let afterFiles = await readdir(testAuthDir);
      expect(afterFiles.length).toBe(0);
    });

    it('should prevent accidental deletion of critical system directories via security guard', async () => {
      await expect(clearAuthCredentials('.')).rejects.toThrow('terproteksi');
      await expect(clearAuthCredentials('./data')).rejects.toThrow('terproteksi');
      await expect(clearAuthCredentials('./src')).rejects.toThrow('terproteksi');
    });
  });
});
