import readline from 'node:readline/promises';
import chalk from 'chalk';
import type { ForceEventDetails } from '@/core/features/force-event/index.ts';
import type { ForceEventRawInput } from '@/core/validators/index.ts';

/**
 * Menampilkan judul perintah force event pada terminal
 */
export function renderHeader(): void {
  console.log(chalk.bold.red('\n=== Pemblokiran Ruangan Agenda Kampus - Force Event (Fase 5.5) ===\n'));
}

/**
 * Menampilkan rincian transaksi force event yang berhasil
 */
export function renderSuccess(eventDetails: ForceEventDetails): void {
  console.log(chalk.bold.green('\n[SUKSES] Agenda kampus berhasil didaftarkan dan ruangan telah diblokir.'));
  console.log(chalk.gray('--------------------------------------------------'));
  console.log(`${chalk.bold('Nama Acara     :')} ${chalk.magenta(eventDetails.eventName)}`);
  console.log(`${chalk.bold('Ruangan        :')} ${chalk.cyan(eventDetails.rooms.map((r) => r.code).join(', '))}`);
  console.log(`${chalk.bold('Rentang Tanggal:')} ${chalk.white(eventDetails.dateRange.formattedRange)}`);
  console.log(`${chalk.bold('Durasi         :')} ${chalk.yellow('Seharian Penuh (Slot A-O)')}`);
  console.log(`${chalk.bold('Otorisasi      :')} ${chalk.white(eventDetails.user.nama)} (${eventDetails.user.role})`);
  console.log(`${chalk.bold('WhatsApp JID   :')} ${chalk.gray(eventDetails.user.jid)}`);
  console.log(`${chalk.bold('Data Event     :')} ${chalk.green(eventDetails.events.length)} baris entri ruangan`);

  if (eventDetails.displacedBookings.length > 0) {
    console.log(chalk.yellow(`\n[PERINGATAN] ${eventDetails.displacedBookings.length} peminjaman lama telah digeser (force_cancelled):`));
    eventDetails.displacedBookings.forEach((d, idx) => {
      console.log(
        chalk.gray(
          `  ${idx + 1}. [${d.roomCode}] ${d.bookingDate} Slot ${d.slotCode}: ${d.userName ?? d.userJid} (${d.userClass ?? 'Korti'}) [ID: ${d.id}]`
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
 * Melakukan prompt interaktif untuk melengkapi parameter agenda kampus (force event)
 */
export async function promptForceEventInteractive(
  initialValues: Partial<ForceEventRawInput> = {}
): Promise<ForceEventRawInput> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const roomCodes =
      (typeof initialValues.roomCodes === 'string'
        ? initialValues.roomCodes.trim()
        : Array.isArray(initialValues.roomCodes)
          ? initialValues.roomCodes.join(',')
          : '') ||
      (await rl.question(
        chalk.bold('Daftar Kode Ruangan (pisahkan dengan koma, contoh: RAK_1.1,RAK_2.1): ')
      ));

    const dateRange =
      initialValues.dateRange?.trim() ||
      (await rl.question(
        chalk.bold('Rentang Tanggal [DD/MM/YYYY-DD/MM/YYYY atau DD/MM/YYYY] (contoh: 15/10/2026-17/10/2026): ')
      ));

    const userJid =
      initialValues.userJid?.trim() ||
      (await rl.question(
        chalk.bold('Nomor WhatsApp Staf/Admin (contoh: 08123456789 atau 628xxx@s.whatsapp.net): ')
      ));

    const eventName =
      initialValues.eventName?.trim() ||
      (await rl.question(
        chalk.bold('Nama Agenda / Acara Kampus: ')
      ));

    return {
      roomCodes: roomCodes.trim(),
      dateRange: dateRange.trim(),
      userJid: userJid.trim(),
      eventName: eventName.trim(),
    };
  } finally {
    rl.close();
  }
}
