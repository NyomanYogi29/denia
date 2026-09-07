import readline from 'node:readline/promises';
import chalk from 'chalk';
import type { FlushResult, FlushTarget } from '@/core/services';

/**
 * Menampilkan header Danger Zone pada terminal
 */
export function renderFlushHeader(target: FlushTarget): void {
  console.log(chalk.bold.bgRed.white('\n ⚠️  DANGER ZONE: FLUSH DATABASE ⚠️ '));
  console.log(chalk.red(`Operasi ini akan menghapus data pada tabel [${chalk.bold(target)}] secara permanen!\n`));
}

/**
 * Meminta konfirmasi eksplisit dari pengguna sebelum mengeksekusi perintah bahaya
 */
export async function promptFlushConfirmation(target: FlushTarget): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = await rl.question(
      chalk.bold.yellow(`Apakah Anda yakin ingin menghapus data "${chalk.white.bold(target)}" dari database? (Ketik 'y' / 'CONFIRM' untuk lanjut): `)
    );
    const trimmed = answer.trim().toUpperCase();
    return trimmed === 'Y' || trimmed === 'YES' || trimmed === 'CONFIRM';
  } finally {
    rl.close();
  }
}

/**
 * Menampilkan pesan bahwa operasi dibatalkan oleh pengguna
 */
export function renderFlushAborted(): void {
  console.log(chalk.yellow('\n[DIBATALKAN] Operasi flushdb dibatalkan. Tidak ada data yang dihapus.\n'));
}

/**
 * Menampilkan hasil penghapusan data
 */
export function renderFlushSuccess(result: FlushResult): void {
  console.log(chalk.bold.green('\n[SUKSES] Data berhasil dihapus dari database!'));
  console.log(chalk.gray('--------------------------------------------------'));
  console.log(`${chalk.bold('Target Flush :')} ${chalk.cyan(result.target)}`);

  const counts = result.deletedCounts;
  if (counts.bookings !== undefined) {
    console.log(`${chalk.bold('Bookings     :')} ${chalk.white(counts.bookings)} baris dihapus`);
  }
  if (counts.forceEvents !== undefined) {
    console.log(`${chalk.bold('Force Events :')} ${chalk.white(counts.forceEvents)} baris dihapus`);
  }
  if (counts.users !== undefined) {
    console.log(`${chalk.bold('Users        :')} ${chalk.white(counts.users)} baris dihapus`);
  }
  if (counts.rooms !== undefined) {
    console.log(`${chalk.bold('Rooms        :')} ${chalk.white(counts.rooms)} baris dihapus`);
  }
  console.log(chalk.gray('--------------------------------------------------\n'));
}
