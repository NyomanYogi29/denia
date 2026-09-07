import { describe, expect, it } from 'bun:test';
import { executeSeedKorti } from '@/cli/commands/seed-korti';
import {
  sanitizeSpreadsheetPhone,
  seedKortiFromSpreadsheet,
} from '@/core/services/seeder.service.ts';

describe('Seeder Service & Phone Sanitizer Module', () => {
  describe('sanitizeSpreadsheetPhone', () => {
    it('should return null for empty, placeholder, or invalid inputs', () => {
      expect(sanitizeSpreadsheetPhone(null)).toBeNull();
      expect(sanitizeSpreadsheetPhone(undefined)).toBeNull();
      expect(sanitizeSpreadsheetPhone('')).toBeNull();
      expect(sanitizeSpreadsheetPhone('   ')).toBeNull();
      expect(sanitizeSpreadsheetPhone('*')).toBeNull();
      expect(sanitizeSpreadsheetPhone('-')).toBeNull();
      expect(sanitizeSpreadsheetPhone('.')).toBeNull();
    });

    it('should strip leading and trailing asterisks, quotes, and whitespace', () => {
      expect(sanitizeSpreadsheetPhone('*085738497214')).toBe('085738497214');
      expect(sanitizeSpreadsheetPhone("'*081238575313'")).toBe('081238575313');
      expect(sanitizeSpreadsheetPhone('  *082266320007  ')).toBe('082266320007');
    });

    it('should convert Excel scientific notation string to integer string', () => {
      expect(sanitizeSpreadsheetPhone('8.7776716707E10')).toBe('87776716707');
      expect(sanitizeSpreadsheetPhone('8.1995610253E10')).toBe('81995610253');
    });

    it('should handle native numeric inputs from Excel', () => {
      expect(sanitizeSpreadsheetPhone(87776716707)).toBe('87776716707');
      expect(sanitizeSpreadsheetPhone(89635857581)).toBe('89635857581');
    });
  });

  describe('seedKortiFromSpreadsheet', () => {
    it('should return NotFoundError when spreadsheet file does not exist', async () => {
      const result = await seedKortiFromSpreadsheet({
        filePath: 'non_existent_file_path_12345.xlsx',
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('RESOURCE_NOT_FOUND');
      }
    });

    it('should parse master spreadsheet and extract 19 Korti in dry-run mode', async () => {
      const result = await seedKortiFromSpreadsheet({
        dryRun: true,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const summary = result.data;
        expect(summary.isDryRun).toBe(true);
        expect(summary.totalImported).toBe(19);
        expect(summary.items.length).toBe(19);

        // Verifikasi item pertama (PGSD)
        const first = summary.items[0]!;
        expect(first.fakultas).toBe('FIP');
        expect(first.prodi).toBe('PGSD');
        expect(first.semester).toBe(5);
        expect(first.kelas).toBe('Q');
        expect(first.nama).toBe('Anak Agung Dinda Saraswati');
        expect(first.jid).toBe('6287776716707@s.whatsapp.net');

        // Verifikasi salah satu item dengan merged cells C (PBI Smt 1 Kelas I)
        const pbiSmt1I = summary.items.find((i) => i.nama.includes('Sinta Kartika'));
        expect(pbiSmt1I).toBeDefined();
        expect(pbiSmt1I?.semester).toBe(1);
        expect(pbiSmt1I?.kelas).toBe('I');
        expect(pbiSmt1I?.jid).toBe('6281238575313@s.whatsapp.net');

        // Verifikasi Sistem Informasi
        const siItem = summary.items.find((i) => i.prodi === 'SISTEM INFORMASI' && i.semester === 1);
        expect(siItem).toBeDefined();
        expect(siItem?.kelas).toBe('1');
        expect(siItem?.jid).toBe('6287724877916@s.whatsapp.net');
      }
    });

    it('should execute upsert idempotently without error when dryRun is false', async () => {
      const result = await seedKortiFromSpreadsheet({
        dryRun: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalImported).toBe(19);
      }

      // Cleanup tabel users agar database kembali bersih
      const { db } = await import('@/core/db');
      const { users } = await import('@/core/db/schema.ts');
      await db.delete(users);
    });
  });

  describe('executeSeedKorti CLI command', () => {
    it('should execute successfully via CLI handler in dry-run mode', async () => {
      const result = await executeSeedKorti(
        { 'dry-run': true },
        { isQuiet: true, isVerbose: false, isJsonOutput: false } as any
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalImported).toBe(19);
        expect(result.data.isDryRun).toBe(true);
      }
    });
  });
});
