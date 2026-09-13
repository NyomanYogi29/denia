import { describe, expect, it } from 'bun:test';
import {
  formatBookingCell,
  formatForceBookingCell,
  formatForceEventCell,
  EMPTY_CELL_VALUE,
} from '../src/spreadsheets/formatter.ts';
import type { Booking, User } from '../src/core/db/schema.ts';

describe('Spreadsheets Formatter Module', () => {
  const dummyBooking: Booking = {
    id: 1,
    roomCode: 'RAK_2.1',
    bookingDate: '2026-09-14',
    slotCode: 'D',
    userJid: '628123456789@s.whatsapp.net',
    status: 'active',
    bookingType: 'regular',
    notes: null,
    createdAt: '2026-09-13 10:00:00',
  };

  const dummyKorti: User = {
    jid: '628123456789@s.whatsapp.net',
    nama: 'Kadek Lyradelia Pracili',
    fakultas: 'FTK',
    prodi: 'SI',
    semester: 3,
    kelas: '3DPS',
    noTelp: '08123456789',
    role: 'korti',
    createdAt: '2026-09-13 10:00:00',
  };

  it('should format Korti booking as [Prodi]/[Kelas]/[Nama]', () => {
    const formatted = formatBookingCell(dummyBooking, dummyKorti);
    expect(formatted).toBe('SI/3DPS/Kadek Lyradelia Pracili');
  });

  it('should format Korti booking when kelas does not prefix semester', () => {
    const userWithoutPrefix: User = {
      ...dummyKorti,
      semester: 5,
      kelas: 'G',
      prodi: 'Ilmu Hukum',
    };
    const formatted = formatBookingCell(dummyBooking, userWithoutPrefix);
    expect(formatted).toBe('Ilmu Hukum/5G/Kadek Lyradelia Pracili');
  });

  it('should format force booking by staff or institutional', () => {
    const forceBooking: Booking = {
      ...dummyBooking,
      bookingType: 'institutional',
      notes: 'Ujian Sidang Skripsi',
    };
    const formatted = formatBookingCell(forceBooking, dummyKorti);
    expect(formatted).toBe('[INSTITUSI] Ujian Sidang Skripsi');
  });

  it('should fallback to DIPINJAM when institutional notes is empty', () => {
    const forceBooking: Booking = {
      ...dummyBooking,
      bookingType: 'institutional',
      notes: null,
    };
    const formatted = formatBookingCell(forceBooking, null);
    expect(formatted).toBe('DIPINJAM');
  });

  it('should format force event correctly', () => {
    const formatted = formatForceEventCell('Seminar Nasional TI');
    expect(formatted).toBe('[ACARA] Seminar Nasional TI');
  });

  it('should define EMPTY_CELL_VALUE as empty string', () => {
    expect(EMPTY_CELL_VALUE).toBe('');
  });
});
