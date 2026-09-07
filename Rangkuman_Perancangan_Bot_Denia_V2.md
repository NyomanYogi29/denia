# Rangkuman Diskusi & Spesifikasi Perancangan Bot WhatsApp "Denia" (Sistem Booking Ruangan SDP Undiksha) - Updated V2

Dokumen ini memuat rangkuman terperinci, objektif, dan telah diselaraskan dengan kondisi operasional nyata di lapangan berdasarkan analisis file spreadsheet master `RUANG KULIAH SDP DENPASAR.xlsx` dan kesepakatan arsitektur terbaru.

---

## 1. Identitas & Tujuan Utama Sistem

* **Nama Bot:** Denia
* **Kategori:** Multipurpose WhatsApp Bot (Driving Adapter)
* **Target Lingkungan:** Lingkungan Sumber Daya Pembelajaran (SDP) Universitas Pendidikan Ganesha (Undiksha) Kampus Denpasar.
* **Fokus / Tujuan Utama:**
  1. **Automasi Booking Ruangan:** Menggantikan proses pengisian manual spreadsheet yang rawan konflik, penimpaan (*data overwriting*), dan salah format oleh Koordinator Tingkat (Korti).
  2. **Transparansi & Kontrol Staf SDP:** Memantau penggunaan ruangan kelas secara *real-time*, memfasilitasi intervensi resmi (*force booking* untuk agenda institusional/seminar), serta menyediakan riwayat audit (*audit trail*).
  3. **Pencegahan Monopoli & Friksi:** Memvalidasi aturan operasional kampus secara otomatis (validasi slot waktu kontigu, kuota durasi SKS, dan aturan H-1 peminjaman).
* **Lingkungan Deploy:** Grup WhatsApp resmi seluruh korti angkatan SDP Undiksha Denpasar.

---

## 2. Analisis & Sinkronisasi dengan Operasional Lapangan (Spreadsheet SDP)

Berdasarkan evaluasi terhadap file operasional `RUANG KULIAH SDP DENPASAR.xlsx`, terdapat beberapa fakta penting lapangan yang diselaraskan ke dalam sistem:

1. **Aturan H-1 Peminjaman (Alasan Tampilan Hari Tetap):**
   * Di spreadsheet, template disusun per tab hari tetap (**SENIN** s.d. **JUMAT**) karena aturan operasional SDP mewajibkan peminjaman ruangan dilakukan maksimal **H-1 hari sebelum pemakaian** (misalnya, jika ingin memakai ruangan hari Rabu, korti harus memesan/mengabari hari Selasa).
   * **Keputusan Denia:** Bot tetap mendukung parameter tanggal spesifik (`DD/MM/YYYY`) untuk mengakomodasi kasus khusus (*edge cases*), seperti dosen yang memesan ruangan jauh-jauh hari (misal 1 bulan sebelumnya untuk ujian/kuliah pengganti), namun bot mengunci validasi minimum H-1 untuk peminjaman reguler oleh korti.
2. **Anomali Sheet1 (Tanggal 9 September vs SENIN):**
   * Di lembar `Sheet1`, tertulis judul `TANGGAL: 2026-09-09` bersanding dengan kolom `SENIN`. Padahal 9 September 2026 jatuh pada hari Rabu.
   * **Kesimpulan Sistem:** `Sheet1` merupakan draf/arsip contoh statis (*mockup template*) yang pernah disalin oleh staf TU/dosen tanpa memperbarui nama hari, terbukti dari adanya sel instruksi *"format pengisian : jurusan/semester/dosen"* dan baris contoh *"CONTOH TU /SMT 1/DODI S."*. Denia mengabaikan inkonsistensi teks manual ini dan menggunakan kalender ISO penanggalan nyata yang valid.
