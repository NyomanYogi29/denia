import readline from 'node:readline/promises';
import chalk from 'chalk';
import type { CancelledBookingDetails } from '@/core/features/booking/index.ts';
import type { CancelBookingRawInput } from '@/core/validators/index.ts';

/**
 * Menampilkan judul perintah pembatalan peminjaman pada terminal
 */
export function renderHeader(): void {
  console.log(chalk.bold.cyan('\n=== Pembatalan Peminjaman Ruangan SDP Undiksha (Fase 5.2) ===\n'));
}

/**
 * Menampilkan rincian pembatalan peminjaman ruangan yang berhasil
 */
export function renderSuccess(cancelled: CancelledBookingDetails): void {
  console.log(chalk.bold.green('\n[SUKSES] Peminjaman ruangan berhasil dibatalkan.'));
  console.log(chalk.gray('--------------------------------------------------'));
  console.log(`${chalk.bold('Gedung / Ruang :')} ${chalk.white(cancelled.room.building)} - ${chalk.cyan(cancelled.room.code)} (${cancelled.room.name})`);
  console.log(`${chalk.bold('Tanggal        :')} ${chalk.white(cancelled.date.raw)} (${cancelled.date.iso})`);
  console.log(`${chalk.bold('Slot SKS       :')} ${chalk.yellow(cancelled.slot.raw)} (Jam: ${cancelled.slot.timeRange})`);
  console.log(`${chalk.bold('Pemohon Batal  :')} ${chalk.white(cancelled.user.nama)} (${chalk.cyan(cancelled.user.role)})`);
  console.log(`${chalk.bold('WhatsApp JID   :')} ${chalk.gray(cancelled.user.jid)}`);
  console.log(`${chalk.bold('Status Record  :')} ${chalk.red('cancelled')} (${cancelled.cancelledBookings.length} baris unit slot dibatalkan)`);
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
 * Melakukan prompt interaktif untuk melengkapi parameter pembatalan peminjaman ruangan
 */
export async function promptCancelInteractive(
  initialValues: Partial<CancelBookingRawInput> = {}
): Promise<CancelBookingRawInput> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const roomCode =
      initialValues.roomCode?.trim() ||
      (await rl.question(
        chalk.bold('Kode Ruangan yang ingin dibatalkan (contoh: RAK_2.1, KHD_2.2): ')
      ));

    const date =
      initialValues.date?.trim() ||
      (await rl.question(
        chalk.bold('Tanggal Peminjaman [DD/MM/YYYY] (contoh: 15/10/2026): ')
      ));

    const slotCode =
      initialValues.slotCode?.trim() ||
      (await rl.question(
        chalk.bold('Kode Slot Alfabetik yang dibatalkan (contoh: DEF, AB, C): ')
      ));

    const userJid =
      initialValues.userJid?.trim() ||
      (await rl.question(
        chalk.bold('Nomor WhatsApp Pemohon (contoh: 08123456789 atau JID): ')
      ));

    return {
      roomCode: roomCode.trim().toUpperCase(),
      date: date.trim(),
      slotCode: slotCode.trim().toUpperCase(),
      userJid: userJid.trim(),
    };
  } finally {
    rl.close();
  }
}
