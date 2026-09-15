export interface HelpMessageOptions {
  readonly commandName?: string;
  readonly role?: string;
  readonly userName?: string;
}

/**
 * Memformat pesan bantuan (panduan perintah) untuk bot WhatsApp Denia.
 * Mendukung tampilan menu utama lengkap atau detail satu perintah spesifik.
 */
export function formatHelpMessage(options: HelpMessageOptions = {}): string {
  const { commandName, role, userName } = options;
  const isStaffOrAdmin = role === 'staff' || role === 'admin';

  if (commandName) {
    const cmd = commandName.trim().toLowerCase();
    return formatSingleCommandHelp(cmd, isStaffOrAdmin);
  }

  const greeting = userName ? `Halo *${userName}*! ` : 'Halo Rekan Civitas Undiksha! ';

  return (
    `📖 *PANDUAN PERINTAH BOT WHATSAPP DENIA*\n` +
    `_Sistem Peminjaman Ruangan Kuliah SDP FTK Undiksha_\n\n` +
    `${greeting}Berikut adalah daftar perintah yang tersedia di bot WhatsApp Denia:\n\n` +
    `🟢 *PERINTAH UMUM (Korti / Dosen / Staf)*\n` +
    `• *!pinjam* / *!book*\n` +
    `  Meminjam ruangan kuliah reguler.\n` +
    `  Format: \`!pinjam <ruangan> <tgl> <slot> [keterangan]\`\n` +
    `  Contoh: \`!pinjam RAK_2.1 15/10/2026 DEF Kuliah Basis Data\`\n` +
    `  _Aturan: Wajib min. H-1 (kecuali staf/admin), 1–4 SKS, urutan slot berurutan._\n\n` +
    `• *!batal* / *!cancel*\n` +
    `  Membatalkan peminjaman aktif yang Anda pesan.\n` +
    `  Format: \`!batal <ruangan> <tgl> <slot>\`\n` +
    `  Contoh: \`!batal RAK_2.1 15/10/2026 DEF\`\n\n` +
    `• *!info* / *!jadwal*\n` +
    `  Mengecek matriks ketersediaan ruangan SDP.\n` +
    `  Format: \`!info [ruangan] [tgl/besok]\`\n` +
    `  Contoh: \`!info besok\` atau \`!info RAK_2.1 15/10/2026\`\n` +
    `  _Catatan: Di grup, matriks dikirimkan ke chat pribadi (DM)._\n\n` +
    `• *!help* / *!panduan* / *!bantuan* / *!menu*\n` +
    `  Menampilkan panduan ini.\n` +
    `  Ketik \`!help <perintah>\` untuk bantuan spesifik (misal: \`!help pinjam\`).\n\n` +
    `🔴 *PERINTAH KHUSUS STAF & ADMIN*\n` +
    `• *!force* / *!ambilalih* / *!paksa*\n` +
    `  Pengambilalihan paksa ruangan untuk agenda mendesak institusi.\n` +
    `  Format: \`!force <ruangan> <tgl> <slot> <alasan>\`\n` +
    `  Contoh: \`!force RAK_2.1 15/10/2026 DEF Ujian Sertifikasi\`\n\n` +
    `• *!forceevent* / *!event* / *!blokir*\n` +
    `  Pemblokiran ruangan untuk kegiatan/seminar kampus.\n` +
    `  Format: \`!forceevent <ruangan> <tgl/rentang> <slot> <agenda>\`\n` +
    `  Contoh: \`!forceevent RAK_ALL 20/10/2026 A-O Dies Natalis\`\n\n` +
    `• *!abort* / *!batalforce*\n` +
    `  Mencabut status force booking atau blokir event.\n` +
    `  Format: \`!abort booking <id_booking>\` atau \`!abort event <id_event>\`\n` +
    `  Contoh: \`!abort booking 42\`\n\n` +
    `📌 *Kamus Slot Perkuliahan (50 Menit/SKS):*\n` +
    `Slot A (07.30), B (08.20), C (09.10), D (10.10), E (11.00), F (11.50)\n` +
    `Slot H = Istirahat/Ishoma (12.00 - 13.00)\n` +
    `Slot I (13.00), J (13.50), K (14.40), L (15.40), M (16.30), N (17.20), O (18.10-21.10)\n\n` +
    `💻 *Perintah CLI (Terminal Admin):*\n` +
    `Untuk staf/admin melalui terminal server, jalankan \`denia help\` untuk melihat opsi seeder, user whitelist, dan sinkronisasi spreadsheet.`
  );
}

/**
 * Format detail bantuan untuk satu perintah spesifik
 */
