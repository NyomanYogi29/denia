import readline from 'node:readline/promises';
import chalk from 'chalk';
import type { User } from '@/core/db';
import type { UserAddRawInput } from './schema.ts';

/**
 * Menampilkan judul perintah pada terminal
 */
export function renderHeader(): void {
  console.log(chalk.bold.cyan('\n=== Pendaftaran Pengguna Whitelist Denia ===\n'));
}

/**
 * Menampilkan pesan dan detail pengguna yang sukses didaftarkan
 */
export function renderSuccess(user: User): void {
  console.log(chalk.bold.green('\n[SUKSES] Pengguna berhasil didaftarkan ke whitelist database.'));
  console.log(chalk.gray('--------------------------------------------------'));
  console.log(`${chalk.bold('JID   :')} ${chalk.white(user.jid)}`);
  console.log(`${chalk.bold('Nama  :')} ${chalk.white(user.nama)}`);
  console.log(`${chalk.bold('NIM   :')} ${chalk.white(user.nim)}`);
  console.log(`${chalk.bold('Kelas :')} ${chalk.white(user.kelas)}`);
  console.log(`${chalk.bold('Role  :')} ${chalk.cyan(user.role)}`);
  console.log(chalk.gray('--------------------------------------------------\n'));
}

/**
 * Menampilkan pesan error khusus pada terminal
 */
export function renderError(message: string, hint?: string): void {
  console.error(chalk.bold.red(`\n[ERROR] ${message}`));
  if (hint) {
    console.error(chalk.yellow(`Saran : ${hint}`));
  }
  console.error('');
}

/**
 * Melakukan prompt interaktif kepada pengguna untuk mengumpulkan data yang belum diisi
 */
export async function promptUserAddInteractive(
  initialValues: Partial<UserAddRawInput> = {}
): Promise<UserAddRawInput> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const jid =
      initialValues.jid?.trim() ||
      (await rl.question(
        chalk.bold('Nomor WhatsApp / JID (contoh: 08123456789 / 628123456789): ')
      ));

    const nama =
      initialValues.nama?.trim() ||
      (await rl.question(chalk.bold('Nama Lengkap: ')));

    const nim =
      initialValues.nim?.trim() ||
      (await rl.question(chalk.bold('NIM / NIP: ')));

    const kelas =
      initialValues.kelas?.trim() ||
      (await rl.question(chalk.bold('Kelas / Unit (contoh: PTI 4A, Staf SDP): ')));

    let role = initialValues.role?.trim();
    if (!role) {
      const roleAnswer = await rl.question(
        chalk.bold('Role [korti/staff/admin] (default: korti): ')
      );
      role = roleAnswer.trim() === '' ? 'korti' : roleAnswer.trim();
    }

    return {
      jid: jid.trim(),
      nama: nama.trim(),
      nim: nim.trim(),
      kelas: kelas.trim(),
      role: (role as 'korti' | 'staff' | 'admin') || 'korti',
    };
  } finally {
    rl.close();
  }
}
