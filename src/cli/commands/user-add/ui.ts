import readline from 'node:readline/promises';
import chalk from 'chalk';
import type { User } from '@/core/db';
import type { CreateUserRawInput } from '@/core/validators';


/**
 * Menampilkan judul perintah pada terminal
 */
export function renderHeader(): void {
  console.log(chalk.bold.cyan('\n=== Pendaftaran Pengguna Whitelist Denia (V2) ===\n'));
}

/**
 * Menampilkan pesan dan detail pengguna yang sukses didaftarkan
 */
export function renderSuccess(user: User): void {
  console.log(chalk.bold.green('\n[SUKSES] Pengguna berhasil didaftarkan ke whitelist database.'));
  console.log(chalk.gray('--------------------------------------------------'));
  console.log(`${chalk.bold('JID      :')} ${chalk.white(user.jid)}`);
  console.log(`${chalk.bold('Nama     :')} ${chalk.white(user.nama)}`);
  if (user.fakultas) console.log(`${chalk.bold('Fakultas :')} ${chalk.white(user.fakultas)}`);
  if (user.prodi)    console.log(`${chalk.bold('Prodi    :')} ${chalk.white(user.prodi)}`);
  if (user.semester) console.log(`${chalk.bold('Semester :')} ${chalk.white(user.semester)}`);
  console.log(`${chalk.bold('Kelas    :')} ${chalk.white(user.kelas)}`);
  console.log(`${chalk.bold('No Telp  :')} ${chalk.white(user.noTelp)}`);
  console.log(`${chalk.bold('Role     :')} ${chalk.cyan(user.role)}`);
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
  initialValues: Partial<CreateUserRawInput> = {}
): Promise<CreateUserRawInput> {

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

    const fakultas =
      initialValues.fakultas?.trim() ||
      (await rl.question(chalk.bold('Fakultas (opsional, contoh: FTK, FBS): ')));

    const prodi =
      initialValues.prodi?.trim() ||
      (await rl.question(chalk.bold('Program Studi (opsional, contoh: PTI, SI): ')));

    const semesterInput =
      initialValues.semester != null
        ? String(initialValues.semester)
        : await rl.question(chalk.bold('Semester (opsional, contoh: 4): '));

    const kelas =
      initialValues.kelas?.trim() ||
      (await rl.question(chalk.bold('Kelas / Unit (contoh: PTI 4A, 3DPS, Staf SDP): ')));

    let role = initialValues.role?.trim();
    if (!role) {
      const roleAnswer = await rl.question(
        chalk.bold('Role [korti/staff/admin] (default: korti): ')
      );
      role = roleAnswer.trim() === '' ? 'korti' : roleAnswer.trim();
    }

    const parsedSemester = semesterInput.trim() !== '' ? parseInt(semesterInput.trim(), 10) : undefined;

    return {
      jid: jid.trim(),
      nama: nama.trim(),
      fakultas: fakultas.trim() || undefined,
      prodi: prodi.trim() || undefined,
      semester: isNaN(parsedSemester as number) ? undefined : parsedSemester,
      kelas: kelas.trim(),
      role: (role as 'korti' | 'staff' | 'admin') || 'korti',
    };
  } finally {
    rl.close();
  }
}