3. **Format Standar Jam Perkuliahan (SKS Matrix Resmi):**
   * Kampus menggunakan durasi baku perkuliahan 50 menit per SKS dengan jeda istirahat dan sesi maghrib/ishoma terstruktur. Slot diperpanjang hingga slot **O** (pukul 22:00 / jam 10 malam).
4. **Otomatisasi Identitas & Eliminasi NIM:**
   * Di sheet `KORTI `, data yang tersedia dari kampus adalah: *Fakultas, Prodi, Semester, Kelas, Nama, dan No Telp (WhatsApp)*. **NIM tidak tersedia di sheet tersebut**.
   * **Keputusan Denia:** Parameter NIM dihapus (*dumped*) dari flow utama. Sistem melakukan pemetaan otomatis (*auto-resolution*) berdasarkan **WhatsApp JID** (`message.key.participant`). Setiap pesan yang masuk dari JID yang terdaftar otomatis teridentifikasi nama peminjam dan kelasnya tanpa perlu mengetik manual.

---

## 3. Kamus Waktu Akademik Resmi (SKS Matrix)

Durasi perkuliahan mengacu pada ketentuan 50 menit per SKS (dengan slot H sebagai blok 60 menit dan jeda pergantian sesi). Kamus slot resmi dari slot **A** hingga **O**:

| Kode Slot | Rentang Jam Operasional | Keterangan / Durasi |
| :---: | :---: | :--- |
| **A** | 07:30 - 08:20 | SKS Pagi 1 (50 menit) |
| **B** | 08:30 - 09:20 | SKS Pagi 2 (50 menit) |
| **C** | 09:30 - 10:20 | SKS Pagi 3 (50 menit) |
| **D** | 10:30 - 11:20 | SKS Siang 1 (50 menit) |
| **E** | 11:30 - 12:20 | SKS Siang 2 (50 menit) |
| **F** | 12:30 - 13:20 | SKS Siang 3 (50 menit) |
| **G** | 13:30 - 14:20 | SKS Sore 1 (50 menit) |
| **H** | 14:30 - 15:30 | SKS Jeda / Ishoma (60 menit) |
| **I** | 15:30 - 16:20 | SKS Sore 2 (50 menit) |
| **J** | 16:20 - 17:10 | SKS Sore 3 (50 menit) |
| **K** | 17:30 - 18:20 | SKS Malam 1 (50 menit) |
| **L** | 18:20 - 19:10 | SKS Malam 2 (50 menit) |
| **M** | 19:30 - 20:20 | SKS Malam 3 (50 menit) |
| **N** | 20:20 - 21:10 | SKS Malam 4 (50 menit) |
| **O** | 21:10 - 22:00 | SKS Malam 5 / Batas Operasional Jam 10 Malam |

---

## 4. Mekanisme Perintah (Command Interface)

Denia menerima perintah di grup WhatsApp menggunakan trigger tanda seru (`!`), dengan parser otomatis berbasis identitas JID WhatsApp:

### A. Perintah Mahasiswa / Korti
* `!pinjam [kode_ruangan] [DD/MM/YYYY] [kode_slot]`
  * Mahasiswa tidak perlu menginput nama atau NIM. Sistem langsung membaca pengirim pesan.
  * Contoh: `!pinjam RAK_2.1 10/09/2026 DEF`
  * Validasi: Minimal H-1 dari tanggal pemakaian, slot huruf harus kontigu (`DEF` sah, `ADF` ditolak), maksimal 3–4 SKS per booking.
* `!batal [kode_ruangan] [DD/MM/YYYY] [kode_slot]`
  * Membatalkan peminjaman yang sebelumnya dilakukan oleh pengirim bersangkutan (hanya pemesan atau admin yang berhak membatalkan).
  * Contoh: `!batal RAK_2.1 10/09/2026 DEF`
* `!info [DD/MM/YYYY]` atau `!info`:
  * Menampilkan visualisasi ketersediaan ruangan pada tanggal tertentu.

