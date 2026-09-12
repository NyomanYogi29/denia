#!/usr/bin/env bun
import { parseArgs } from 'util';
import chalk from 'chalk';
import {
  createRuntimeConfig,
  GLOBAL_FLAG_OPTIONS,
} from '@/cli/config';
import {
  executeFlushDb,
  executeSeedKorti,
  executeUserAdd,
  executeBook,
  executeCancel,
  FLUSHDB_OPTIONS,
  SEED_KORTI_OPTIONS,
  USER_ADD_OPTIONS,
  BOOK_OPTIONS,
  CANCEL_OPTIONS,
  INFO_OPTIONS,
  executeBook,
  executeCancel,
  executeFlushDb,
  executeInfo,
  executeSeedKorti,
  executeUserAdd,
} from '@/cli/commands';
import {
  CliCommandNotFoundError,
  handleCliError,
} from '@/cli/errors';

/**
 * Mencetak teks bantuan CLI
 */
function printHelp(): void {
  console.log(chalk.bold.cyan('\n=== Denia CLI - Sistem Administrasi Bot WhatsApp ===\n'));
  console.log(chalk.bold('PENGGUNAAN:'));
  console.log('  denia <command> [subcommand/target] [options]\n');
  console.log(chalk.bold('PERINTAH YANG TERSEDIA:'));
  console.log('  user add              Mendaftarkan pengguna baru (korti, staff, admin) ke whitelist');
  console.log('  seed korti            Mengimpor data Korti dari master spreadsheet Excel ke database');
  console.log('  book, pinjam          Meminjam ruangan kuliah SDP Undiksha (Fase 5.1)');
  console.log('  cancel, batal         Membatalkan peminjaman ruangan kuliah SDP Undiksha (Fase 5.2)');
  console.log('  info, jadwal          Menampilkan matriks ketersediaan ruangan (Fase 5.3)');
  console.log(`  ${chalk.red('flushdb <target>')}      ${chalk.bold.red('[DANGER ZONE]')} Menghapus data tabel (all, user, rooms, force_events, bookings)`);
  console.log('  help                  Menampilkan pesan bantuan ini\n');
  console.log(chalk.bold('OPSI GLOBAL:'));
  console.log('  -v, --verbose         Tampilkan detail log lebih rinci');
  console.log('  -q, --quiet           Sembunyikan output standar terminal');
  console.log('      --json            Keluarkan hasil eksekusi dalam format JSON');
  console.log('      --no-color        Nonaktifkan pewarnaan terminal');
  console.log('  -c, --config          Tentukan path custom berkas konfigurasi (.deniarc)\n');
  console.log(chalk.bold('CONTOH:'));
  console.log('  denia user add --jid 08123456789 --nama "Budi" --kelas "PTI 4A" --prodi "PTI"');
  console.log('  denia seed korti');
  console.log('  denia seed korti --dry-run');
  console.log('  denia info');
  console.log('  denia info 15/10/2026');
  console.log('  denia info RAK_2.1 15/10/2026');
  console.log('  denia book RAK_2.1 15/10/2026 DEF --jid 08123456789');
  console.log('  denia cancel RAK_2.1 15/10/2026 DEF --jid 08123456789');
  console.log('  denia pinjam --interactive');
  console.log('  denia batal --interactive');
  console.log('  denia flushdb user');
  console.log('  denia flushdb all --force\n');
}

/**
 * Runner utama CLI Denia
 */
async function main(): Promise<void> {
  const args = Bun.argv.slice(2);

  if (args.length === 0 || args.includes('-h') || args.includes('--help') || args[0] === 'help') {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--version')) {
    console.log('Denia CLI v1.0.0');
    process.exit(0);
  }

  // Gabungkan opsi global dan opsi perintah spesifik untuk parseArgs
  const combinedOptions = {
    ...GLOBAL_FLAG_OPTIONS,
    ...USER_ADD_OPTIONS,
    ...SEED_KORTI_OPTIONS,
    ...FLUSHDB_OPTIONS,
    ...BOOK_OPTIONS,
    ...CANCEL_OPTIONS,
    ...INFO_OPTIONS,
  };

  const { values, positionals } = parseArgs({
    args,
    options: combinedOptions,
    strict: false,
    allowPositionals: true,
  });

  const runtimeConfigResult = await createRuntimeConfig(values);
  if (!runtimeConfigResult.success) {
    handleCliError(runtimeConfigResult.error);
  }

  const runtimeConfig = runtimeConfigResult.data;

  // Penentuan router subcommand
  const [firstPos, secondPos] = positionals;

  if ((firstPos === 'user' && secondPos === 'add') || firstPos === 'user:add') {
    const result = await executeUserAdd(values, runtimeConfig);
    if (!result.success) {
      handleCliError(result.error);
    }
    process.exit(0);
  }

  if ((firstPos === 'seed' && secondPos === 'korti') || firstPos === 'seed:korti') {
    const result = await executeSeedKorti(values, runtimeConfig);
    if (!result.success) {
      handleCliError(result.error);
    }
    process.exit(0);
  }

  if (firstPos === 'book' || firstPos === 'pinjam') {
    const result = await executeBook(values, runtimeConfig, positionals);
    if (!result.success) {
      handleCliError(result.error);
    }
    process.exit(0);
  }

  if (firstPos === 'cancel' || firstPos === 'batal') {
    const result = await executeCancel(values, runtimeConfig, positionals);
    if (!result.success) {
      handleCliError(result.error);
    }
    process.exit(0);
  }

  if (firstPos === 'info' || firstPos === 'jadwal') {
    const result = await executeInfo(values, runtimeConfig, positionals);
    if (!result.success) {
      handleCliError(result.error);
    }
    process.exit(0);
  }

  if (firstPos === 'flushdb' || firstPos?.startsWith('flushdb:')) {
    const target = firstPos.includes(':') ? firstPos.split(':')[1] : secondPos;
    const result = await executeFlushDb(values, runtimeConfig, target);
    if (!result.success) {
      handleCliError(result.error);
    }
    process.exit(0);
  }

  // Jika perintah tidak dikenali
  const unknownCmd = positionals.join(' ');
  handleCliError(new CliCommandNotFoundError(unknownCmd || 'unknown'));
}

main().catch((err) => {
  handleCliError(err);
});