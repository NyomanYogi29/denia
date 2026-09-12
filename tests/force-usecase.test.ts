import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, forceEvents, users } from '@/core/db/index.ts';
import { forceBookingUseCase } from '@/core/features/force/index.ts';
import { createBookingUseCase } from '@/core/features/booking/index.ts';
import { ErrorCode } from '@/core/errors/index.ts';
import { getTodayIso, getTomorrowIso, isoToDateString } from '@/core/utils/index.ts';

describe('Force Booking Use Case (src/core/features/force/force-booking.usecase.ts)', () => {
  const testKortiJid = '628123456789@s.whatsapp.net';
  const testStaffJid = '628987654321@s.whatsapp.net';
  const otherStaffJid = '628555666777@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';

  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();
  const todayFormatted = isoToDateString(todayIso).success ? (isoToDateString(todayIso) as any).data : '13/09/2026';
  const tomorrowFormatted = isoToDateString(tomorrowIso).success ? (isoToDateString(tomorrowIso) as any).data : '14/09/2026';

  beforeEach(async () => {
    // Bersihkan data tes
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, otherStaffJid));

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

    // Masukkan Staf kedua
    await db.insert(users).values({
      jid: otherStaffJid,
      nama: 'Dosen Koordinator Ruangan',
      fakultas: null,
      prodi: null,
      semester: null,
      kelas: 'Admin SDP',
      noTelp: '08555666777',
      role: 'admin',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, otherStaffJid));
  });

  it('should successfully force book when slot is empty (direct institutional booking)', async () => {
    const result = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'Agenda Rapat Senat Fakultas Mendadak',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.room.code).toBe(testRoomCode);
      expect(result.data.bookings.length).toBe(3);
      expect(result.data.displacedBookings.length).toBe(0);
      expect(result.data.bookings.every((b) => b.bookingType === 'institutional')).toBe(true);
      expect(result.data.bookings.every((b) => b.status === 'active')).toBe(true);
    }
  });

  it('should allow Staff to force book on the same day (Hari H)', async () => {
    const result = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: todayFormatted,
      slotCode: 'AB',
      userJid: testStaffJid,
      reason: 'Kuliah Pengganti Dosen Tamu Luar Negeri',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.bookings.length).toBe(2);
      expect(result.data.reason).toBe('Kuliah Pengganti Dosen Tamu Luar Negeri');
    }
  });

  it('should override existing Korti booking and mark old bookings as force_cancelled', async () => {
    // 1. Korti memesan slot DEF untuk besok
    const kortiBooking = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
      notes: 'Kuliah Pemrograman Web',
    });
    expect(kortiBooking.success).toBe(true);

    // 2. Staf melakukan force takeover pada slot DEF
    const forceResult = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'Ujian Sidang Tugas Akhir Bersama Penguji Eksternal',
    });

    expect(forceResult.success).toBe(true);
    if (forceResult.success) {
      expect(forceResult.data.bookings.length).toBe(3);
      expect(forceResult.data.displacedBookings.length).toBe(3);
      expect(forceResult.data.displacedBookings[0]!.userJid).toBe(testKortiJid);
      expect(forceResult.data.displacedBookings[0]!.userName).toBe('Wayan Korti Test');

      // Verifikasi di basis data bahwa record lama berubah status menjadi force_cancelled
      const allRows = await db
        .select()
        .from(bookings)
        .where(eq(bookings.roomCode, testRoomCode))
        .all();

      const activeRows = allRows.filter((r) => r.status === 'active');
      const forceCancelledRows = allRows.filter((r) => r.status === 'force_cancelled');

      expect(activeRows.length).toBe(3);
      expect(activeRows.every((r) => r.userJid === testStaffJid)).toBe(true);
      expect(activeRows.every((r) => r.bookingType === 'institutional')).toBe(true);

      expect(forceCancelledRows.length).toBe(3);
      expect(forceCancelledRows.every((r) => r.userJid === testKortiJid)).toBe(true);
      expect(forceCancelledRows.every((r) => r.notes?.includes('FORCE OVERRIDE'))).toBe(true);
    }
  });

  it('should reject force booking when caller is a Korti (non-staff/admin) with FORBIDDEN_ROLE', async () => {
    const result = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
      reason: 'Ingin mengambil alih ruangan',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.FORBIDDEN_ROLE);
      expect(result.error.userMessage).toContain('hanya dapat dieksekusi oleh Staf atau Admin');
    }
  });

  it('should reject force booking if reason is missing or too short', async () => {
    const result = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'a',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
      expect(result.error.userMessage).toContain('Alasan pengambilalihan');
    }
  });

  it('should reject force booking if slot is already booked by another Staff/Admin (institutional)', async () => {
    // 1. Staf A force book slot DEF
    const firstResult = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'Agenda Rapat Senat',
    });
    expect(firstResult.success).toBe(true);

    // 2. Staf B mencoba menimpa slot DEF
    const secondResult = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: otherStaffJid,
      reason: 'Agenda Rapat Jurusan',
    });

    expect(secondResult.success).toBe(false);
    if (!secondResult.success) {
      expect(secondResult.error.code).toBe(ErrorCode.SLOT_CONFLICT);
      expect(secondResult.error.userMessage).toContain('sudah dipesan untuk agenda institusi oleh staf/admin lain');
    }
  });

  it('should reject force booking if slot is blocked by campus force_events', async () => {
    // Buat force_events resmi kampus
    await db.insert(forceEvents).values({
      eventName: 'Dies Natalis Undiksha',
      roomCode: testRoomCode,
      startDate: tomorrowIso,
      endDate: tomorrowIso,
      slotCode: 'DEF',
      createdByJid: testStaffJid,
      status: 'active',
    });

    const result = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: otherStaffJid,
      reason: 'Ujian Kuliah Susulan',
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.SLOT_CONFLICT);
      expect(result.error.userMessage).toContain('sedang diblokir untuk agenda resmi institusi');
    }
  });

  it('should handle idempotent duplicate when same staff force books identical slot', async () => {
    const firstResult = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'Agenda Akreditasi Program Studi',
    });
    expect(firstResult.success).toBe(true);

    const duplicateResult = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'Agenda Akreditasi Program Studi',
    });

    expect(duplicateResult.success).toBe(true);
    if (duplicateResult.success) {
      expect(duplicateResult.data.isDuplicate).toBe(true);
    }
  });
});
