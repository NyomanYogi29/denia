import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, forceEvents, users } from '@/core/db';
import { getRoomAvailabilityUseCase } from '@/core/features/info';
import { ErrorCode } from '@/core/errors';

describe('Get Room Availability Use Case (src/core/features/info/get-room-availability.usecase.ts)', () => {
  const testJid = '628123456789@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';
  const testBookingDate = '2026-10-20';
  const testBookingDateFormatted = '20/10/2026';

  beforeEach(async () => {
    // Bersihkan data tes
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testJid));

    // Siapkan user test
    await db.insert(users).values({
      jid: testJid,
      nama: 'Wayan Korti Test',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 3,
      kelas: 'PTI 3A',
      noTelp: '08123456789',
      role: 'korti',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testJid));
  });

  it('should successfully get availability for today when no date is provided', async () => {
    const result = await getRoomAvailabilityUseCase({});

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.matrixData.rooms.length).toBeGreaterThan(0);
    expect(result.data.formattedMessage).toContain('MATRIKS KETERSEDIAAN RUANGAN SDP UNDIKSHA');
  });

  it('should reflect active bookings in room slot statuses', async () => {
    // Insert active booking for D, E, F
    await db.insert(bookings).values([
      {
        roomCode: testRoomCode,
        bookingDate: testBookingDate,
        slotCode: 'D',
        userJid: testJid,
        status: 'active',
      },
      {
        roomCode: testRoomCode,
        bookingDate: testBookingDate,
        slotCode: 'E',
        userJid: testJid,
        status: 'active',
      },
      {
        roomCode: testRoomCode,
        bookingDate: testBookingDate,
        slotCode: 'F',
        userJid: testJid,
        status: 'active',
      },
    ]);

    const result = await getRoomAvailabilityUseCase({
      date: testBookingDateFormatted,
      roomCode: testRoomCode,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const roomItem = result.data.matrixData.rooms.find((r) => r.room.code === testRoomCode);
    expect(roomItem).toBeDefined();
    expect(roomItem!.availableSlots).not.toContain('D');
    expect(roomItem!.availableSlots).not.toContain('E');
    expect(roomItem!.availableSlots).not.toContain('F');
    expect(roomItem!.bookedSlots.length).toBe(3);
    expect(result.data.formattedMessage).toContain('RAK_2.1');
    expect(result.data.formattedMessage).toContain('DEF');
  });

  it('should reflect active force events blocking slots', async () => {
    // Insert force event blocking slots G, H
    await db.insert(forceEvents).values({
      roomCode: testRoomCode,
      startDate: testBookingDate,
      endDate: testBookingDate,
      slotCode: 'GH',
      eventName: 'Ujian Komprehensif',
      createdByJid: testJid,
      status: 'active',
    });

    const result = await getRoomAvailabilityUseCase({
      date: testBookingDateFormatted,
      roomCode: testRoomCode,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const roomItem = result.data.matrixData.rooms.find((r) => r.room.code === testRoomCode);
    expect(roomItem).toBeDefined();
    expect(roomItem!.availableSlots).not.toContain('G');
    expect(roomItem!.availableSlots).not.toContain('H');
    expect(roomItem!.blockedSlots.length).toBe(2);
    expect(result.data.formattedMessage).toContain('Ujian Komprehensif');
  });

  it('should filter only the requested room when roomCode is provided', async () => {
    const result = await getRoomAvailabilityUseCase({
      date: testBookingDateFormatted,
      roomCode: testRoomCode,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.matrixData.rooms.length).toBe(1);
    expect(result.data.matrixData.rooms[0]!.room.code).toBe(testRoomCode);
  });

  it('should return error when date format is invalid', async () => {
    const result = await getRoomAvailabilityUseCase({
      date: '2026-10-20', // bukan format DD/MM/YYYY
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
  });

  it('should return error when room code does not exist', async () => {
    const result = await getRoomAvailabilityUseCase({
      roomCode: 'RUANG_TIDAK_ADA',
    });

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe(ErrorCode.ROOM_NOT_FOUND);
  });

  it('should support "besok" keyword to fetch tomorrow\'s schedule', async () => {
    const result = await getRoomAvailabilityUseCase({
      date: 'besok',
      roomCode: testRoomCode,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.matrixData.isTomorrow).toBe(true);
    expect(result.data.formattedMessage).toContain('Besok');
  });

  it('should correctly calculate passed slots based on startTime', async () => {
    const { getPassedSlots } = await import('@/core/utils');

    // Sebelum jam 07:30, belum ada slot yang terlewat
    expect(getPassedSlots('07:00')).toEqual([]);

    // Jam 07:30 tepat, Slot A (07:30 - 08:20) sudah mulai
    expect(getPassedSlots('07:30')).toEqual(['A']);

    // Jam 10:30, Slot A, B, C, D sudah mulai
    expect(getPassedSlots('10:30')).toEqual(['A', 'B', 'C', 'D']);

    // Jam 15:00, Slot A sampai H (14:30 - 15:30) sudah mulai
    expect(getPassedSlots('15:00')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);

    // Jam 22:30 (malam), seluruh slot A-O sudah terlewat
    expect(getPassedSlots('22:30').length).toBe(15);
  });
});
