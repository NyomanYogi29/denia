#!/usr/bin/env bun
import { parseArgs } from 'util';
import chalk from 'chalk';
import {
  createRuntimeConfig,
  GLOBAL_FLAG_OPTIONS,
} from '@/cli/config';
import {
  executeUserAdd,
  USER_ADD_OPTIONS,
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
  console.log('  denia <command> [subcommand] [options]\n');
  console.log(chalk.bold('PERINTAH YANG TERSEDIA:'));
  console.log('  user add       Mendaftarkan pengguna baru (korti, staff, admin) ke whitelist');
  console.log('  help           Menampilkan pesan bantuan ini\n');
  console.log(chalk.bold('OPSI GLOBAL:'));
  console.log('  -v, --verbose  Tampilkan detail log lebih rinci');
  console.log('  -q, --quiet    Sembunyikan output standar terminal');
  console.log('      --json     Keluarkan hasil eksekusi dalam format JSON');
  console.log('      --no-color Nonaktifkan pewarnaan terminal');
  console.log('  -c, --config   Tentukan path custom berkas konfigurasi (.deniarc)\n');
  console.log(chalk.bold('CONTOH:'));
  console.log('  denia user add --jid 08123456789 --nama "Budi" --nim 2115051001 --kelas "PTI 4A"');
  console.log('  denia user add -i\n');
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

  // Jika perintah tidak dikenali
  const unknownCmd = positionals.join(' ');
  handleCliError(new CliCommandNotFoundError(unknownCmd || 'unknown'));
}

main().catch((err) => {
  handleCliError(err);
});