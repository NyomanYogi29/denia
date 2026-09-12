import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, users } from '@/core/db';
import { bookAction } from '@/cli/commands/book';
import { cancelAction, executeCancel } from '@/cli/commands/cancel';

describe('CLI Cancel Command Consumer (Fase 5.2 - denia cancel / batal)', () => {
  const ownerJid = '628333444555@s.whatsapp.net';
  const otherJid = '628444555666@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowFormatted = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(
    tomorrow.getMonth() + 1
  ).padStart(2, '0')}/${tomorrow.getFullYear()}`;

  beforeEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, ownerJid));
    await db.delete(users).where(eq(users.jid, otherJid));

    await db.insert(users).values({
      jid: ownerJid,
      nama: 'Owner CLI Test',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 4,
      kelas: 'PTI 4A',
      noTelp: '08333444555',
      role: 'korti',
    });

    await db.insert(users).values({
      jid: otherJid,
      nama: 'Other CLI Test',
      fakultas: 'FTK',
      prodi: 'SI',
      semester: 4,
      kelas: 'SI 4A',
      noTelp: '08444555666',
      role: 'korti',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, ownerJid));
    await db.delete(users).where(eq(users.jid, otherJid));
  });

  it('should cancel booking via cancelAction in quiet mode', async () => {
    // 1. Pesan ruangan
    await bookAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: ownerJid,
      },
      { isQuiet: true }
    );

    // 2. Batalkan pemesanan
    const result = await cancelAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: ownerJid,
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.room.code).toBe(testRoomCode);
      expect(result.data.slot.raw).toBe('DEF');
      expect(result.data.cancelledBookings.length).toBe(3);
    }
  });

  it('should support JSON output mode for cancelAction', async () => {
    await bookAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'AB',
        userJid: ownerJid,
      },
      { isQuiet: true }
    );

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    try {
      const result = await cancelAction(
        {
          roomCode: testRoomCode,
          date: tomorrowFormatted,
          slotCode: 'AB',
          userJid: ownerJid,
        },
        { isJsonOutput: true }
      );

      expect(result.success).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      const parsedOutput = JSON.parse(logs[0]!);
      expect(parsedOutput.room.code).toBe(testRoomCode);
      expect(parsedOutput.slot.raw).toBe('AB');
    } finally {
      console.log = originalLog;
    }
  });

  it('should support executeCancel with positional arguments', async () => {
    await bookAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: ownerJid,
      },
      { isQuiet: true }
    );

    const result = await executeCancel(
      { jid: ownerJid },
      { isQuiet: true } as any,
      ['cancel', testRoomCode, tomorrowFormatted, 'DEF']
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.room.code).toBe(testRoomCode);
      expect(result.data.slot.raw).toBe('DEF');
    }
  });

  it('should return CliError with NOT_BOOKING_OWNER when unauthorized user attempts cancellation', async () => {
    await bookAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: ownerJid,
      },
      { isQuiet: true }
    );

    const result = await cancelAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: otherJid,
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('NOT_BOOKING_OWNER');
    }
  });
});
