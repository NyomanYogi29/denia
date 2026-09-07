import { defineRelations, sql } from 'drizzle-orm';
import * as p from 'drizzle-orm/sqlite-core';

/**
 * Tabel `rooms`
 * Menyimpan master data gedung dan ruangan perkuliahan SDP Undiksha.
 */
export const rooms = p.sqliteTable('rooms', {
  code: p.text('code').primaryKey(), // e.g. 'RAK_1.1', 'RAK_2.1', 'KHD_HYBRID'
  building: p.text('building').notNull(), // e.g. 'Gedung R.A. Kartini', 'Ki Hajar Dewantara'
  floor: p.integer('floor'), // Lantai gedung (1, 2, 3, 4)
  roomName: p.text('room_name').notNull(), // e.g. 'Ruang 1.1', 'Lab Hybrid'
  capacity: p.integer('capacity').default(40),
  isActive: p.integer('is_active', { mode: 'boolean' }).notNull().default(true), // 1 = Aktif, 0 = Nonaktif
  createdAt: p.text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

/**
 * Tabel `users`
 * Menyimpan data pengguna terdaftar (korti, staff, admin) hasil seeder spreadsheet.
 * Diidentifikasi unik oleh WhatsApp JID pengirim. Parameter NIM ditiadakan sesuai spesifikasi V2.
 */
export const users = p.sqliteTable('users', {
  jid: p.text('jid').primaryKey(), // e.g. '628123456789@s.whatsapp.net'
  nama: p.text('nama').notNull(),
  fakultas: p.text('fakultas'), // e.g. 'FBS', 'FIP', 'FTK'
  prodi: p.text('prodi'), // e.g. 'PBI', 'PGSD', 'PTI', 'SI'
  semester: p.integer('semester'), // 1, 3, 5, 7
  kelas: p.text('kelas').notNull(), // e.g. 'H', '3DPS', '5A'
  noTelp: p.text('no_telp').notNull(), // Format asli nomor HP
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
    roomCode: p.text('room_code')
      .notNull()
      .references(() => rooms.code, { onDelete: 'cascade' }),
    bookingDate: p.text('booking_date').notNull(), // Format ISO: 'YYYY-MM-DD'
    slotCode: p.text('slot_code').notNull(), // e.g. 'D', 'E', 'F' (disimpan per 1 unit SKS)
    userJid: p.text('user_jid')
      .notNull()
      .references(() => users.jid, { onDelete: 'cascade' }),
    status: p.text('status', { enum: ['active', 'force_cancelled', 'cancelled'] })
      .notNull()
      .default('active'),
    bookingType: p.text('booking_type', { enum: ['regular', 'adhoc', 'institutional'] })
      .notNull()
      .default('adhoc'),
    notes: p.text('notes'),
    createdAt: p.text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    // Unique index untuk mencegah race-condition double booking pada ruangan, tanggal, slot, dan status
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
    roomCode: p.text('room_code')
      .notNull()
      .references(() => rooms.code, { onDelete: 'cascade' }),
    startDate: p.text('start_date').notNull(), // 'YYYY-MM-DD'
    endDate: p.text('end_date').notNull(), // 'YYYY-MM-DD'
    slotCode: p.text('slot_code'), // null = sepanjang hari, atau spesifik slot e.g. 'DEF'
    createdByJid: p.text('created_by_jid')
      .notNull()
      .references(() => users.jid, { onDelete: 'cascade' }),
    status: p.text('status', { enum: ['active', 'cancelled'] })
      .notNull()
      .default('active'),
    createdAt: p.text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    p.index('idx_force_events_rooms_date').on(table.roomCode, table.startDate, table.endDate),
    p.index('idx_force_events_creator').on(table.createdByJid),
  ]
);

/**
 * Drizzle Relations (Drizzle v1 defineRelations API)
 */
export const relations = defineRelations({ rooms, users, bookings, forceEvents }, (r) => ({
  rooms: {
    bookings: r.many.bookings(),
    forceEvents: r.many.forceEvents(),
  },
  users: {
    bookings: r.many.bookings(),
    forceEvents: r.many.forceEvents(),
  },
  bookings: {
    room: r.one.rooms({
      from: r.bookings.roomCode,
      to: r.rooms.code,
    }),
    user: r.one.users({
      from: r.bookings.userJid,
      to: r.users.jid,
    }),
  },
  forceEvents: {
    room: r.one.rooms({
      from: r.forceEvents.roomCode,
      to: r.rooms.code,
    }),
    creator: r.one.users({
      from: r.forceEvents.createdByJid,
      to: r.users.jid,
    }),
  },
}));

export type Room = typeof rooms.$inferSelect;
export type NewRoom = typeof rooms.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;

export type ForceEvent = typeof forceEvents.$inferSelect;
export type NewForceEvent = typeof forceEvents.$inferInsert;

export type UserRole = 'korti' | 'staff' | 'admin';
export type BookingStatus = 'active' | 'force_cancelled' | 'cancelled';
export type BookingType = 'regular' | 'adhoc' | 'institutional';
export type ForceEventStatus = 'active' | 'cancelled';
