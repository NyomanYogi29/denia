import type { Booking, User, ForceEvent } from '@/core/db/schema.ts';

/**
 * Memformat string teks sel untuk peminjaman ruangan oleh Korti
 * Standar format: [Prodi]/[Kelas]/[Nama]
 * Contoh: "SI/3DPS/Kadek Lyradelia Pracili" atau "Hukum/5G/A.A. Istri Agung"
 */
export function formatBookingCell(booking: Booking, user?: User | null): string {
  if (booking.bookingType === 'institutional' || !user || user.role !== 'korti') {
    return formatForceBookingCell(booking.notes);
  }

  const prodi = user.prodi?.trim() || 'UMUM';

  // Susun label kelas (misal semester 3 kelas DPS -> 3DPS, atau semester 5 kelas G -> 5G)
  let kelas = user.kelas?.trim() || '';
  if (user.semester && kelas && !kelas.startsWith(String(user.semester))) {
    kelas = `${user.semester}${kelas}`;
  } else if (!kelas && user.semester) {
    kelas = `SMT ${user.semester}`;
  }

  const nama = user.nama?.trim() || 'Korti';

  return `${prodi}/${kelas || '-'}/${nama}`;
}

/**
 * Memformat string teks sel untuk peminjaman institusi / pengambilalihan paksa staf
 */
export function formatForceBookingCell(notes?: string | null): string {
  const cleanNotes = notes?.trim();
  if (cleanNotes) {
    return `[INSTITUSI] ${cleanNotes}`;
  }
  return 'DIPINJAM';
}

/**
 * Memformat string teks sel untuk agenda pemblokiran event kampus
 */
export function formatForceEventCell(eventName: string): string {
  const cleanName = eventName.trim();
  return `[ACARA] ${cleanName}`;
}

/**
 * Nilai sel untuk slot yang kosong atau dibatalkan
 */
export const EMPTY_CELL_VALUE = '';