function formatSingleCommandHelp(cmd: string, isStaffOrAdmin: boolean): string {
  switch (cmd) {
    case 'pinjam':
    case 'book':
      return (
        `📌 *Panduan Perintah: !pinjam (Alias: !book)*\n\n` +
        `Digunakan untuk meminjam ruangan perkuliahan SDP reguler.\n\n` +
        `*Format:* \`!pinjam <kode_ruangan> <tgl_DD/MM/YYYY> <kode_slot> [keterangan]\`\n` +
        `*Contoh:* \`!pinjam RAK_2.1 15/10/2026 DEF Kuliah Pengganti Basis Data\`\n\n` +
        `*Aturan & Ketentuan:*\n` +
        `1. Wajib dipesan minimal *H-1* hari sebelum hari pemakaian (aturan Korti).\n` +
        `2. Durasi peminjaman berkisar antara *1 sampai 4 SKS* per transaksi.\n` +
        `3. Kode slot harus berupa huruf alfabetik berurutan/kontigu (misal \`DEF\` sah, \`ADF\` ditolak).\n` +
        `4. Identitas peminjam dipetakan otomatis melalui nomor WhatsApp pengirim.`
      );

    case 'batal':
    case 'cancel':
      return (
        `📌 *Panduan Perintah: !batal (Alias: !cancel)*\n\n` +
        `Digunakan untuk membatalkan peminjaman ruangan reguler aktif milik Anda.\n\n` +
        `*Format:* \`!batal <kode_ruangan> <tgl_DD/MM/YYYY> <kode_slot>\`\n` +
        `*Contoh:* \`!batal RAK_2.1 15/10/2026 DEF\`\n\n` +
        `*Aturan & Ketentuan:*\n` +
        `1. Hanya pemesan asli atau Staf/Admin yang berhak membatalkan jadwal.\n` +
        `2. Slot yang dibatalkan akan segera tersedia kembali untuk dipesan oleh kelas lain.`
      );

    case 'info':
    case 'jadwal':
      return (
        `📌 *Panduan Perintah: !info (Alias: !jadwal)*\n\n` +
        `Digunakan untuk memeriksa matriks ketersediaan ruangan SDP.\n\n` +
        `*Format:*\n` +
        `• \`!info\` : Cek seluruh ruangan untuk hari ini\n` +
        `• \`!info [DD/MM/YYYY|besok]\` : Cek seluruh ruangan pada tanggal tertentu\n` +
        `• \`!info [kode_ruangan] [DD/MM/YYYY]\` : Cek ruangan spesifik pada tanggal tertentu\n\n` +
        `*Contoh:*\n` +
        `• \`!info besok\`\n` +
        `• \`!info RAK_2.1 15/10/2026\`\n\n` +
        `*Catatan:* Jika dipanggil di dalam grup WhatsApp, matriks lengkap dikirimkan via chat pribadi (DM) agar tidak memenuhi riwayat chat grup.`
      );

    case 'force':
    case 'ambilalih':
    case 'paksa':
      return (
        `📌 *Panduan Perintah: !force (Alias: !ambilalih, !paksa) ${isStaffOrAdmin ? '✅' : '🔒 [Khusus Staf/Admin]' }*\n\n` +
        `Digunakan untuk pengambilalihan paksa ruangan untuk agenda mendesak institusi.\n\n` +
        `*Format:* \`!force <kode_ruangan> <tgl_DD/MM/YYYY> <kode_slot> <alasan_pengambilalihan>\`\n` +
        `*Contoh:* \`!force RAK_2.1 15/10/2026 DEF Ujian Sertifikasi Kompetensi\`\n\n` +
        `*Aturan & Ketentuan:*\n` +
        `1. Hanya dapat dijalankan oleh akun dengan role *staf* atau *admin*.\n` +
        `2. Menggeser peminjaman reguler yang telah ada dan otomatis mengirim notifikasi DM kepada peminjam terdampak.`
      );

    case 'forceevent':
    case 'event':
    case 'blokir':
      return (
        `📌 *Panduan Perintah: !forceevent (Alias: !event, !blokir) ${isStaffOrAdmin ? '✅' : '🔒 [Khusus Staf/Admin]' }*\n\n` +
        `Digunakan untuk memblokir ruangan untuk agenda institusi/seminar/dies natalis.\n\n` +
        `*Format:* \`!forceevent <kode_ruangan|RAK_ALL> <tgl|tglAwal-tglAkhir> <kode_slot|A-O> <nama_agenda>\`\n` +
        `*Contoh:* \`!forceevent RAK_ALL 20/10/2026 A-O Dies Natalis Undiksha\`\n\n` +
        `*Aturan & Ketentuan:*\n` +
        `1. Hanya dapat dijalankan oleh akun dengan role *staf* atau *admin*.\n` +
        `2. Mendukung rentang tanggal (DD/MM/YYYY-DD/MM/YYYY) dan kode ruangan gabungan/semua (\`RAK_ALL\`).`
      );

    case 'abort':
    case 'batalforce':
      return (
        `📌 *Panduan Perintah: !abort (Alias: !batalforce) ${isStaffOrAdmin ? '✅' : '🔒 [Khusus Staf/Admin]' }*\n\n` +
        `Digunakan untuk mencabut status force booking atau agenda blokir event.\n\n` +
        `*Format:*\n` +
        `• \`!abort booking <id_booking>\`\n` +
        `• \`!abort event <id_event>\`\n\n` +
        `*Contoh:* \`!abort booking 42\` atau \`!abort event 7\`\n\n` +
        `*Aturan & Ketentuan:*\n` +
        `1. Hanya dapat dijalankan oleh akun dengan role *staf* atau *admin*.\n` +
        `2. Peminjaman reguler yang sebelumnya tergeser akan dipulihkan secara otomatis jika memungkinkan.`
      );

    case 'help':
    case 'panduan':
    case 'bantuan':
    case 'menu':
      return (
        `📌 *Panduan Perintah: !help*\n\n` +
        `Menampilkan ringkasan seluruh perintah atau detail perintah spesifik.\n\n` +
        `*Format:* \`!help [nama_perintah]\`\n` +
        `*Contoh:*\n` +
        `• \`!help\`\n` +
        `• \`!help pinjam\`\n` +
        `• \`!help info\`\n` +
        `• \`!help force\``
      );

    default:
      return (
        `⚠️ Perintah *!${cmd}* tidak dikenali dalam kamus bantuan.\n\n` +
        `Gunakan *!help* tanpa argumen untuk melihat seluruh daftar perintah yang valid.`
      );
  }
}