### B. Perintah Staf & Administrator
* `!force [kode_ruangan] [DD/MM/YYYY] [kode_slot] [alasan]`
  * Mengambil alih paksa slot ruangan untuk agenda institusi/dosen pengampu mendadak. Bot otomatis membatalkan booking korti sebelumnya dan mengirimkan notifikasi japri.
  * Contoh: `!force RAK_2.1 10/09/2026 DEF Kuliah Pengganti Dosen`
* `!forceevent [list_ruangan] [DD/MM/YYYY-DD/MM/YYYY] [nama_acara]`
  * Memblokir kumpulan ruangan untuk rentang hari tertentu untuk ujian atau seminar nasional.
* `!abort force [id_booking]`
  * Membatalkan status penguncian ruangan oleh admin.

---

## 5. Skema Basis Data Relasional (SQLite / Drizzle)

Sistem menggunakan SQLite lokal (`bun:sqlite`) sebagai *single source of truth* dengan skema normalisasi berikut:

```sql
-- 1. Master Data Gedung & Ruangan
CREATE TABLE rooms (
    code TEXT PRIMARY KEY,          -- 'RAK_1.1', 'RAK_2.1', 'KHD_HYBRID'
    building TEXT NOT NULL,         -- 'R.A. Kartini', 'Ki Hajar Dewantara'
    floor INTEGER,                  -- Lantai gedung (1, 2, 3, 4)
    room_name TEXT NOT NULL,        -- 'Ruang 1.1', 'Lab Hybrid'
    capacity INTEGER DEFAULT 40,
    is_active INTEGER DEFAULT 1     -- 1 = Aktif, 0 = Nonaktif/Perbaikan
);

-- 2. Master Data Pengguna (Korti & Staf) - NIM di-dump karena tidak ada di master sheet
CREATE TABLE users (
    jid TEXT PRIMARY KEY,           -- '628123456789@s.whatsapp.net'
    nama TEXT NOT NULL,             -- Nama Korti
    fakultas TEXT,                  -- 'FBS', 'FIP', 'FTK', dsb.
    prodi TEXT,                     -- 'PBI', 'PGSD', 'PTI', 'SI', dsb.
    semester INTEGER,               -- 1, 3, 5, 7
    kelas TEXT NOT NULL,            -- 'H', '3DPS', '5A', dsb.
    no_telp TEXT NOT NULL,          -- Format asli nomor HP
    role TEXT DEFAULT 'korti',      -- 'korti' | 'staff' | 'admin'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. Transaksi Peminjaman Ruangan
CREATE TABLE bookings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,        -- Foreign key ke rooms(code)
    booking_date TEXT NOT NULL,     -- Format ISO: 'YYYY-MM-DD'
    slot_code TEXT NOT NULL,        -- 'A', 'B', 'C', ..., 'O' (disimpan per 1 unit SKS)
    user_jid TEXT NOT NULL,         -- Foreign key ke users(jid)
    status TEXT DEFAULT 'active',   -- 'active' | 'force_cancelled' | 'cancelled'
    booking_type TEXT DEFAULT 'adhoc', -- 'regular' (jadwal rutin) | 'adhoc' | 'institutional'
    notes TEXT,                     -- Catatan matakuliah/dosen
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(room_code) REFERENCES rooms(code),
    FOREIGN KEY(user_jid) REFERENCES users(jid),
    UNIQUE(room_code, booking_date, slot_code, status)
);
```

---

## 6. Integrasi & Otomasi Sinkronisasi Spreadsheet

1. **Automated Seeder (`KORTI ` Sheet to SQLite):**
   * Script Bun membaca data dari sheet `KORTI ` yang diisi oleh para mahasiswa.
   * Melakukan pembersihan format string nomor HP (menghapus karakter `*`, spasi, atau tanda petik).
   * Mengonversi nomor HP menjadi format standar WhatsApp JID (`628xxx@s.whatsapp.net`).
   * Melakukan *upsert* ke tabel `users`, sehingga registrasi korti berjalan otomatis tanpa intervensi manual staf.
