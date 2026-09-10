import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, users } from '@/core/db';
import { createUserUseCase } from '@/core/features/user';

describe('Core User Feature: createUserUseCase', () => {
  const testJid = '6289912345678@s.whatsapp.net';

  beforeEach(async () => {
    await db.delete(users).where(eq(users.jid, testJid));
  });

  afterEach(async () => {
    await db.delete(users).where(eq(users.jid, testJid));
  });

  it('should successfully create a new user with valid input DTO', async () => {
    const result = await createUserUseCase({
      jid: '089912345678',
      nama: 'Wayan Core Tester',
      kelas: '3DPS',
      fakultas: 'FTK',
      prodi: 'SI',
      semester: 3,
      role: 'korti',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.jid).toBe(testJid);
      expect(result.data.nama).toBe('Wayan Core Tester');
      expect(result.data.kelas).toBe('3DPS');
      expect(result.data.role).toBe('korti');
      expect(result.data.noTelp).toBe('6289912345678');
    }

    // Pastikan tersimpan di database
    const saved = await db.select().from(users).where(eq(users.jid, testJid)).get();
    expect(saved).toBeDefined();
    expect(saved?.nama).toBe('Wayan Core Tester');
  });

  it('should reject invalid input and return ValidationError with INVALID_COMMAND_SYNTAX', async () => {
    const result = await createUserUseCase({
      jid: 'invalid-phone-number',
      nama: 'A', // kurang dari 2 karakter
      kelas: '',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_COMMAND_SYNTAX');
      expect(result.error.metadata?.issues).toBeDefined();
    }
  });

  it('should reject duplicate JID creation with informative error', async () => {
    const firstRes = await createUserUseCase({
      jid: testJid,
      nama: 'User Pertama',
      kelas: '3DPS',
    });
    expect(firstRes.success).toBe(true);

    const duplicateRes = await createUserUseCase({
      jid: testJid,
      nama: 'User Duplikat',
      kelas: '3DPS',
    });

    expect(duplicateRes.success).toBe(false);
  });
});
