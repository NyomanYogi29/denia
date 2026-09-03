import { defineRelations, sql } from 'drizzle-orm';
import * as p from 'drizzle-orm/sqlite-core';

/**
 * Tabel `users`
 * Menyimpan data pengguna terdaftar (korti, staff, admin) yang diidentifikasi unik oleh JID WhatsApp.
 */
export const users = p.sqliteTable('users', {
  jid: p.text('jid').primaryKey(), // e.g. '628123456789@s.whatsapp.net'
  nama: p.text('nama').notNull(),
  nim: p.text('nim').notNull().unique(),
  kelas: p.text('kelas').notNull(), // e.g. 'PTI 4A'
  role: p.text('role', { enum: ['korti', 'staff', 'admin'] }).notNull().default('korti'),
  createdAt: p.text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Tabel `bookings`
 * Menyimpan data peminjaman ruangan per unit 1 SKS (slot A - O).
 */
export const bookings = p.sqliteTable(
  'bookings',
  {
    id: p.integer('id').primaryKey({ autoIncrement: true }),
    roomCode: p.text('room_code').notNull(), // e.g. 'RAK_4.1'
    bookingDate: p.text('booking_date').notNull(), // Format ISO: 'YYYY-MM-DD'
    slotCode: p.text('slot_code').notNull(), // e.g. 'D', 'E', 'F' (disimpan per 1 unit SKS)
    userJid: p.text('user_jid')
      .notNull()
      .references(() => users.jid, { onDelete: 'cascade' }),
    status: p.text('status', { enum: ['active', 'force_cancelled', 'cancelled'] })
      .notNull()
      .default('active'),
    notes: p.text('notes'),
    createdAt: p.text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // Unique index untuk mencegah race-condition double booking pada ruangan, tanggal, slot, dan status active
    p.uniqueIndex('idx_bookings_unique_active_slot').on(
      table.roomCode,
      table.bookingDate,
      table.slotCode,
      table.status
    ),
    p.index('idx_bookings_date_room').on(table.bookingDate, table.roomCode),
    p.index('idx_bookings_user').on(table.userJid),
  ]
);

/**
 * Tabel `force_events`
 * Menyimpan data pemblokiran ruangan untuk agenda kampus/institusional oleh staf/admin.
 */
export const forceEvents = p.sqliteTable(
  'force_events',
  {
    id: p.integer('id').primaryKey({ autoIncrement: true }),
    eventName: p.text('event_name').notNull(),
    roomCode: p.text('room_code').notNull(),
    startDate: p.text('start_date').notNull(), // 'YYYY-MM-DD'
    endDate: p.text('end_date').notNull(), // 'YYYY-MM-DD'
    slotCode: p.text('slot_code'), // null = sepanjang hari, atau spesifik slot e.g. 'DEF'
    createdByJid: p.text('created_by_jid')
      .notNull()
      .references(() => users.jid),
    status: p.text('status', { enum: ['active', 'cancelled'] })
      .notNull()
      .default('active'),
    createdAt: p.text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    p.index('idx_force_events_rooms_date').on(table.roomCode, table.startDate, table.endDate),
  ]
);

/**
 * Drizzle Relations (Drizzle v1 defineRelations API)
 */
export const relations = defineRelations({ users, bookings, forceEvents }, (r) => ({
  users: {
    bookings: r.many.bookings(),
    forceEvents: r.many.forceEvents(),
  },
  bookings: {
    user: r.one.users({
      from: r.bookings.userJid,
      to: r.users.jid,
    }),
  },
  forceEvents: {
    creator: r.one.users({
      from: r.forceEvents.createdByJid,
      to: r.users.jid,
    }),
  },
}));

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type ForceEvent = typeof forceEvents.$inferSelect;
export type NewForceEvent = typeof forceEvents.$inferInsert;
