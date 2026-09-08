export interface BatchBookingItem {
  readonly date: string;
  readonly roomCode: string;
  readonly slotCode: string;
  readonly timeRange: string;
  readonly borrowerName: string;
  readonly borrowerClass: string;
  readonly borrowerJid?: string;
}

export interface BatchRecapOptions {
  readonly bookings: readonly BatchBookingItem[];
  readonly timestamp?: string;
}

/**
 * Builder template pesan rekap micro-batch sukses untuk grup WhatsApp.
 *
 * Menggunakan format adaptif super ringkas:
 * - Jika hanya 1 transaksi (N = 1): format one-liner langsung tanpa header/footer berlebihan.
 * - Jika 2 transaksi atau lebih (N >= 2): daftar bernomor yang kompak dan bersih.
 */
export function formatBatchRecap(options: BatchRecapOptions): string {
  const { bookings } = options;

  if (bookings.length === 0) {
    return '';
  }

  // Kasus A: Hanya 1 orang / transaksi dalam rentang 30 detik (One-Liner super ringkas)
  if (bookings.length === 1) {
    const item = bookings[0]!;
    return `📌 Ruang *${item.roomCode}* digunakan oleh *${item.borrowerClass}*, pada jam *${item.timeRange}* untuk tanggal *${item.date}*.`;
  }

  // Kasus B: Dua orang atau lebih dalam rentang 30 detik (List Kompak)
  const lines: string[] = ['📋 *Pemesanan Ruangan Terbaru:*', ''];

  bookings.forEach((item, index) => {
    lines.push(
      `${index + 1}. Ruang *${item.roomCode}* digunakan oleh *${item.borrowerClass}* (*${item.timeRange}*, ${item.date})`
    );
  });

  return lines.join('\n');
}
