import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, users } from '@/core/db';
import { bookAction, executeBook } from '@/cli/commands/book';
import { getTomorrowIso, isoToDateString } from '@/core/utils';

describe('CLI Book Command Consumer (Fase 5.1 - denia book / pinjam)', () => {
  const testKortiJid = '628222333444@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';

  const tomorrowIso = getTomorrowIso();
  const tomorrowFormatted = (isoToDateString(tomorrowIso) as any).data ?? '14/09/2026';

  beforeEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));

    await db.insert(users).values({
      jid: testKortiJid,
      nama: 'Ketut Korti CLI Test',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 4,
      kelas: 'PTI 4A',
      noTelp: '08222333444',
      role: 'korti',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));
  });

  it('should book a room via bookAction with quiet mode', async () => {
    const result = await bookAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: testKortiJid,
        notes: 'CLI Booking Test',
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.room.code).toBe('RAK_2.1');
      expect(result.data.slot.raw).toBe('DEF');
      expect(result.data.user.nama).toBe('Ketut Korti CLI Test');
      expect(result.data.bookings.length).toBe(3);
    }
  });

  it('should support JSON output mode without throwing', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      const result = await bookAction(
        {
          roomCode: testRoomCode,
          date: tomorrowFormatted,
          slotCode: 'AB',
          userJid: testKortiJid,
        },
        { isJsonOutput: true }
      );

      expect(result.success).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      const parsedOutput = JSON.parse(logs[0]!);
      expect(parsedOutput.room.code).toBe('RAK_2.1');
      expect(parsedOutput.slot.raw).toBe('AB');
    } finally {
      console.log = originalLog;
    }
  });

  it('should support executeBook with positional arguments', async () => {
    const result = await executeBook(
      { jid: testKortiJid },
      { isQuiet: true } as any,
      ['book', testRoomCode, tomorrowFormatted, 'DEF']
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.room.code).toBe(testRoomCode);
      expect(result.data.slot.raw).toBe('DEF');
      expect(result.data.user.jid).toBe(testKortiJid);
    }
  });

  it('should return CliError when user is not found in database', async () => {
    const unregisteredJid = '628000999888@s.whatsapp.net';
    const result = await bookAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: unregisteredJid,
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('UNAUTHORIZED');
    }
  });

  it('should return CliArgumentError when input syntax is invalid or missing required fields', async () => {
    const result = await bookAction(
      {
        roomCode: '',
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: testKortiJid,
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_COMMAND_SYNTAX');
    }
  });
});
