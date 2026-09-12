import readline from 'node:readline/promises';
import chalk from 'chalk';
import type { ForceBookingDetails } from '@/core/features/force/index.ts';
import type { ForceBookingRawInput } from '@/core/validators/index.ts';

/**
 * Menampilkan judul perintah force booking pada terminal
 */
export function renderHeader(): void {
  console.log(chalk.bold.red('\n=== Pengambilalihan Ruangan Institusional - Force Booking (Fase 5.4) ===\n'));
}

/**
 * Menampilkan rincian transaksi force booking yang berhasil
 */
export function renderSuccess(forced: ForceBookingDetails): void {
  console.log(chalk.bold.green('\n[SUKSES] Pengambilalihan ruangan berhasil dicatat dalam basis data.'));
  console.log(chalk.gray('--------------------------------------------------'));
  console.log(`${chalk.bold('Gedung / Ruang :')} ${chalk.white(forced.room.building)} - ${chalk.cyan(forced.room.code)} (${forced.room.name})`);
  console.log(`${chalk.bold('Tanggal        :')} ${chalk.white(forced.date.raw)} (${forced.date.iso})`);
  console.log(`${chalk.bold('Slot SKS       :')} ${chalk.yellow(forced.slot.raw)} (Jam: ${forced.slot.timeRange})`);
  console.log(`${chalk.bold('Total SKS      :')} ${chalk.white(forced.slot.totalSks)} SKS`);
  console.log(`${chalk.bold('Otorisasi      :')} ${chalk.white(forced.user.nama)} (${forced.user.role})`);
  console.log(`${chalk.bold('WhatsApp JID   :')} ${chalk.gray(forced.user.jid)}`);
  console.log(`${chalk.bold('Alasan         :')} ${chalk.magenta(forced.reason)}`);
  console.log(`${chalk.bold('Booking Baru   :')} ${chalk.green(forced.bookings.length)} baris unit slot`);

  if (forced.displacedBookings.length > 0) {
    console.log(chalk.yellow(`\n[PERINGATAN] ${forced.displacedBookings.length} peminjaman lama telah digeser (force_cancelled):`));
    forced.displacedBookings.forEach((d, idx) => {
      console.log(
        chalk.gray(
          `  ${idx + 1}. Slot ${d.slotCode}: ${d.userName ?? d.userJid} (${d.userClass ?? 'Korti'}) [ID: ${d.id}]`
        )
      );
    });
  }
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
 * Melakukan prompt interaktif untuk melengkapi parameter pengambilalihan ruangan (force booking)
 */
export async function promptForceInteractive(
  initialValues: Partial<ForceBookingRawInput> = {}
): Promise<ForceBookingRawInput> {
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
        chalk.bold('Nomor WhatsApp Staf/Admin (contoh: 08123456789 atau 628xxx@s.whatsapp.net): ')
      ));

    const reason =
      initialValues.reason?.trim() ||
      (await rl.question(
        chalk.bold('Alasan Pengambilalihan / Agenda Institusi: ')
      ));

    return {
      roomCode: roomCode.trim().toUpperCase(),
      date: date.trim(),
      slotCode: slotCode.trim().toUpperCase(),
      userJid: userJid.trim(),
      reason: reason.trim(),
    };
  } finally {
    rl.close();
  }
}
