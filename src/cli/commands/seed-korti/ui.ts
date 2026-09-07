import chalk from 'chalk';
import type { SeedKortiSummary } from '@/core/services';

/**
 * Menampilkan judul perintah seeder pada terminal
 */
export function renderSeedHeader(): void {
  console.log(chalk.bold.cyan('\n=== Automated Seeder Korti dari Master Spreadsheet ===\n'));
}

/**
 * Menampilkan ringkasan hasil eksekusi seeder
 */
export function renderSeedSummary(summary: SeedKortiSummary): void {
  const isDryRun = summary.isDryRun;

  if (isDryRun) {
    console.log(chalk.bold.yellow('[DRY RUN] Mode simulasi aktif - tidak ada data yang disimpan ke database.\n'));
  } else {
    console.log(chalk.bold.green('[SUKSES] Seeder berhasil mengeksekusi sinkronisasi data Korti!\n'));
  }

  console.log(chalk.gray('--------------------------------------------------------------------------------'));
  console.log(`${chalk.bold('Berkas Master :')} ${chalk.white(summary.filePath)}`);
  console.log(`${chalk.bold('Sheet Target  :')} ${chalk.white(summary.sheetName)}`);
  console.log(`${chalk.bold('Total Dipindai:')} ${chalk.white(summary.totalScanned)} baris`);
  console.log(`${chalk.bold('Total Valid   :')} ${chalk.green(summary.totalImported)} korti`);
  console.log(`${chalk.bold('Total Di-skip :')} ${chalk.yellow(summary.totalSkipped)} baris (header/footer/kelas kosong)`);
  console.log(chalk.gray('--------------------------------------------------------------------------------\n'));

  if (summary.items.length > 0) {
    console.log(chalk.bold('Daftar Korti yang Diimpor / Dimutakhirkan:'));
    console.log(chalk.gray('--------------------------------------------------------------------------------'));
    console.log(
      chalk.bold(
        `${'No'.padEnd(4)} ${'Kelas'.padEnd(8)} ${'Semester'.padEnd(10)} ${'Prodi'.padEnd(20)} ${'Nama Korti'.padEnd(30)} ${'Nomor WhatsApp'}`
      )
    );
    console.log(chalk.gray('--------------------------------------------------------------------------------'));

    summary.items.forEach((item, index) => {
      const no = String(index + 1).padEnd(4);
      const kelas = item.kelas.padEnd(8);
      const smt = String(item.semester ?? '-').padEnd(10);
      const prodi = (item.prodi ?? '-').slice(0, 18).padEnd(20);
      const nama = item.nama.slice(0, 28).padEnd(30);
      const telp = item.noTelp;

      console.log(`${chalk.gray(no)} ${chalk.cyan(kelas)} ${chalk.yellow(smt)} ${chalk.white(prodi)} ${chalk.white(nama)} ${chalk.green(telp)}`);
    });
    console.log(chalk.gray('--------------------------------------------------------------------------------\n'));
  }
}

/**
 * Menampilkan pesan error seeder
 */
export function renderSeedError(message: string, hint?: string): void {
  console.error(chalk.bold.red(`\n[ERROR] ${message}`));
  if (hint) {
    console.error(chalk.yellow(`Saran : ${hint}`));
  }
  console.error('');
}
