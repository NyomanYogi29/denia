import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, forceEvents, users } from '@/core/db/index.ts';
import { abortAction, executeAbort } from '@/cli/commands/abort/index.ts';
import { forceBookingUseCase } from '@/core/features/force/index.ts';
import { createForceEventUseCase } from '@/core/features/force-event/index.ts';
import { getTomorrowIso, isoToDateString } from '@/core/utils/index.ts';

describe('CLI Abort Command Consumer (Fase 5.6 - denia abort force / event)', () => {
  const testStaffJid = '628333444555@s.whatsapp.net';
  const testKortiJid = '628444555666@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';

  const tomorrowIso = getTomorrowIso();
  const tomorrowFormatted = (isoToDateString(tomorrowIso) as any).data ?? '14/09/2026';

  beforeEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
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
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, testKortiJid));
  });

  it('should execute abort force booking via abortAction with quiet mode', async () => {
    // 1. Buat force booking
    const forceRes = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'Sidang CLI',
    });
    expect(forceRes.success).toBe(true);
    if (!forceRes.success) return;

    const bookingId = forceRes.data.bookings[0]!.id;

    // 2. Abort via CLI abortAction
    const result = await abortAction({
      target: 'force',
      id: bookingId,
      userJid: testStaffJid,
      isQuiet: true,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('force');
      if (result.data.type === 'force') {
        expect(result.data.data.room.code).toBe(testRoomCode);
        expect(result.data.data.slot.raw).toBe('DEF');
      }
    }
  });

  it('should execute abort force via positional args in executeAbort', async () => {
    const forceRes = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'A',
      userJid: testStaffJid,
      reason: 'Pimpinan CLI',
    });
    expect(forceRes.success).toBe(true);
    if (!forceRes.success) return;

    const bookingId = forceRes.data.bookings[0]!.id;

    // denia abort force <bookingId> --jid <staffJid>
    const result = await executeAbort(
      { jid: testStaffJid },
      { isQuiet: true },
      ['abort', 'force', String(bookingId)]
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('force');
    }
  });

  it('should execute abort forceevent via positional args in executeAbort', async () => {
    const eventRes = await createForceEventUseCase({
      roomCodes: [testRoomCode],
      startDate: tomorrowFormatted,
      endDate: tomorrowFormatted,
      eventName: 'Seminar CLI',
      userJid: testStaffJid,
    });
    expect(eventRes.success).toBe(true);
    if (!eventRes.success) return;

    const eventId = eventRes.data.events[0]!.id;

    // denia abort event <eventId> --jid <staffJid>
    const result = await executeAbort(
      { jid: testStaffJid },
      { isQuiet: true },
      ['abort', 'event', String(eventId)]
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('forceevent');
      if (result.data.type === 'forceevent') {
        expect(result.data.data.eventName).toBe('Seminar CLI');
      }
    }
  });
});
