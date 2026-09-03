export interface BatchBookingItem {
  readonly date: string;
  readonly roomCode: string;
  readonly slotCode: string;
  readonly slotTime?: string;
  readonly borrowerName: string;
  readonly borrowerJid?: string;
}

export interface BatchRecapOptions {
  readonly bookings: readonly BatchBookingItem[];
  readonly timestamp?: string;
}

/**
 * Builder template pesan rekap micro-batch sukses untuk grup WhatsApp.
 * Menggabungkan beberapa transaksi peminjaman sukses dalam satu pesan terstruktur.
 */
export function formatBatchRecap(options: BatchRecapOptions): string {
  const { bookings, timestamp } = options;

  if (bookings.length === 0) {
    return '';
  }

  // Kelompokkan booking berdasarkan tanggal
  const groupedByDate = new Map<string, BatchBookingItem[]>();
  for (const item of bookings) {
    const existing = groupedByDate.get(item.date) ?? [];
    existing.push(item);
    groupedByDate.set(item.date, existing);
  }

  const lines: string[] = [
    '📋 *REKAP PEMESANAN RUANGAN SDP UNDIKSHA*',
    timestamp ? `_Waktu Proses: ${timestamp}_` : '',
    '',
    'Berikut adalah peminjaman ruangan yang baru saja berhasil dikonfirmasi:',
    '',
  ];

  for (const [date, items] of groupedByDate.entries()) {
    lines.push(`📅 *Tanggal: ${date}*`);
    for (const item of items) {
      const timeInfo = item.slotTime ? ` (${item.slotTime})` : '';
      lines.push(
        `• 🏢 *${item.roomCode}* | Slot *${item.slotCode}*${timeInfo}`,
        `  👤 Peminjam: ${item.borrowerName}`
      );
    }
    lines.push('');
  }

  lines.push(
    `✅ *Total Transaksi Dikonfirmasi*: ${bookings.length}`,
    '',
    '────────────────────────',
    'Gunakan `!cekruangan [DD/MM/YYYY]` untuk mengecek ketersediaan jadwal terkini.'
  );

  return lines.filter((line, index) => !(line === '' && lines[index - 1] === '')).join('\n');
}
