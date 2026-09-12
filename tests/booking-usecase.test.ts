import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, forceEvents, users } from '@/core/db';
import { createBookingUseCase } from '@/core/features/booking';
import { ErrorCode } from '@/core/errors';
import { getTodayIso, getTomorrowIso, isoToDateString } from '@/core/utils';

describe('Booking Use Case (src/core/features/booking/create-booking.usecase.ts)', () => {
  const testKortiJid = '628123456789@s.whatsapp.net';
  const testStaffJid = '628987654321@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';

  // Tanggal besok (H-1) dan hari ini terpusat WITA
  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();
  const todayFormatted = (isoToDateString(todayIso) as any).data ?? '13/09/2026';
  const tomorrowFormatted = (isoToDateString(tomorrowIso) as any).data ?? '14/09/2026';

  beforeEach(async () => {
    // Bersihkan data tes
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));
    await db.delete(users).where(eq(users.jid, testStaffJid));

    // Masukkan Korti terdaftar
    await db.insert(users).values({
      jid: testKortiJid,
      nama: 'Wayan Korti Test',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 3,
      kelas: '3A',
      noTelp: '08123456789',
      role: 'korti',
    });

    // Masukkan Staf terdaftar
    await db.insert(users).values({
      jid: testStaffJid,
      nama: 'Staf Administrasi SDP',
      fakultas: null,
      prodi: null,
      semester: null,
      kelas: 'Staf SDP',
      noTelp: '08987654321',
      role: 'staff',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));
    await db.delete(users).where(eq(users.jid, testStaffJid));
  });

  it('should successfully book a room with valid input (Zod validation & atomic reservation)', async () => {
    const result = await createBookingUseCase({
      roomCode: 'rak_2.1',
      date: tomorrowFormatted,
      slotCode: 'def',
      userJid: testKortiJid,
      notes: 'Perkuliahan Pemrograman Web',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      const data = result.data;
      expect(data.room.code).toBe('RAK_2.1');
      expect(data.slot.raw).toBe('DEF');
      expect(data.slot.totalSks).toBe(3);
      expect(data.user.nama).toBe('Wayan Korti Test');
      expect(data.bookings.length).toBe(3);
      expect(data.bookings[0]?.slotCode).toBe('D');
      expect(data.bookings[1]?.slotCode).toBe('E');
      expect(data.bookings[2]?.slotCode).toBe('F');
    }
  });

  it('should reject input missing required fields with INVALID_COMMAND_SYNTAX (Zod schema validation)', async () => {
    const result = await createBookingUseCase({
      roomCode: '',
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
    }
  });

  it('should reject booking when user is not registered in whitelist database with UNAUTHORIZED_USER', async () => {
    const unregisteredJid = '628999111222@s.whatsapp.net';
    const result = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: unregisteredJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.UNAUTHORIZED);
      expect(result.error.userMessage).toContain('whitelist');
    }
  });

  it('should reject non-existent room code with ROOM_NOT_FOUND', async () => {
    const result = await createBookingUseCase({
      roomCode: 'NON_EXISTENT_99',
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.ROOM_NOT_FOUND);
    }
  });

  it('should reject invalid date format with INVALID_DATE_FORMAT', async () => {
    const result = await createBookingUseCase({
      roomCode: testRoomCode,
      date: '2026-10-15', // ISO bukan format DD/MM/YYYY
      slotCode: 'DEF',
      userJid: testKortiJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
    }
  });

  it('should reject Korti booking on the same day (hari H) with INVALID_BOOKING_LEAD_TIME', async () => {
    const result = await createBookingUseCase({
      roomCode: testRoomCode,
      date: todayFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.INVALID_BOOKING_LEAD_TIME);
      expect(result.error.userMessage).toContain('minimal H-1');
    }
  });

  it('should allow Staff booking on the same day (hari H)', async () => {
    const result = await createBookingUseCase({
      roomCode: testRoomCode,
      date: todayFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bookings.length).toBe(3);
    }
  });

  it('should reject non-contiguous slot sequences with INVALID_SLOT_SEQUENCE', async () => {
    const result = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'ADF', // lompat
      userJid: testKortiJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.INVALID_SLOT_SEQUENCE);
    }
  });

  it('should reject booking exceeding 4 SKS limit with SLOT_LIMIT_EXCEEDED', async () => {
    const result = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'ABCDE', // 5 SKS
      userJid: testKortiJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.SLOT_LIMIT_EXCEEDED);
    }
  });

  it('should reject duplicate booking when slot is already booked with SLOT_CONFLICT', async () => {
    // Booking pertama berhasil
    const firstResult = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DE',
      userJid: testKortiJid,
    });
    expect(firstResult.success).toBe(true);

    // Booking kedua menabrak slot E
    const secondResult = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'EF',
      userJid: testKortiJid,
    });

    expect(secondResult.success).toBe(false);
    if (!secondResult.success) {
      expect(secondResult.error.code).toBe(ErrorCode.SLOT_CONFLICT);
    }
  });
});
