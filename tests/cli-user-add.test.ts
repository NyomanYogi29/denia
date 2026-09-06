import { describe, expect, it } from 'bun:test';
import {
  insertUser,
  userAddAction,
  userAddInputSchema,
} from '@/cli/commands';
import { isValidWhatsAppJid, normalizeToWhatsAppJid } from '@/cli/utils';
import { db, users } from '@/core/db';
import { eq } from 'drizzle-orm';

describe('CLI User Add Module (Feature-Based)', () => {
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

  describe('Zod Input Schema (schema.ts)', () => {
    it('should validate and parse valid user input successfully with default role', () => {
      const parsed = userAddInputSchema.safeParse({
        jid: '081299998888',
        nama: 'Wayan Korti',
        nim: '2115051088',
        kelas: 'PTI 4A',
      });

      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.jid).toBe('6281299998888@s.whatsapp.net');
        expect(parsed.data.nama).toBe('Wayan Korti');
        expect(parsed.data.nim).toBe('2115051088');
        expect(parsed.data.kelas).toBe('PTI 4A');
        expect(parsed.data.role).toBe('korti');
      }
    });

    it('should reject missing required fields with descriptive error messages', () => {
      const parsed = userAddInputSchema.safeParse({
        jid: '',
        nama: 'A',
      });

      expect(parsed.success).toBe(false);
    });

    it('should reject invalid role enum', () => {
      const parsed = userAddInputSchema.safeParse({
        jid: '081299998888',
        nama: 'Wayan Korti',
        nim: '2115051088',
        kelas: 'PTI 4A',
        role: 'superadmin',
      });

      expect(parsed.success).toBe(false);
    });
  });

  describe('Repository & Action (repository.ts & action.ts)', () => {
    const testJid = '6289911223344@s.whatsapp.net';
    const testNim = '9911223344';

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
          nim: testNim,
          kelas: 'PTI 4C',
          role: 'korti',
        },
        { isQuiet: true, isInteractive: false }
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.jid).toBe(testJid);
        expect(result.data.nim).toBe(testNim);
        expect(result.data.role).toBe('korti');
      }
    });

    it('should prevent duplicate JID registration with informative error', async () => {
      const result = await userAddAction(
        {
          jid: testJid,
          nama: 'Duplicate JID User',
          nim: '9999999999',
          kelas: 'PTI 4C',
          role: 'staff',
        },
        { isQuiet: true, isInteractive: false }
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.userMessage).toContain('sudah terdaftar');
      }
    });

    it('should prevent duplicate NIM registration with informative error', async () => {
      const result = await userAddAction(
        {
          jid: '6289900001111@s.whatsapp.net',
          nama: 'Duplicate NIM User',
          nim: testNim,
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
