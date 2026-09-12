import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, forceEvents, users } from '@/core/db';
import { createBookingUseCase, cancelBookingUseCase } from '@/core/features/booking';
import { ErrorCode } from '@/core/errors';
import { getTomorrowIso, isoToDateString } from '@/core/utils';

describe('Cancel Booking Use Case (src/core/features/booking/cancel-booking.usecase.ts)', () => {
  const kortiOwnerJid = '628123456789@s.whatsapp.net';
  const otherKortiJid = '628111222333@s.whatsapp.net';
  const adminJid = '628999888777@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';

  // Tanggal besok (H-1) terpusat WITA
  const tomorrowIso = getTomorrowIso();
  const tomorrowFormatted = (isoToDateString(tomorrowIso) as any).data ?? '14/09/2026';

  beforeEach(async () => {
    // Bersihkan data tes
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, kortiOwnerJid));
    await db.delete(users).where(eq(users.jid, otherKortiJid));
    await db.delete(users).where(eq(users.jid, adminJid));

    // Korti Pemilik
    await db.insert(users).values({
      jid: kortiOwnerJid,
      nama: 'Wayan Korti Pemilik',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 3,
      kelas: '3A',
      noTelp: '08123456789',
      role: 'korti',
    });

    // Korti Lain
    await db.insert(users).values({
      jid: otherKortiJid,
      nama: 'Ketut Korti Lain',
      fakultas: 'FTK',
      prodi: 'SI',
      semester: 3,
      kelas: '3B',
      noTelp: '08111222333',
      role: 'korti',
    });

    // Admin SDP
    await db.insert(users).values({
      jid: adminJid,
      nama: 'Admin Kampus SDP',
      fakultas: null,
      prodi: null,
      semester: null,
      kelas: 'Admin SDP',
      noTelp: '08999888777',
      role: 'admin',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, kortiOwnerJid));
    await db.delete(users).where(eq(users.jid, otherKortiJid));
    await db.delete(users).where(eq(users.jid, adminJid));
  });

  it('should allow booking owner (Korti) to cancel their own active booking', async () => {
    // 1. Pesan ruangan terlebih dahulu
    const bookResult = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: kortiOwnerJid,
    });
    expect(bookResult.success).toBe(true);

    // 2. Batalkan pemesanan oleh Korti pemilik
    const cancelResult = await cancelBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: kortiOwnerJid,
    });

    expect(cancelResult.success).toBe(true);
    if (cancelResult.success) {
      expect(cancelResult.data.room.code).toBe(testRoomCode);
      expect(cancelResult.data.slot.raw).toBe('DEF');
      expect(cancelResult.data.cancelledBookings.length).toBe(3);
      expect(cancelResult.data.cancelledBookings.every((b) => b.status === 'cancelled')).toBe(true);
      expect(cancelResult.data.isStaffOrAdmin).toBe(false);
    }

    // 3. Verifikasi slot yang telah dibatalkan kini dapat dipesan kembali
    const rebookResult = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: otherKortiJid,
    });
    expect(rebookResult.success).toBe(true);
  });

  it('should reject cancellation by another Korti who is not the booking owner with NOT_BOOKING_OWNER', async () => {
    // 1. Pesan ruangan oleh Korti Pemilik
    await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: kortiOwnerJid,
    });

    // 2. Coba batalkan oleh Korti Lain
    const cancelResult = await cancelBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: otherKortiJid,
    });

    expect(cancelResult.success).toBe(false);
    if (!cancelResult.success) {
      expect(cancelResult.error.code).toBe(ErrorCode.NOT_BOOKING_OWNER);
      expect(cancelResult.error.userMessage).toContain('pengguna lain');
    }
  });

  it('should allow Admin to cancel anyone booking', async () => {
    // 1. Pesan ruangan oleh Korti Pemilik
    await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: kortiOwnerJid,
    });

    // 2. Batalkan oleh Admin
    const cancelResult = await cancelBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: adminJid,
    });

    expect(cancelResult.success).toBe(true);
    if (cancelResult.success) {
      expect(cancelResult.data.isStaffOrAdmin).toBe(true);
      expect(cancelResult.data.cancelledBookings.every((b) => b.status === 'cancelled')).toBe(true);
    }
  });

  it('should return BOOKING_NOT_FOUND when trying to cancel non-existent or already cancelled booking', async () => {
    const cancelResult = await cancelBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: kortiOwnerJid,
    });

    expect(cancelResult.success).toBe(false);
    if (!cancelResult.success) {
      expect(cancelResult.error.code).toBe(ErrorCode.BOOKING_NOT_FOUND);
    }
  });

  it('should reject cancellation from unregistered user with UNAUTHORIZED', async () => {
    const unregisteredJid = '628000111222@s.whatsapp.net';
    const cancelResult = await cancelBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: unregisteredJid,
    });

    expect(cancelResult.success).toBe(false);
    if (!cancelResult.success) {
      expect(cancelResult.error.code).toBe(ErrorCode.UNAUTHORIZED);
    }
  });

  it('should reject cancellation with invalid input syntax via Zod schema', async () => {
    const cancelResult = await cancelBookingUseCase({
      roomCode: '',
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: kortiOwnerJid,
    });

    expect(cancelResult.success).toBe(false);
    if (!cancelResult.success) {
      expect(cancelResult.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
    }
  });
});
