import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { db, bookings, forceEvents, users } from '@/core/db/index.ts';
import { forceEventAction, executeForceEvent } from '@/cli/commands/force-event/index.ts';
import { getTomorrowIso, isoToDateString } from '@/core/utils/index.ts';

describe('CLI Force Event Command Consumer (Fase 5.5 - denia forceevent / event)', () => {
  const testStaffJid = '628333444555@s.whatsapp.net';
  const testKortiJid = '628444555666@s.whatsapp.net';
  const room1 = 'RAK_1.1';
  const room2 = 'RAK_2.1';

  const tomorrowIso = getTomorrowIso();
  const tomorrowFormatted = (isoToDateString(tomorrowIso) as any).data ?? '14/09/2026';

  beforeEach(async () => {
    await db.delete(bookings).where(inArray(bookings.roomCode, [room1, room2]));
    await db.delete(forceEvents).where(inArray(forceEvents.roomCode, [room1, room2]));
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
    await db.delete(bookings).where(inArray(bookings.roomCode, [room1, room2]));
    await db.delete(forceEvents).where(inArray(forceEvents.roomCode, [room1, room2]));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, testKortiJid));
  });

  it('should execute forceEventAction with quiet mode', async () => {
    const result = await forceEventAction(
      {
        roomCodes: `${room1},${room2}`,
        dateRange: tomorrowFormatted,
        userJid: testStaffJid,
        eventName: 'Seminar Proposal Skripsi Gelombang 1',
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms.length).toBe(2);
      expect(result.data.eventName).toBe('Seminar Proposal Skripsi Gelombang 1');
      expect(result.data.events.length).toBe(2);
      expect(result.data.user.nama).toBe('Staf Ujian Fakultas');
    }
  });

  it('should support JSON output mode without throwing', async () => {
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args: any[]) => {
      logs.push(args.map(String).join(' '));
    };

    try {
      const result = await forceEventAction(
        {
          roomCodes: [room1],
          dateRange: tomorrowFormatted,
          userJid: testStaffJid,
          eventName: 'Kuliah Umum Kecerdasan Buatan',
        },
        { isJsonOutput: true }
      );

      expect(result.success).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      const parsed = JSON.parse(logs[0]!);
      expect(parsed.eventName).toBe('Kuliah Umum Kecerdasan Buatan');
      expect(parsed.rooms[0].code).toBe(room1);
    } finally {
      console.log = originalLog;
    }
  });

  it('should support executeForceEvent with positional arguments', async () => {
    const result = await executeForceEvent(
      {
        jid: testStaffJid,
      },
      { isQuiet: true } as any,
      ['forceevent', `${room1},${room2}`, tomorrowFormatted, 'Workshop', 'Kurikulum', 'OBE']
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms.length).toBe(2);
      expect(result.data.eventName).toBe('Workshop Kurikulum OBE');
    }
  });

  it('should reject forceEventAction when Korti attempts execution with FORBIDDEN_ROLE', async () => {
    const result = await forceEventAction(
      {
        roomCodes: room1,
        dateRange: tomorrowFormatted,
        userJid: testKortiJid,
        eventName: 'Acara Mahasiswa Non Resmi',
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe('FORBIDDEN_ROLE');
    }
  });
});
