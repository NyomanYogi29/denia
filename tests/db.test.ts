import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import {
  db,
  sqlite,
  users,
  bookings,
  rooms,
  createUser,
  findUserByJid,
  upsertUser,
  listUsers,
} from '@/core/db';

describe('Database & Schema Module (V2 Specification)', () => {
  const testJid = '628123456789@s.whatsapp.net';
  const testPhone = '08123456789';
  const testRoom = 'RAK_4.1';
  const testDate = '2026-09-10';
  const testSlot = 'D';

  it('should query registered rooms from database master table', async () => {
    const room = await db.select().from(rooms).where(eq(rooms.code, testRoom)).get();
    expect(room).toBeDefined();
    expect(room?.code).toBe(testRoom);
    expect(room?.building).toContain('Kartini');
  });

  it('should insert or update a registered user in database (V2 without NIM)', async () => {
    // Bersihkan data tes jika ada
    await db.delete(bookings).where(eq(bookings.roomCode, testRoom));
    await db.delete(users).where(eq(users.jid, testJid));

    await db.insert(users).values({
      jid: testJid,
      nama: 'I Putu Test Korti',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 4,
      kelas: 'PTI 4A',
      noTelp: testPhone,
      role: 'korti',
    });

    const user = await db.select().from(users).where(eq(users.jid, testJid)).get();
    expect(user).toBeDefined();
    expect(user?.nama).toBe('I Putu Test Korti');
    expect(user?.fakultas).toBe('FTK');
    expect(user?.prodi).toBe('PTI');
    expect(user?.semester).toBe(4);
    expect(user?.noTelp).toBe(testPhone);
    expect(user?.role).toBe('korti');
  });

  it('should insert a booking successfully with bookingType and FK relations', async () => {
    await db.insert(bookings).values({
      roomCode: testRoom,
      bookingDate: testDate,
      slotCode: testSlot,
      userJid: testJid,
      status: 'active',
      bookingType: 'adhoc',
    });

    const booking = await db.select().from(bookings).where(eq(bookings.roomCode, testRoom)).get();
    expect(booking).toBeDefined();
    expect(booking?.slotCode).toBe(testSlot);
    expect(booking?.status).toBe('active');
    expect(booking?.bookingType).toBe('adhoc');
  });

  it('should prevent double booking via unique index (conflict prevention)', async () => {
    const tryDuplicateBooking = () => {
      sqlite.run(
        `INSERT INTO bookings (room_code, booking_date, slot_code, user_jid, status, booking_type) 
         VALUES ('${testRoom}', '${testDate}', '${testSlot}', '${testJid}', 'active', 'adhoc')`
      );
    };

    expect(tryDuplicateBooking).toThrow(/UNIQUE constraint failed/);

    // Cleanup data tes
    await db.delete(bookings).where(eq(bookings.roomCode, testRoom));
    await db.delete(users).where(eq(users.jid, testJid));
  });

  describe('Core User Repository (src/core/db/repositories/user.repository.ts)', () => {
    const repoJid = '6287766554433@s.whatsapp.net';

    it('should create and find user via repository functions', async () => {
      await db.delete(users).where(eq(users.jid, repoJid));

      const createResult = await createUser({
        jid: repoJid,
        nama: 'Kadek Repo User',
        fakultas: 'FTK',
        prodi: 'SI',
        semester: 2,
        kelas: 'SI 2A',
        noTelp: '6287766554433',
        role: 'korti',
      });

      expect(createResult.success).toBe(true);
      if (createResult.success) {
        expect(createResult.data.nama).toBe('Kadek Repo User');
        expect(createResult.data.prodi).toBe('SI');
      }

      const findResult = await findUserByJid(repoJid);
      expect(findResult.success).toBe(true);
      if (findResult.success) {
        expect(findResult.data?.nama).toBe('Kadek Repo User');
        expect(findResult.data?.kelas).toBe('SI 2A');
      }
    });

    it('should upsert existing user correctly (seeder compatibility)', async () => {
      const upsertResult = await upsertUser({
        jid: repoJid,
        nama: 'Kadek Repo User Updated',
        fakultas: 'FTK',
        prodi: 'SI',
        semester: 3,
        kelas: 'SI 3A',
        noTelp: '6287766554433',
        role: 'korti',
      });

      expect(upsertResult.success).toBe(true);
      if (upsertResult.success) {
        expect(upsertResult.data.nama).toBe('Kadek Repo User Updated');
        expect(upsertResult.data.semester).toBe(3);
        expect(upsertResult.data.kelas).toBe('SI 3A');
      }

      // Cleanup
      await db.delete(users).where(eq(users.jid, repoJid));
    });

    it('should return null when finding non-existent user JID', async () => {
      const notFoundResult = await findUserByJid('6280000000000@s.whatsapp.net');
      expect(notFoundResult.success).toBe(true);
      if (notFoundResult.success) {
        expect(notFoundResult.data).toBeNull();
      }
    });

    it('should list users with optional filters', async () => {
      const listResult = await listUsers({ role: 'korti' });
      expect(listResult.success).toBe(true);
      if (listResult.success) {
        expect(Array.isArray(listResult.data)).toBe(true);
      }
    });
  });
});
