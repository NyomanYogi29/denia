import { describe, expect, it } from 'bun:test';
import { userAddAction } from '@/cli/commands';
import { isValidWhatsAppJid, normalizeToWhatsAppJid } from '@/cli/utils';
import { db, users } from '@/core/db';
import { createUserInputSchema } from '@/core/validators';
import { eq } from 'drizzle-orm';

describe('CLI User Add Module (V2 Specification)', () => {
  describe('JID Normalizer & Validator (src/cli/utils/)', () => {
    it('should normalize local 08xxx number to 628xxx@s.whatsapp.net', () => {
      const jid = normalizeToWhatsAppJid('081234567890');
      expect(jid).toBe('6281234567890@s.whatsapp.net');
      expect(isValidWhatsAppJid('081234567890')).toBe(true);
    });

    it('should normalize +62 number with spaces/dashes to clean JID', () => {
      const jid = normalizeToWhatsAppJid('+62 812-3456-7890');
      expect(jid).toBe('6281234567890@s.whatsapp.net');
      expect(isValidWhatsAppJid('+62 812-3456-7890')).toBe(true);
    });

    it('should accept already valid WhatsApp JID directly', () => {
      const jid = normalizeToWhatsAppJid('6281234567890@s.whatsapp.net');
      expect(jid).toBe('6281234567890@s.whatsapp.net');
      expect(isValidWhatsAppJid('6281234567890@s.whatsapp.net')).toBe(true);
    });

    it('should reject invalid numbers that are too short or non-numeric', () => {
      expect(() => normalizeToWhatsAppJid('123')).toThrow();
      expect(isValidWhatsAppJid('123')).toBe(false);
      expect(isValidWhatsAppJid('abc')).toBe(false);
    });
  });

  describe('Core Zod Input Schema (src/core/validators/)', () => {
    it('should validate and parse valid user input successfully with default role and auto-derived noTelp', () => {
      const parsed = createUserInputSchema.safeParse({
        jid: '081299998888',
        nama: 'Wayan Korti',
        kelas: 'PTI 4A',
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.jid).toBe('6281299998888@s.whatsapp.net');
        expect(parsed.data.nama).toBe('Wayan Korti');
        expect(parsed.data.kelas).toBe('PTI 4A');
        expect(parsed.data.noTelp).toBe('6281299998888');
        expect(parsed.data.role).toBe('korti');
      }
    });

    it('should parse optional academic fields (fakultas, prodi, semester)', () => {
      const parsed = createUserInputSchema.safeParse({
        jid: '081299998888',
        nama: 'Wayan Korti',
        fakultas: 'FTK',
        prodi: 'PTI',
        semester: '4',
        kelas: 'PTI 4A',
        noTelp: '081299998888',
        role: 'staff',
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.fakultas).toBe('FTK');
        expect(parsed.data.prodi).toBe('PTI');
        expect(parsed.data.semester).toBe(4);
        expect(parsed.data.noTelp).toBe('081299998888');
        expect(parsed.data.role).toBe('staff');
      }
    });

    it('should reject missing required fields with descriptive error messages', () => {
      const parsed = createUserInputSchema.safeParse({
        jid: '',
        nama: 'A',
      });

      expect(parsed.success).toBe(false);
    });

    it('should reject invalid role enum', () => {
      const parsed = createUserInputSchema.safeParse({
        jid: '081299998888',
        nama: 'Wayan Korti',
        kelas: 'PTI 4A',
        role: 'superadmin',
      });

      expect(parsed.success).toBe(false);
    });
  });

  describe('CLI Action (action.ts)', () => {
    const testJid = '6289911223344@s.whatsapp.net';

    // Bersihkan data tes sebelum pengujian
    const cleanup = async () => {
      await db.delete(users).where(eq(users.jid, testJid));
    };

    it('should insert a new user into database successfully via action', async () => {
      await cleanup();

      const result = await userAddAction(
        {
          jid: testJid,
          nama: 'Gede Test User',
          fakultas: 'FTK',
          prodi: 'PTI',
          semester: 4,
          kelas: 'PTI 4C',
          role: 'korti',
        },
        { isQuiet: true, isInteractive: false }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.jid).toBe(testJid);
        expect(result.data.nama).toBe('Gede Test User');
        expect(result.data.fakultas).toBe('FTK');
        expect(result.data.prodi).toBe('PTI');
        expect(result.data.semester).toBe(4);
        expect(result.data.kelas).toBe('PTI 4C');
        expect(result.data.noTelp).toBe('6289911223344');
        expect(result.data.role).toBe('korti');
      }
    });

    it('should prevent duplicate JID registration with informative error', async () => {
      const result = await userAddAction(
        {
          jid: testJid,
          nama: 'Duplicate JID User',
          kelas: 'PTI 4C',
          role: 'staff',
        },
        { isQuiet: true, isInteractive: false }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.userMessage).toContain('sudah terdaftar');
      }

      await cleanup();
    });
  });
});
