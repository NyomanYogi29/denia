import { describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { db, sqlite, users, bookings } from '../src/db/index.ts';

describe('Database & Schema Module', () => {
  const testNim = '2315051099';
  const testJid = '628123456789@s.whatsapp.net';
  const testRoom = 'RAK_4.1';
  const testDate = '2026-09-10';
  const testSlot = 'D';

  it('should insert or update a registered user in database', async () => {
    // Bersihkan data tes jika ada
    await db.delete(bookings).where(eq(bookings.roomCode, testRoom));
    await db.delete(users).where(eq(users.jid, testJid));

    await db.insert(users).values({
      jid: testJid,
      nama: 'I Putu Test Korti',
      nim: testNim,
      kelas: 'PTI 4A',
      role: 'korti',
    });

    const user = await db.select().from(users).where(eq(users.nim, testNim)).get();
    expect(user).toBeDefined();
    expect(user?.nama).toBe('I Putu Test Korti');
    expect(user?.role).toBe('korti');
  });

  it('should insert a booking successfully', async () => {
    await db.insert(bookings).values({
      roomCode: testRoom,
      bookingDate: testDate,
      slotCode: testSlot,
      userJid: testJid,
      status: 'active',
    });

    const booking = await db.select().from(bookings).where(eq(bookings.roomCode, testRoom)).get();
    expect(booking).toBeDefined();
    expect(booking?.slotCode).toBe(testSlot);
    expect(booking?.status).toBe('active');
  });

  it('should prevent double booking via unique index (conflict prevention)', async () => {
    const tryDuplicateBooking = () => {
      sqlite.run(
        `INSERT INTO bookings (room_code, booking_date, slot_code, user_jid, status) 
         VALUES ('${testRoom}', '${testDate}', '${testSlot}', '${testJid}', 'active')`
      );
    };

    expect(tryDuplicateBooking).toThrow(/UNIQUE constraint failed/);

    // Cleanup data tes
    await db.delete(bookings).where(eq(bookings.roomCode, testRoom));
    await db.delete(users).where(eq(users.jid, testJid));
  });
});
