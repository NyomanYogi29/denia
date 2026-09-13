import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, forceEvents, users } from '@/core/db/index.ts';
import { forceBookingUseCase } from '@/core/features/force/index.ts';
import { createBookingUseCase } from '@/core/features/booking/index.ts';
import {
  abortForceBookingUseCase,
  abortForceEventUseCase,
} from '@/core/features/abort/index.ts';
import { createForceEventUseCase } from '@/core/features/force-event/index.ts';
import { ErrorCode } from '@/core/errors/index.ts';
import { getTodayIso, getTomorrowIso, isoToDateString } from '@/core/utils/index.ts';

describe('Abort Force Use Case (src/core/features/abort/abort-force.usecase.ts)', () => {
  const testKortiJid = '628123456789@s.whatsapp.net';
  const testStaffJid = '628987654321@s.whatsapp.net';
  const otherStaffJid = '628555666777@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';

  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();
  const todayFormatted = isoToDateString(todayIso).success
    ? (isoToDateString(todayIso) as any).data
    : '13/09/2026';
  const tomorrowFormatted = isoToDateString(tomorrowIso).success
    ? (isoToDateString(tomorrowIso) as any).data
    : '14/09/2026';

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

    // Masukkan Admin terdaftar
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

  it('harus menolak pembatalan jika nomor pengirim belum terdaftar', async () => {
    const res = await abortForceBookingUseCase({
      id: 999,
      userJid: '628000111222@s.whatsapp.net',
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe(ErrorCode.UNAUTHORIZED_USER);
    }
  });

  it('harus menolak pembatalan jika dieksekusi oleh Korti (bukan staff/admin)', async () => {
    const res = await abortForceBookingUseCase({
      id: 999,
      userJid: testKortiJid,
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe(ErrorCode.FORBIDDEN_ROLE);
    }
  });

  it('harus menolak jika ID booking tidak ditemukan di database', async () => {
    const res = await abortForceBookingUseCase({
      id: 99999,
      userJid: testStaffJid,
    });

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.code).toBe(ErrorCode.NOT_FOUND);
    }
  });

  it('harus menolak pembatalan jika target booking bukan bertipe institutional (misal booking reguler)', async () => {
    // Buat booking reguler oleh Korti
    const bookRes = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'D',
      userJid: testKortiJid,
    });
    expect(bookRes.success).toBe(true);
    if (!bookRes.success) return;

    const kortiBookingId = bookRes.data.bookings[0]!.id;

    // Staf mencoba meng-abort booking reguler menggunakan abort force
    const abortRes = await abortForceBookingUseCase({
      id: kortiBookingId,
      userJid: testStaffJid,
    });

    expect(abortRes.success).toBe(false);
    if (!abortRes.success) {
      expect(abortRes.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
      expect(abortRes.error.userMessage).toContain('bukan merupakan peminjaman paksa/institusional');
    }
  });

  it('harus berhasil membatalkan pengambilalihan paksa dan mendeteksi seluruh slot terkait dalam sesi force', async () => {
    // 1. Buat force booking multi-slot (DEF) oleh Staf
    const forceRes = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'Ujian Sidang Skripsi',
    });
    expect(forceRes.success).toBe(true);
    if (!forceRes.success) return;

    const bookingIds = forceRes.data.bookings.map((b) => b.id);
    expect(bookingIds.length).toBe(3);

    // 2. Admin membatalkan dengan hanya memasukkan ID pertama (#bookingIds[0])
    const abortRes = await abortForceBookingUseCase({
      id: bookingIds[0]!,
      userJid: otherStaffJid, // Dibatalkan oleh admin lain
    });

    expect(abortRes.success).toBe(true);
    if (!abortRes.success) return;

    const details = abortRes.data;
    expect(details.room.code).toBe(testRoomCode);
    expect(details.slot.raw).toBe('DEF');
    expect(details.isDuplicate).toBe(false);
    expect(details.bookings.length).toBe(3);

    // Periksa status di database: seluruh 3 booking harus berstatus 'cancelled'
    for (const b of details.bookings) {
      expect(b.status).toBe('cancelled');
      expect(b.notes).toContain('ABORTED BY');
    }
  });

  it('harus mengembalikan data korti terdampak (displacedKorti) saat force dibatalkan', async () => {
    // 1. Korti meminjam slot D terlebih dahulu
    const kortiBook = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'D',
      userJid: testKortiJid,
    });
    expect(kortiBook.success).toBe(true);

    // 2. Staf mengambil alih secara paksa (slot DEF) -> slot D milik korti digeser (force_cancelled)
    const forceRes = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'Agenda Rapat Senat',
    });
    expect(forceRes.success).toBe(true);
    if (!forceRes.success) return;
    expect(forceRes.data.displacedBookings.length).toBe(1);

    const firstForceId = forceRes.data.bookings[0]!.id;

    // 3. Staf membatalkan pengambilalihan paksa
    const abortRes = await abortForceBookingUseCase({
      id: firstForceId,
      userJid: testStaffJid,
    });

    expect(abortRes.success).toBe(true);
    if (!abortRes.success) return;

    // Displaced Korti harus teridentifikasi agar bot dapat mengirimkan DM pemberitahuan
    expect(abortRes.data.displacedKorti.length).toBe(1);
    expect(abortRes.data.displacedKorti[0]!.userJid).toBe(testKortiJid);
    expect(abortRes.data.displacedKorti[0]!.slotCode).toBe('D');
  });

  it('harus menangani pembatalan berulang secara idempoten (isDuplicate: true)', async () => {
    const forceRes = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'A',
      userJid: testStaffJid,
      reason: 'Agenda Pimpinan',
    });
    expect(forceRes.success).toBe(true);
    if (!forceRes.success) return;

    const bookingId = forceRes.data.bookings[0]!.id;

    // Abort pertama
    const abort1 = await abortForceBookingUseCase({
      id: bookingId,
      userJid: testStaffJid,
    });
    expect(abort1.success).toBe(true);
    if (!abort1.success) return;
    expect(abort1.data.isDuplicate).toBe(false);

    // Abort kedua kali dengan ID yang sama
    const abort2 = await abortForceBookingUseCase({
      id: bookingId,
      userJid: testStaffJid,
    });
    expect(abort2.success).toBe(true);
    if (!abort2.success) return;
    expect(abort2.data.isDuplicate).toBe(true);
  });

  it('harus berhasil membatalkan agenda force event kampus (abortForceEventUseCase)', async () => {
    // 1. Buat force event
    const eventRes = await createForceEventUseCase({
      roomCodes: [testRoomCode],
      startDate: tomorrowFormatted,
      endDate: tomorrowFormatted,
      eventName: 'Ujian Sertifikasi Internasional',
      userJid: testStaffJid,
    });
    expect(eventRes.success).toBe(true);
    if (!eventRes.success) return;

    const eventId = eventRes.data.events[0]!.id;

    // 2. Batalkan force event
    const abortEventRes = await abortForceEventUseCase({
      eventId,
      userJid: testStaffJid,
    });

    expect(abortEventRes.success).toBe(true);
    if (!abortEventRes.success) return;

    expect(abortEventRes.data.eventName).toBe('Ujian Sertifikasi Internasional');
    expect(abortEventRes.data.events[0]!.status).toBe('cancelled');
    expect(abortEventRes.data.isDuplicate).toBe(false);

    // 3. Abort ulang idempoten
    const abortRepeat = await abortForceEventUseCase({
      eventId,
      userJid: testStaffJid,
    });
    expect(abortRepeat.success).toBe(true);
    if (!abortRepeat.success) return;
    expect(abortRepeat.data.isDuplicate).toBe(true);
  });
});
