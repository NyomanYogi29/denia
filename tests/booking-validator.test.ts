import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, bookings, forceEvents, users, rooms } from '@/core/db';
import {
  checkSlotAvailability,
  createBookingImmediate,
} from '@/core/db/repositories/booking';
import { validateBookingRequest } from '@/core/validators/booking';
import { ErrorCode } from '@/core/errors';
import { getTodayIso, getTomorrowIso, isoToDateString } from '@/core/utils';

describe('Booking Repository & Availability Validator (Fase 5.1)', () => {
  const testUserJid = '628999888777@s.whatsapp.net';
  const testRoomCode = 'RAK_2.1';

  // Dapatkan tanggal hari ini dan besok (H-1) terpusat WITA
  const todayIso = getTodayIso();
  const tomorrowIso = getTomorrowIso();
  const todayFormatted = (isoToDateString(todayIso) as any).data ?? '13/09/2026';
  const tomorrowFormatted = (isoToDateString(tomorrowIso) as any).data ?? '14/09/2026';

  beforeEach(async () => {
    // Pastikan user terdaftar untuk foreign key
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testUserJid));

    await db.insert(users).values({
      jid: testUserJid,
      nama: 'Testing Korti User',
      kelas: '3DPS',
      noTelp: '08999888777',
      role: 'korti',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testUserJid));
  });

  describe('checkSlotAvailability & createBookingImmediate', () => {
    it('should report slot available when no bookings or events exist', async () => {
      const result = await checkSlotAvailability({
        roomCode: testRoomCode,
        bookingDate: tomorrowIso,
        slotCodes: ['D', 'E', 'F'],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.isAvailable).toBe(true);
        expect(result.data.conflictingBookings.length).toBe(0);
        expect(result.data.conflictingEvents.length).toBe(0);
      }
    });

    it('should create bookings atomically with createBookingImmediate', async () => {
      const createRes = await createBookingImmediate({
        roomCode: testRoomCode,
        bookingDate: tomorrowIso,
        slotCodes: ['D', 'E', 'F'],
        userJid: testUserJid,
      });

      expect(createRes.success).toBe(true);
      if (createRes.success) {
        expect(createRes.data.length).toBe(3);
        expect(createRes.data[0]!.slotCode).toBe('D');
        expect(createRes.data[1]!.slotCode).toBe('E');
        expect(createRes.data[2]!.slotCode).toBe('F');
      }

      // Periksa ketersediaan kembali, sekarang harus false
      const checkRes = await checkSlotAvailability({
        roomCode: testRoomCode,
        bookingDate: tomorrowIso,
        slotCodes: ['E'],
      });

      expect(checkRes.success).toBe(true);
      if (checkRes.success) {
        expect(checkRes.data.isAvailable).toBe(false);
        expect(checkRes.data.conflictingBookings.length).toBe(1);
      }
    });

    it('should reject createBookingImmediate when conflicting booking already exists', async () => {
      await createBookingImmediate({
        roomCode: testRoomCode,
        bookingDate: tomorrowIso,
        slotCodes: ['D', 'E'],
        userJid: testUserJid,
      });

      const duplicateRes = await createBookingImmediate({
        roomCode: testRoomCode,
        bookingDate: tomorrowIso,
        slotCodes: ['E', 'F'], // 'E' tabrakan
        userJid: testUserJid,
      });

      expect(duplicateRes.success).toBe(false);
      if (!duplicateRes.success) {
        expect(duplicateRes.error.code).toBe(ErrorCode.SLOT_CONFLICT);
      }
    });
  });

  describe('Integrated validateBookingRequest', () => {
    it('should validate and approve a valid booking request for Korti on tomorrow', async () => {
      const validRes = await validateBookingRequest({
        roomCodeRaw: 'rak_2.1',
        dateRaw: tomorrowFormatted,
        slotCodeRaw: 'def',
        userRole: 'korti',
      });

      expect(validRes.success).toBe(true);
      if (validRes.success) {
        expect(validRes.data.room.code).toBe('RAK_2.1');
        expect(validRes.data.date.iso).toBe(tomorrowIso);
        expect(validRes.data.slot.slots).toEqual(['D', 'E', 'F']);
        expect(validRes.data.slot.timeRange).toBe('10:30 - 13:20');
      }
    });

    it('should reject booking for Korti on the same day (hari H) with INVALID_BOOKING_LEAD_TIME', async () => {
      const sameDayRes = await validateBookingRequest({
        roomCodeRaw: 'RAK_2.1',
        dateRaw: todayFormatted,
        slotCodeRaw: 'DEF',
        userRole: 'korti',
      });

      expect(sameDayRes.success).toBe(false);
      if (!sameDayRes.success) {
        expect(sameDayRes.error.code).toBe(ErrorCode.INVALID_BOOKING_LEAD_TIME);
      }
    });

    it('should allow booking for Staff on the same day (hari H)', async () => {
      const staffRes = await validateBookingRequest({
        roomCodeRaw: 'RAK_2.1',
        dateRaw: todayFormatted,
        slotCodeRaw: 'DEF',
        userRole: 'staff',
      });

      expect(staffRes.success).toBe(true);
    });

    it('should reject non-contiguous slot sequences with INVALID_SLOT_SEQUENCE', async () => {
      const nonContigRes = await validateBookingRequest({
        roomCodeRaw: 'RAK_2.1',
        dateRaw: tomorrowFormatted,
        slotCodeRaw: 'ADF', // lompat
        userRole: 'korti',
      });

      expect(nonContigRes.success).toBe(false);
      if (!nonContigRes.success) {
        expect(nonContigRes.error.code).toBe(ErrorCode.INVALID_SLOT_SEQUENCE);
      }
    });

    it('should reject bookings when slot is already reserved', async () => {
      // Isi slot terlebih dahulu
      await createBookingImmediate({
        roomCode: testRoomCode,
        bookingDate: tomorrowIso,
        slotCodes: ['D', 'E', 'F'],
        userJid: testUserJid,
      });

      const conflictRes = await validateBookingRequest({
        roomCodeRaw: 'RAK_2.1',
        dateRaw: tomorrowFormatted,
        slotCodeRaw: 'DEF',
        userRole: 'korti',
      });

      expect(conflictRes.success).toBe(false);
      if (!conflictRes.success) {
        expect(conflictRes.error.code).toBe(ErrorCode.SLOT_CONFLICT);
        expect(conflictRes.error.userMessage).toContain('sudah dipesan oleh kelas lain');
      }
    });

    it('should reject bookings when room is blocked by force event', async () => {
      await db.insert(forceEvents).values({
        eventName: 'Seminar Nasional FTK',
        roomCode: testRoomCode,
        startDate: tomorrowIso,
        endDate: tomorrowIso,
        slotCode: null, // Full day block
        createdByJid: testUserJid,
        status: 'active',
      });

      const eventConflictRes = await validateBookingRequest({
        roomCodeRaw: 'RAK_2.1',
        dateRaw: tomorrowFormatted,
        slotCodeRaw: 'DEF',
        userRole: 'korti',
      });

      expect(eventConflictRes.success).toBe(false);
      if (!eventConflictRes.success) {
        expect(eventConflictRes.error.code).toBe(ErrorCode.SLOT_CONFLICT);
        expect(eventConflictRes.error.userMessage).toContain('Seminar Nasional FTK');
      }
    });
  });
});
