import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, users } from '@/core/db/index.ts';
import { forceAction, executeForce } from '@/cli/commands/force/index.ts';
import { getTomorrowIso, isoToDateString } from '@/core/utils/index.ts';

describe('CLI Force Command Consumer (Fase 5.4 - denia force / ambilalih)', () => {
  const testStaffJid = '628333444555@s.whatsapp.net';
  const testKortiJid = '628444555666@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';

  const tomorrowIso = getTomorrowIso();
  const tomorrowFormatted = (isoToDateString(tomorrowIso) as any).data ?? '14/09/2026';

  beforeEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, testKortiJid));

    await db.insert(users).values({
      jid: testStaffJid,
      nama: 'Staf Ujian Fakultas',
      fakultas: 'FTK',
      prodi: null,
      semester: null,
      kelas: 'Staf SDP',
      noTelp: '08333444555',
      role: 'staff',
    });

    await db.insert(users).values({
      jid: testKortiJid,
      nama: 'Korti Mahasiswa CLI',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 4,
      kelas: 'PTI 4B',
      noTelp: '08444555666',
      role: 'korti',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, testKortiJid));
  });

  it('should execute force booking via forceAction with quiet mode', async () => {
    const result = await forceAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: testStaffJid,
        reason: 'Ujian Sidang Skripsi Mendadak',
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.room.code).toBe(testRoomCode);
      expect(result.data.slot.raw).toBe('DEF');
      expect(result.data.user.nama).toBe('Staf Ujian Fakultas');
      expect(result.data.bookings.length).toBe(3);
      expect(result.data.bookings.every((b) => b.bookingType === 'institutional')).toBe(true);
    }
  });

  it('should support JSON output mode without throwing', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const result = await forceAction(
        {
          roomCode: testRoomCode,
          date: tomorrowFormatted,
          slotCode: 'AB',
          userJid: testStaffJid,
          reason: 'Kuliah Tamu Industri',
        },
        { isJsonOutput: true }
      );

      expect(result.success).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logs[0]!);
      expect(parsed.room.code).toBe(testRoomCode);
      expect(parsed.slot.raw).toBe('AB');
    } finally {
      console.log = originalLog;
    }
  });

  it('should support executeForce with positional arguments', async () => {
    const result = await executeForce(
      {
        jid: testStaffJid,
      },
      { isQuiet: true } as any,
      ['force', testRoomCode, tomorrowFormatted, 'CD', 'Kuliah', 'Pengganti', 'Dosen']
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.room.code).toBe(testRoomCode);
      expect(result.data.slot.raw).toBe('CD');
      expect(result.data.reason).toBe('Kuliah Pengganti Dosen');
    }
  });

  it('should reject forceAction when Korti attempts execution with FORBIDDEN_ROLE', async () => {
    const result = await forceAction(
      {
        roomCode: testRoomCode,
        date: tomorrowFormatted,
        slotCode: 'DEF',
        userJid: testKortiJid,
        reason: 'Percobaan Pengambilalihan Ilegal',
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN_ROLE');
    }
  });
});
