import readline from 'node:readline/promises';
import chalk from 'chalk';
import type { BookedRoomDetails } from '@/core/features/booking/index.ts';
import type { CreateBookingRawInput } from '@/core/validators/index.ts';

/**
 * Menampilkan judul perintah peminjaman ruangan pada terminal
 */
export function renderHeader(): void {
  console.log(chalk.bold.cyan('\n=== Peminjaman Ruangan Kuliah SDP Undiksha (Fase 5.1) ===\n'));
}

/**
 * Menampilkan rincian transaksi peminjaman ruangan yang berhasil
 */
export function renderSuccess(booked: BookedRoomDetails): void {
  console.log(chalk.bold.green('\n[SUKSES] Peminjaman ruangan berhasil dicatat dalam basis data.'));
  console.log(chalk.gray('--------------------------------------------------'));
  console.log(`${chalk.bold('Gedung / Ruang :')} ${chalk.white(booked.room.building)} - ${chalk.cyan(booked.room.code)} (${booked.room.name})`);
  console.log(`${chalk.bold('Tanggal        :')} ${chalk.white(booked.date.raw)} (${booked.date.iso})`);
  console.log(`${chalk.bold('Slot SKS       :')} ${chalk.yellow(booked.slot.raw)} (Jam: ${booked.slot.timeRange})`);
  console.log(`${chalk.bold('Total SKS      :')} ${chalk.white(booked.slot.totalSks)} SKS`);
  console.log(`${chalk.bold('Peminjam (Korti):')} ${chalk.white(booked.user.nama)} (${booked.user.kelas})`);
  console.log(`${chalk.bold('WhatsApp JID   :')} ${chalk.gray(booked.user.jid)}`);
  console.log(`${chalk.bold('Jumlah Record  :')} ${chalk.green(booked.bookings.length)} baris unit slot`);
  console.log(chalk.gray('--------------------------------------------------\n'));
}

/**
 * Menampilkan pesan kesalahan terminal
 */
export function renderError(message: string, hint?: string): void {
  console.error(chalk.bold.red(`\n[ERROR] ${message}`));
  if (hint) {
    console.error(chalk.yellow(`Saran : ${hint}`));
  }
  console.error('');
}

/**
 * Melakukan prompt interaktif untuk melengkapi parameter peminjaman ruangan
 */
export async function promptBookInteractive(
  initialValues: Partial<CreateBookingRawInput> = {}
): Promise<CreateBookingRawInput> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const roomCode =
      initialValues.roomCode?.trim() ||
      (await rl.question(
        chalk.bold('Kode Ruangan (contoh: RAK_2.1, KHD_2.2, HYBRID): ')
      ));

    const date =
      initialValues.date?.trim() ||
      (await rl.question(
        chalk.bold('Tanggal Peminjaman [DD/MM/YYYY] (contoh: 15/10/2026): ')
      ));

    const slotCode =
      initialValues.slotCode?.trim() ||
      (await rl.question(
        chalk.bold('Kode Slot Alfabetik 1-4 SKS (contoh: DEF, AB, C): ')
      ));

    const userJid =
      initialValues.userJid?.trim() ||
      (await rl.question(
        chalk.bold('Nomor WhatsApp Peminjam (contoh: 08123456789 atau 628xxx@s.whatsapp.net): ')
      ));

    const notes =
      initialValues.notes?.trim() ||
      (await rl.question(
        chalk.bold('Catatan / Keperluan (opsional): ')
      ));

    return {
      roomCode: roomCode.trim().toUpperCase(),
      date: date.trim(),
      slotCode: slotCode.trim().toUpperCase(),
      userJid: userJid.trim(),
      notes: notes.trim() || undefined,
    };
  } finally {
    rl.close();
  }
}
