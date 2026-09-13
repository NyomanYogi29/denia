import { compressSlotList } from './availability-matrix.ts';

export interface AbortForceSuccessAnnouncementOptions {
  readonly roomCode: string;
  readonly roomName: string;
  readonly date: string; // DD/MM/YYYY
  readonly slotCode: string;
  readonly timeRange: string;
  readonly reason: string;
  readonly staffName: string;
  readonly bookingIds: readonly number[];
  readonly displacedRestoredCount: number;
}

export interface AbortForceRestoredDmOptions {
  readonly recipientName?: string;
  readonly recipientClass?: string;
  readonly roomCode: string;
  readonly roomName: string;
  readonly date: string; // DD/MM/YYYY
  readonly slotCode: string;
  readonly timeRange: string;
  readonly staffName: string;
}

export interface AbortForceEventSuccessAnnouncementOptions {
  readonly eventName: string;
  readonly roomCodes: readonly string[];
  readonly dateRangeText: string;
  readonly staffName: string;
  readonly eventIds: readonly number[];
  readonly displacedRestoredCount: number;
}

export interface AbortForceEventRestoredDmOptions {
  readonly recipientName?: string;
  readonly recipientClass?: string;
  readonly eventName: string;
  readonly roomCodes: readonly string[];
  readonly staffName: string;
}

/**
 * Format pesan pengumuman publik WhatsApp ketika pengambilalihan paksa (!force) dibatalkan oleh admin/staf.
 */
export function formatAbortForceSuccessAnnouncement(
  options: AbortForceSuccessAnnouncementOptions
): string {
  const {
    roomCode,
    roomName,
    date,
    slotCode,
    timeRange,
    reason,
    staffName,
    bookingIds,
    displacedRestoredCount,
  } = options;

  const restoredNotice =
    displacedRestoredCount > 0
      ? `\nℹ️ *Catatan*: ${displacedRestoredCount} peminjam yang sebelumnya tergeser telah menerima notifikasi bahwa ruangan telah tersedia kembali.`
      : '';

  return [
    '🔓 *PEMBATALAN PENGAMBILALIHAN RUANGAN*',
    '',
    `Pengambilalihan paksa ruangan *${roomCode}* (${roomName}) telah resmi dibatalkan:`,
    '',
    `📅 *Tanggal*: ${date}`,
    `⏰ *Slot*: ${slotCode} (${timeRange})`,
    `📋 *Agenda Sebelumnya*: ${reason}`,
    `👤 *Dibatalkan Oleh*: ${staffName}`,
    `🆔 *ID Pemesanan*: #${bookingIds.join(', #')}`,
    restoredNotice,
    '',
    '✅ *Status*: Slot ruangan di atas kini *KOSONG KEMBALI* dan dapat dipesan oleh mahasiswa/korti melalui perintah *!pinjam*.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Format notifikasi Japri/DM ramah kepada Korti yang sebelumnya tergeser, mengabarkan bahwa slot ruangan telah bebas kembali.
 */
export function formatAbortForceRestoredDm(
  options: AbortForceRestoredDmOptions
): string {
  const {
    recipientName,
    recipientClass,
    roomCode,
    roomName,
    date,
    slotCode,
    timeRange,
    staffName,
  } = options;

  const recipientGreeting = recipientName
    ? `Halo *${recipientName}*${recipientClass ? ` (${recipientClass})` : ''},`
    : 'Halo Korti,';

  return [
    '✨ *KABAR BAIK: RUANGAN KEMBALI TERSEDIA* ✨',
    '',
    `${recipientGreeting} ada pembaruan status jadwal:`,
    `Agenda institusional kampus pada ruangan yang sebelumnya Anda pesan telah *dibatalkan secara resmi* oleh pengelola kampus/staf:`,
    '',
    `📍 *Ruangan*: ${roomCode} (${roomName})`,
    `📅 *Tanggal*: ${date}`,
    `⏰ *Waktu*: Slot ${slotCode} (${timeRange})`,
    `👤 *Dibatalkan oleh*: ${staffName}`,
    '',
    '💡 *Tindakan*: Ruangan tersebut kini telah kembali kosong. Jika kelas Anda masih memerlukan ruangan ini, silakan segera lakukan pemesanan ulang melalui grup via perintah:',
    `👉 *!pinjam ${roomCode} ${date} ${slotCode}*`,
    '',
    '────────────────────────',
    '_Pesan ini dikirimkan otomatis oleh bot SDP Undiksha via jalur pribadi._',
  ].join('\n');
}

/**
 * Format pengumuman publik pembatalan agenda force event kampus.
 */
export function formatAbortForceEventSuccessAnnouncement(
  options: AbortForceEventSuccessAnnouncementOptions
): string {
  const {
    eventName,
    roomCodes,
    dateRangeText,
    staffName,
    eventIds,
    displacedRestoredCount,
  } = options;

  const restoredNotice =
    displacedRestoredCount > 0
      ? `\nℹ️ *Catatan*: ${displacedRestoredCount} peminjam yang sebelumnya tergeser telah menerima notifikasi pembatalan agenda.`
      : '';

  return [
    '🔓 *PEMBATALAN AGENDA PEMBLOKIRAN RUANGAN*',
    '',
    `Agenda institusional kampus berikut telah resmi dibatalkan:`,
    '',
    `📋 *Nama Acara*: ${eventName}`,
    `📍 *Ruangan*: ${roomCodes.join(', ')}`,
    `📅 *Rentang Waktu*: ${dateRangeText}`,
    `👤 *Dibatalkan Oleh*: ${staffName}`,
    `🆔 *ID Agenda*: #${eventIds.join(', #')}`,
    restoredNotice,
    '',
    '✅ *Status*: Seluruh ruangan terkait kini telah dibuka kembali untuk perkuliahan reguler.',
  ]
    .filter((line) => line !== '')
    .join('\n');
}

/**
 * Format notifikasi Japri/DM kepada Korti yang tergeser oleh force event bahwa event telah dibatalkan.
 */
export function formatAbortForceEventRestoredDm(
  options: AbortForceEventRestoredDmOptions
): string {
  const { recipientName, recipientClass, eventName, roomCodes, staffName } = options;

  const recipientGreeting = recipientName
    ? `Halo *${recipientName}*${recipientClass ? ` (${recipientClass})` : ''},`
    : 'Halo Korti,';

  return [
    '✨ *KABAR BAIK: AGENDA KAMPUS DIBATALKAN* ✨',
    '',
    `${recipientGreeting} mohon perhatiannya:`,
    `Agenda resmi kampus *"${eventName}"* yang sebelumnya memblokir ruangan (*${roomCodes.join(', ')}*) telah resmi dibatalkan oleh ${staffName}.`,
    '',
    '💡 *Tindakan*: Ruangan tersebut kini kembali dibuka. Anda dapat mengecek ketersediaan jadwal melalui perintah *!info* dan melakukan pemesanan ulang melalui *!pinjam*.',
    '',
    '────────────────────────',
    '_Pesan ini dikirimkan otomatis oleh bot SDP Undiksha via jalur pribadi._',
  ].join('\n');
}
