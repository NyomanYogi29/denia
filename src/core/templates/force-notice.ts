export interface ForceDisplacedDmOptions {
  readonly recipientName?: string;
  readonly recipientClass?: string;
  readonly roomCode: string;
  readonly roomName: string;
  readonly date: string; // DD/MM/YYYY
  readonly slotCode: string;
  readonly timeRange: string;
  readonly reason: string;
  readonly staffName: string;
}

export interface ForceSuccessAnnouncementOptions {
  readonly roomCode: string;
  readonly roomName: string;
  readonly date: string; // DD/MM/YYYY
  readonly slotCode: string;
  readonly timeRange: string;
  readonly reason: string;
  readonly staffName: string;
  readonly displacedCount: number;
}

/**
 * Format notifikasi DM pribadi (Japri) untuk Korti yang peminjamannya tergeser akibat force booking institusi.
 */
export function formatForceDisplacedDm(options: ForceDisplacedDmOptions): string {
  const {
    recipientName,
    recipientClass,
    roomCode,
    roomName,
    date,
    slotCode,
    timeRange,
    reason,
    staffName,
  } = options;

  const recipientGreeting = recipientName
    ? `Halo *${recipientName}*${recipientClass ? ` (${recipientClass})` : ''},`
    : 'Halo Korti,';

  return [
    '🚨 *PEMBERITAHUAN PENGAMBILALIHAN RUANGAN* 🚨',
    '',
    `${recipientGreeting} mohon perhatiannya:`,
    `Peminjaman ruangan Anda telah *dibatalkan secara resmi* oleh pengelola kampus/staf institusi:`,
    '',
    `📍 *Ruangan*: ${roomCode} (${roomName})`,
    `📅 *Tanggal*: ${date}`,
    `⏰ *Waktu*: Slot ${slotCode} (${timeRange})`,
    `📋 *Alasan Institusi*: ${reason}`,
    `👤 *Otorisasi*: ${staffName}`,
    '',
    '💡 *Langkah Selanjutnya*:',
    'Silakan ketik *!info* atau *!info ' + date + '* untuk memeriksa ketersediaan ruangan lain dan melakukan pemesanan ulang.',
    '',
    '────────────────────────',
    '_Pesan ini dikirimkan otomatis oleh bot SDP Undiksha via jalur pribadi._',
  ].join('\n');
}

/**
 * Format pengumuman sukses pengambilalihan ruangan (force booking) untuk grup/chat WhatsApp.
 */
export function formatForceSuccessAnnouncement(
  options: ForceSuccessAnnouncementOptions
): string {
  const {
    roomCode,
    roomName,
    date,
    slotCode,
    timeRange,
    reason,
    staffName,
    displacedCount,
  } = options;

  const displacedNotice =
    displacedCount > 0
      ? `\n⚠️ *Catatan*: ${displacedCount} peminjaman sebelumnya telah digeser dan korti terkait telah dinotifikasi via Japri (DM).`
      : '';

  return [
    '🚨 *PENGAMBILALIHAN RUANGAN INSTITUSI*',
    '',
    `Ruangan *${roomCode}* (${roomName}) telah diambil alih secara resmi untuk agenda institusional kampus:`,
    '',
    `📅 *Tanggal*: ${date}`,
    `⏰ *Slot*: ${slotCode} (${timeRange})`,
    `📋 *Agenda / Alasan*: ${reason}`,
    `👤 *Penanggung Jawab*: ${staffName}`,
    displacedNotice,
  ]
    .filter((line) => line !== '')
    .join('\n');
}
