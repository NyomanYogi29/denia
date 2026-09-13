import { isoToDateString } from '@/core/utils/date.ts';
import { compressSlotList } from './availability-matrix.ts';

export interface DisplacedBookingItem {
  readonly roomCode: string;
  readonly date: string;
  readonly slotCode: string;
}

export interface ForceEventDisplacedDmOptions {
  readonly recipientName?: string;
  readonly recipientClass?: string;
  readonly eventName: string;
  readonly staffName: string;
  readonly items: readonly DisplacedBookingItem[];
}

export interface ForceEventSuccessAnnouncementOptions {
  readonly eventName: string;
  readonly roomCodes: readonly string[];
  readonly dateRangeText: string;
  readonly staffName: string;
  readonly displacedCount: number;
}

/**
 * Format notifikasi DM pribadi (Japri) untuk Korti yang peminjamannya tergeser akibat blokir force_event institusi.
 */
export function formatForceEventDisplacedDm(options: ForceEventDisplacedDmOptions): string {
  const { recipientName, recipientClass, eventName, staffName, items } = options;

  const recipientGreeting = recipientName
    ? `Halo *${recipientName}*${recipientClass ? ` (${recipientClass})` : ''},`
    : 'Halo Korti,';

  // Kelompokkan pemesanan per ruangan dan tanggal agar slot dapat dikompresi (contoh: Slot DEF)
  const grouped = new Map<string, { roomCode: string; date: string; slots: string[] }>();
  for (const item of items) {
    const key = `${item.roomCode}:${item.date}`;
    const entry = grouped.get(key);
    if (entry) {
      entry.slots.push(item.slotCode);
    } else {
      grouped.set(key, { roomCode: item.roomCode, date: item.date, slots: [item.slotCode] });
    }
  }

  const scheduleList = Array.from(grouped.values())
    .map((g) => {
      const formattedDate = isoToDateString(g.date).success
        ? (isoToDateString(g.date) as any).data
        : g.date;
      const compressedSlots = compressSlotList(g.slots);
      return `• ${g.roomCode} | ${formattedDate} | Slot ${compressedSlots}`;
    })
    .join('\n');


  return [
    '🚨 *PEMBERITAHUAN PENGAMBILALIHAN RUANGAN AGENDA KAMPUS* 🚨',
    '',
    `${recipientGreeting} mohon perhatiannya:`,
    'Peminjaman ruangan Anda telah *dibatalkan secara resmi* karena ruangan dialokasikan untuk agenda institusional kampus:',
    '',
    `📋 *Nama Acara*: ${eventName}`,
    `👤 *Penanggung Jawab*: ${staffName}`,
    '',
    '📍 *Pemesanan Terdampak*:',
    scheduleList,
    '',
    '💡 *Langkah Selanjutnya*:',
    'Silakan ketik *!info* untuk memeriksa ketersediaan jadwal ruangan lain dan melakukan pemesanan ulang.',
    '',
    '────────────────────────',
    '_Pesan ini dikirimkan otomatis oleh bot SDP Undiksha via jalur pribadi._',
  ].join('\n');
}

/**
 * Format pengumuman resmi pemblokiran ruangan (force event) untuk grup/chat WhatsApp.
 */
export function formatForceEventSuccessAnnouncement(
  options: ForceEventSuccessAnnouncementOptions
): string {
  const { eventName, roomCodes, dateRangeText, staffName, displacedCount } = options;

  const displacedNotice =
    displacedCount > 0
      ? `\n⚠️ *Catatan*: ${displacedCount} peminjaman sebelumnya telah digeser dan korti terkait telah dinotifikasi via Japri (DM).`
      : '';

  return [
    '🏛️ *PEMBLOKIRAN RUANGAN AGENDA KAMPUS*',
    '',
    `Telah dijadwalkan agenda resmi institusi kampus:`,
    '',
    `📋 *Nama Acara*: ${eventName}`,
    `📍 *Ruangan*: ${roomCodes.join(', ')}`,
    `📅 *Rentang Waktu*: ${dateRangeText}`,
    `⏰ *Durasi*: Seharian Penuh (Slot A-O)`,
    `👤 *Penanggung Jawab*: ${staffName}`,
    displacedNotice,
  ]
    .filter((line) => line !== '')
    .join('\n');
}
