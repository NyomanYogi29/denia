import * as p from '@clack/prompts';
import chalk from 'chalk';
import type {
  AbortForceBookingDetails,
  AbortForceEventDetails,
} from '@/core/features/abort/index.ts';

export function renderHeader(): void {
  console.log(chalk.bold.cyan('\n=== Pembatalan Pengambilalihan Ruangan (Abort) ===\n'));
}

export async function promptAbortInteractive(initial: {
  target?: string;
  id?: string | number;
  userJid?: string;
}): Promise<{ target: 'force' | 'forceevent'; id: string; userJid: string }> {
  p.intro(chalk.bgCyan.black(' DENIA - PEMBATALAN PENGAMBILALIHAN / BLOKIR RUANGAN '));

  const target = (initial.target as 'force' | 'forceevent') ?? (await p.select({
    message: 'Pilih jenis entitas yang ingin dibatalkan:',
    options: [
      { value: 'force', label: 'Peminjaman Paksa Ruangan (!force)', hint: 'ID Booking' },
      { value: 'forceevent', label: 'Agenda Blokir Ruangan Kampus (!forceevent)', hint: 'ID Event' },
    ],
  }));

  if (p.isCancel(target)) {
    p.cancel('Operasi dibatalkan.');
    process.exit(0);
  }

  const id =
    initial.id?.toString() ??
    (await p.text({
      message: target === 'force' ? 'Masukkan ID Booking:' : 'Masukkan ID Agenda (Event):',
      placeholder: target === 'force' ? 'Contoh: 15' : 'Contoh: 5',
      validate: (val) => {
        if (!val || !val.trim()) return 'ID wajib diisi';
        if (!/\d+/.test(val)) return 'ID harus memuat angka valid';
        return undefined;
      },
    }));

  if (p.isCancel(id)) {
    p.cancel('Operasi dibatalkan.');
    process.exit(0);
  }

  const userJid =
    initial.userJid ??
    (await p.text({
      message: 'Nomor WhatsApp atau JID Staf/Admin pemohon:',
      placeholder: 'Contoh: 08123456789 atau 628123456789@s.whatsapp.net',
      validate: (val) => {
        if (!val || !val.trim()) return 'Nomor WhatsApp staf/admin wajib diisi';
        return undefined;
      },
    }));

  if (p.isCancel(userJid)) {
    p.cancel('Operasi dibatalkan.');
    process.exit(0);
  }

  p.outro(chalk.green('Data berhasil dikumpulkan, memproses pembatalan...'));

  return {
    target: target as 'force' | 'forceevent',
    id: id.trim(),
    userJid: userJid.trim(),
  };
}

export function renderAbortForceSuccess(details: AbortForceBookingDetails): void {
  console.log(chalk.bold.green('\n✔ Berhasil Membatalkan Pengambilalihan Paksa Ruangan!'));
  console.log(chalk.gray('──────────────────────────────────────────────────'));
  console.log(`Ruangan        : ${chalk.bold.yellow(details.room.code)} (${details.room.roomName})`);
  console.log(`Tanggal        : ${chalk.white(details.date.raw)}`);
  console.log(`Slot SKS       : ${chalk.cyan(details.slot.raw)} (${details.slot.timeRange})`);
  console.log(`ID Pemesanan   : ${chalk.bold.magenta('#' + details.bookings.map((b) => b.id).join(', #'))}`);
  console.log(`Agenda Awal    : ${chalk.italic(details.reason)}`);
  console.log(`Dibatalkan Oleh: ${chalk.green(details.user.nama)} (${details.user.role})`);
  if (details.displacedKorti.length > 0) {
    console.log(
      chalk.yellow(
        `Korti Tergeser : ${details.displacedKorti.length} pemesanan korti sebelumnya dipulihkan ketersediaannya`
      )
    );
  }
  console.log(chalk.gray('──────────────────────────────────────────────────\n'));
}

export function renderAbortForceEventSuccess(details: AbortForceEventDetails): void {
  console.log(chalk.bold.green('\n✔ Berhasil Membatalkan Agenda Blokir Ruangan!'));
  console.log(chalk.gray('──────────────────────────────────────────────────'));
  console.log(`Nama Acara     : ${chalk.bold.yellow(details.eventName)}`);
  console.log(`Ruangan Terkait: ${chalk.cyan(details.roomCodes.join(', '))}`);
  console.log(`Rentang Waktu  : ${chalk.white(details.startDate + ' s.d. ' + details.endDate)}`);
  console.log(`ID Agenda      : ${chalk.bold.magenta('#' + details.events.map((e) => e.id).join(', #'))}`);
  console.log(`Dibatalkan Oleh: ${chalk.green(details.user.nama)} (${details.user.role})`);
  if (details.displacedKorti.length > 0) {
    console.log(
      chalk.yellow(
        `Korti Tergeser : ${details.displacedKorti.length} pemesanan korti sebelumnya dipulihkan ketersediaannya`
      )
    );
  }
  console.log(chalk.gray('──────────────────────────────────────────────────\n'));
}
