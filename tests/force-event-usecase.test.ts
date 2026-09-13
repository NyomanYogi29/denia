import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq, inArray } from 'drizzle-orm';
import { db, bookings, forceEvents, users } from '@/core/db/index.ts';
import { forceEventUseCase } from '@/core/features/force-event/index.ts';
import { createBookingUseCase } from '@/core/features/booking/index.ts';
import { ErrorCode } from '@/core/errors/index.ts';
import { getTodayIso, getTomorrowIso, isoToDateString } from '@/core/utils/index.ts';

describe('Force Event Use Case (src/core/features/force-event/force-event.usecase.ts)', () => {
  const testKortiJid = '628123456789@s.whatsapp.net';
  const testStaffJid = '628987654321@s.whatsapp.net';
  const otherStaffJid = '628555666777@s.whatsapp.net';
  const room1 = 'RAK_1.1';
  const room2 = 'RAK_2.1';

  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();
  const todayFormatted = isoToDateString(todayIso).success ? (isoToDateString(todayIso) as any).data : '13/09/2026';
  const tomorrowFormatted = isoToDateString(tomorrowIso).success ? (isoToDateString(tomorrowIso) as any).data : '14/09/2026';

  // Buat tanggal H+2 untuk pengujian rentang
  const [tYear, tMonth, tDay] = tomorrowIso.split('-').map(Number);
  const nextDate = new Date(tYear!, tMonth! - 1, tDay! + 1);
  const nYear = nextDate.getFullYear();
  const nMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
  const nDay = String(nextDate.getDate()).padStart(2, '0');
  const dayAfterTomorrowIso = `${nYear}-${nMonth}-${nDay}`;
  const dayAfterTomorrowFormatted = `${nDay}/${nMonth}/${nYear}`;


  beforeEach(async () => {
    // Bersihkan data tes
    await db.delete(bookings).where(inArray(bookings.roomCode, [room1, room2]));
    await db.delete(forceEvents).where(inArray(forceEvents.roomCode, [room1, room2]));
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

    // Masukkan Staf kedua / Admin
    await db.insert(users).values({
      jid: otherStaffJid,
      nama: 'Koordinator Kampus',
      fakultas: null,
      prodi: null,
      semester: null,
      kelas: 'Admin SDP',
      noTelp: '08555666777',
      role: 'admin',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(inArray(bookings.roomCode, [room1, room2]));
    await db.delete(forceEvents).where(inArray(forceEvents.roomCode, [room1, room2]));
    await db.delete(users).where(eq(users.jid, testKortiJid));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, otherStaffJid));
  });

  it('should successfully block multiple rooms for a date range when rooms are empty', async () => {
    const result = await forceEventUseCase({
      roomCodes: `${room1},${room2}`,
      dateRange: `${tomorrowFormatted}-${dayAfterTomorrowFormatted}`,
      eventName: 'Seminar Nasional Teknologi Informasi',
      userJid: testStaffJid,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.rooms.length).toBe(2);
      expect(result.data.rooms.map((r) => r.code).sort()).toEqual([room1, room2].sort());
      expect(result.data.dateRange.isSingleDay).toBe(false);
      expect(result.data.events.length).toBe(2);
      expect(result.data.events.every((e) => e.status === 'active')).toBe(true);
      expect(result.data.events.every((e) => e.slotCode === null)).toBe(true);
      expect(result.data.displacedBookings.length).toBe(0);
    }
  });

  it('should support single day events where start date equals end date', async () => {
    const result = await forceEventUseCase({
      roomCodes: [room1],
      dateRange: tomorrowFormatted,
      eventName: 'Workshop Kurikulum Baru',
      userJid: testStaffJid,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.dateRange.isSingleDay).toBe(true);
      expect(result.data.dateRange.startDate.iso).toBe(result.data.dateRange.endDate.iso);
      expect(result.data.events.length).toBe(1);
    }
  });

  it('should override active Korti bookings across multiple rooms and dates and mark them as force_cancelled', async () => {
    // 1. Korti meminjam slot di room1 besok
    const booking1 = await createBookingUseCase({
      roomCode: room1,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
      notes: 'Kuliah Algoritma',
    });
    expect(booking1.success).toBe(true);

    // 2. Korti meminjam slot di room2 lusa
    const booking2 = await createBookingUseCase({
      roomCode: room2,
      date: dayAfterTomorrowFormatted,
      slotCode: 'AB',
      userJid: testKortiJid,
      notes: 'Kuliah Basis Data',
    });
    expect(booking2.success).toBe(true);

    // 3. Staf membuat force event yang meliputi room1 dan room2 dari besok s.d. lusa
    const eventResult = await forceEventUseCase({
      roomCodes: `${room1}, ${room2}`,
      dateRange: `${tomorrowFormatted} - ${dayAfterTomorrowFormatted}`,
      eventName: 'Ujian Akhir Semester Bersama',
      userJid: testStaffJid,
    });

    expect(eventResult.success).toBe(true);
    if (eventResult.success) {
      expect(eventResult.data.displacedBookings.length).toBe(5); // 3 slots DEF + 2 slots AB
      expect(eventResult.data.displacedBookings.every((d) => d.userJid === testKortiJid)).toBe(true);

      // Verifikasi di basis data bahwa booking lama berubah status menjadi force_cancelled
      const allBookings = await db
        .select()
        .from(bookings)
        .where(inArray(bookings.roomCode, [room1, room2]))
        .all();

      expect(allBookings.length).toBe(5);
      expect(allBookings.every((b) => b.status === 'force_cancelled')).toBe(true);
      expect(allBookings.every((b) => b.notes?.includes('FORCE EVENT: Ujian Akhir Semester Bersama'))).toBe(true);
    }
  });

  it('should reject force event when caller is Korti (non-staff/admin) with FORBIDDEN_ROLE', async () => {
    const result = await forceEventUseCase({
      roomCodes: room1,
      dateRange: tomorrowFormatted,
      eventName: 'Acara Himpunan Mahasiswa',
      userJid: testKortiJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.FORBIDDEN_ROLE);
      expect(result.error.userMessage).toContain('hanya dapat dieksekusi oleh Staf atau Admin');
    }
  });

  it('should reject force event if any room code is invalid with ROOM_NOT_FOUND', async () => {
    const result = await forceEventUseCase({
      roomCodes: `${room1}, RUANG_PALSU`,
      dateRange: tomorrowFormatted,
      eventName: 'Acara Kampus',
      userJid: testStaffJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.ROOM_NOT_FOUND);
      expect(result.error.userMessage).toContain('RUANG_PALSU');
    }
  });

  it('should reject force event if event name is too short', async () => {
    const result = await forceEventUseCase({
      roomCodes: room1,
      dateRange: tomorrowFormatted,
      eventName: 'ab',
      userJid: testStaffJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
      expect(result.error.userMessage).toContain('Nama agenda');
    }
  });

  it('should reject force event if start date is after end date', async () => {
    const result = await forceEventUseCase({
      roomCodes: room1,
      dateRange: `${dayAfterTomorrowFormatted}-${tomorrowFormatted}`,
      eventName: 'Acara Kampus',
      userJid: testStaffJid,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      expect(result.error.userMessage).toContain('tidak boleh lebih besar');
    }
  });

  it('should reject force event if another active event overlaps with requested room and dates', async () => {
    // 1. Buat event pertama
    const firstResult = await forceEventUseCase({
      roomCodes: room1,
      dateRange: `${tomorrowFormatted}-${dayAfterTomorrowFormatted}`,
      eventName: 'Dies Natalis Undiksha',
      userJid: testStaffJid,
    });
    expect(firstResult.success).toBe(true);

    // 2. Buat event kedua yang bertabrakan di room1
    const secondResult = await forceEventUseCase({
      roomCodes: `${room1},${room2}`,
      dateRange: tomorrowFormatted,
      eventName: 'Rapat Senat Terbuka',
      userJid: otherStaffJid,
    });

    expect(secondResult.success).toBe(false);
    if (!secondResult.success) {
      expect(secondResult.error.code).toBe(ErrorCode.SLOT_CONFLICT);
      expect(secondResult.error.userMessage).toContain('Dies Natalis Undiksha');
    }
  });

  it('should handle idempotent duplicate when same staff creates identical event on same rooms and dates', async () => {
    const firstResult = await forceEventUseCase({
      roomCodes: `${room1},${room2}`,
      dateRange: tomorrowFormatted,
      eventName: 'Akreditasi Program Studi Internasional',
      userJid: testStaffJid,
    });
    expect(firstResult.success).toBe(true);

    const duplicateResult = await forceEventUseCase({
      roomCodes: `${room1},${room2}`,
      dateRange: tomorrowFormatted,
      eventName: 'Akreditasi Program Studi Internasional',
      userJid: testStaffJid,
    });

    expect(duplicateResult.success).toBe(true);
    if (duplicateResult.success) {
      expect(duplicateResult.data.isDuplicate).toBe(true);
    }
  });
});