2. **Google Sheets Mirror Worker:**
   * SQLite tetap bertindak sebagai *transactional database* dengan garansi ACID bebas *race condition*.
   * *Background worker* secara asinkron mengekspor status peminjaman aktif ke template Google Sheets mirror, memetakan data ke format sel seragam:
     `[Prodi]/[Kelas]/[Nama Dosen atau Korti]`
     *(Contoh: SI/3DPS/Ir. I Made Ardwi Pradnyana)*.

---

## 7. Arsitektur Kode & Clean Architecture

Aplikasi memisahkan antarmuka terminal (CLI) dan bot WhatsApp (Baileys) sebagai **Driving Adapters** yang memanggil use case yang sama di `core/`:

* **`src/core/`**:
  * `domain/`: Entity `User`, `Room`, `Booking`, serta Interface `UserRepository`, `RoomRepository`, `BookingRepository`.
  * `application/`: Use case transaksi (`BookRoomUseCase`, `CancelBookingUseCase`, `ForceBookingUseCase`, `ImportKortiFromSheetUseCase`).
* **`src/infrastructure/`**:
  * Implementasi Drizzle ORM / SQLite untuk repositori.
  * Baileys socket provider dan Google Sheets API client.
* **`src/cli/` (Adapter 1 - Terminal):**
  * Perintah administrasi terminal untuk seeder, audit database, dan manajemen darurat.
* **`src/bot/` (Adapter 2 - WhatsApp):**
  * Message handlers, tumbling window buffer rekap grup, dan emoji reaction dispatcher.

---

## 8. CLI Administration & Danger Zone Maintenance (`flushdb`)

Sistem menyediakan antarmuka CLI sebagai *driving adapter* untuk kebutuhan operasional, seeder, dan pemeliharaan darurat basis data:

1. **Perintah Whitelist & Seeder:**
   * `denia user add`: Mendaftarkan korti/staf baru ke whitelist secara manual atau interaktif tanpa NIM.
   * `denia seed korti`: Mengimpor dan menyinkronkan seluruh Korti dari sheet `KORTI ` file master spreadsheet (`--dry-run` untuk mode simulasi tanpa menulis ke database).

2. **Perintah Danger Zone (`flushdb`):**
   * Digunakan oleh administrator teknis untuk mereset atau membersihkan tabel tertentu pada database lokal SQLite:
     * `denia flushdb all`: Mengosongkan seluruh tabel transaksi dan master (`bookings`, `force_events`, `users`, `rooms`).
     * `denia flushdb user`: Mengosongkan data seluruh pengguna/korti terdaftar (beserta relasi transaksinya).
     * `denia flushdb rooms`: Mengosongkan master data ruangan.
     * `denia flushdb force_events`: Menghapus seluruh rekaman pemblokiran institusi.
     * `denia flushdb bookings`: Menghapus seluruh transaksi peminjaman ruangan.
   * **Mekanisme Guard:** Secara default, perintah memunculkan prompt konfirmasi interaktif berbahaya di terminal. Untuk eksekusi script / non-interaktif, wajib menyertakan flag `--force` (`-f`).

3. **Roadmap Proteksi Keamanan: Master Password Enforcement:**
   * Untuk mencegah eksekusi destruktif yang tidak disengaja (*accidental wipeout*) di lingkungan server/produksi, sistem dirancang untuk mendukung guard ganda berbasis **Master Password**:
     * Konfigurasi `DENIA_MASTER_PASSWORD` pada file `.env` (disimpan dalam bentuk hash yang aman).
     * Setiap pemanggilan perintah kategori *Danger Zone* (`flushdb`, reset lisensi, dsb.) akan mewajibkan verifikasi kata sandi master sebelum perintah dieksekusi.
     * Proteksi pembatasan percobaan gagal (*lockout / rate-limiting*) untuk menangkal *brute-force* lokal.