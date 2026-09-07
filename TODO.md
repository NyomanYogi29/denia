# Master Todo List: Bot WhatsApp "Denia"

> Proyek: Sistem Booking Ruangan SDP Undiksha berbasis WhatsApp Bot (Bun + Baileys + SQLite/Drizzle + Google Sheets Mirror) - Selaras dengan Spesifikasi Operasional V2

---

### 🔹 Fase 1: Fondasi Database & Konfigurasi Dasar
- [x] **1.1 Setup Google Cloud Service Account & Google Sheets Access**
  - Menggunakan format raw JSON: `GOOGLE_SERVICE_ACCOUNT_KEY`.
  - Akses Editor Google Sheet telah di-share ke: `sheets-editor@denia-507501.iam.gserviceaccount.com`.
- [x] **1.2 Setup Environment Variables (`.env`) & Config Loader**
  - Menggunakan native `Bun.env`, functional parser (tanpa class), dan `Object.freeze`.
  - Type-safe config loader terisolasi di `src/core/config/`.
- [x] **1.3 Penyelarasan Skema Database Drizzle V2 (`src/core/db/schema.ts`)**
  - Tambahkan tabel `rooms`: `code` (PK), `building`, `floor`, `room_name`, `capacity`, `is_active`.
  - Refactor tabel `users`: eliminasi `nim`, tambahkan `fakultas`, `prodi`, `semester`, `no_telp`.
  - Update tabel `bookings`: tambahkan `booking_type` (`regular`, `adhoc`, `institutional`), foreign key ke `rooms.code`.
  - Pertahankan indeks unik penangkal race condition: `UNIQUE(room_code, booking_date, slot_code, status)`.
- [x] **1.4 Migrasi Skema Database SQLite V2**
  - Jalankan migrasi Drizzle untuk memperbarui skema lokal di `data/mydb.sqlite` (dan `data/bot.db`).
  - Update database seeder master ruangan awal ke tabel `rooms`.

---

### 🔹 Fase 1.5: Logging & Standarisasi Respon Sistem (Pino + Formatter)
- [x] **1.5.1 Setup Logger Terpusat dengan Pino & Pino-Pretty (`src/core/logger/`)**
  - Dependensi `pino` dan `pino-pretty` terpasang.
  - `src/core/logger/init.ts`, `src/core/logger/logger.ts` (`AppLogger`), dan `src/core/logger/index.ts` dibuat.
  - Mendukung `logger.child({ module })`, `logger.success()`, `logger.error()`, `logger.info()`, `logger.warn()`, `logger.debug()`.
- [x] **1.5.2 Standarisasi Custom Application Errors & Error Codes (`src/core/errors/`)**
  - `src/core/errors/codes.ts`: Definisi enum/konstanta `ErrorCode` (tambahkan `INVALID_BOOKING_LEAD_TIME` untuk aturan H-1).
  - `src/core/errors/app-error.ts`: Implementasi `AppError`, `UnauthorizedError`, `SlotConflictError`, `ValidationError`, `NotFoundError`.
  - `src/core/errors/resolver.ts`: Error resolver berbasis `switch-case` (`resolveError()`) untuk pemetaan error SQLite, Baileys, dan pesan ramah WhatsApp Japri/DM.
  - `src/core/errors/index.ts`: Barrel export.
- [x] **1.5.3 Standarisasi Kontrak Respon Sistem (Result Pattern) (`src/core/types/`)**
  - `src/core/types/result.ts`: Generic type-safe `Result<T, E = AppError>` (`{ success: true, data: T } | { success: false, error: E }`).
  - Helper functions `ok<T>(data: T)` dan `err<E>(error: E)`.
- [x] **1.5.4 Template & Formatter Pesan WhatsApp (`src/core/templates/`)**
  - `src/core/templates/batch-recap.ts`: Template rekap batch sukses untuk grup WA.
  - `src/core/templates/direct-message.ts`: Template penolakan/error khusus Japri/DM.
  - `src/core/templates/reaction.ts`: Standarisasi emoji reaksi status interaksi (`⏳` proses, `✅` sukses buffer, `❌` gagal).

---

### 🔹 Fase 2: Kamus Domain & Validasi Inti (*Core Utilities*)
- [x] **2.1 Penyelarasan Kamus Waktu Akademik SKS 50 Menit & Master Ruangan (`src/core/constants/`)**
  - Update `src/core/constants/slots.ts`: Durasi resmi perkuliahan 50 menit per SKS (Slot A: 07:30 - 08:20 s.d. Slot O: 21:10 - 22:00, dengan slot H Ishoma 60 menit).
  - Verifikasi kamus master ruangan di `src/core/constants/rooms.ts` agar selaras dengan tabel `rooms`.
- [x] **2.2 Slot Parsing & Continuity Validator (`src/core/utils/slot-parser.ts`)**
  - Validasi alfabetik `A-O`, validasi urutan kontigu (`DEF` sah, `ADF` tolak), pembatasan durasi 1–4 SKS per transaksi.
- [x] **2.3 Date & Lead Time (H-1) Validator (`src/core/utils/date.ts`)**
  - Validasi format tanggal `DD/MM/YYYY`, kalender kabisat, konversi ke ISO `YYYY-MM-DD`.
  - Implementasi fungsi validasi aturan **H-1 peminjaman** untuk peminjaman reguler Korti (`validateBookingLeadTime`).

---

### 🔹 Fase 3: Integrasi Baileys WhatsApp & State Management
- [x] **3.1 Connection Manager (`src/bot/client.ts`)**
  - Integrasi `@whiskeysockets/baileys` dengan `useMultiFileAuthState` ke folder `auth_info/`.
  - Tampilkan QR code terminal dan dukungan opsi Pairing Code.
  - Auto-reconnect saat stream restart/disconnect.
- [ ] **3.2 Automated Seeder Korti dari Spreadsheet (`src/core/services/seeder.service.ts` & `src/cli/`)**
  - Script membaca sheet `KORTI ` dari file master `RUANG KULIAH SDP DENPASAR.xlsx`.
  - Normalisasi nomor telepon menjadi WhatsApp JID (`628xxx@s.whatsapp.net`).
  - Upsert data ke tabel `users` (nama, fakultas, prodi, semester, kelas, no_telp, role).
  - CLI command: `denia seed korti` untuk eksekusi seeder dari terminal.
  - Penyesuaian `denia user add` agar selaras dengan skema pengguna baru tanpa NIM.
- [ ] **3.3 Pesan Masuk & Router Handler (`src/bot/events.ts`)**
  - Filter prefix perintah tanda seru (`!`).
  - Ekstraksi otomatis WhatsApp JID pengirim (`message.key.participant || message.key.remoteJid`).
  - Auto-resolution identitas pengguna dari tabel `users`.
  - Kirim reaksi emoji instan `⏳` pada pesan yang sedang diproses.
- [ ] **3.4 Response Dispatcher (`src/bot/responder.ts`)**
  - Pengiriman pesan pribadi (*DM/Japri*) untuk notifikasi error/penolakan.
  - Pembaruan reaksi emoji (`✅` untuk berhasil masuk buffer, `❌` untuk ditolak).

---

### 🔹 Fase 4: Micro-Batch Buffer Service (Pencegah Spam Grup)
- [ ] **4.1 Tumbling Window Buffer (`src/core/services/buffer.service.ts`)**
  - Implementasikan buffer penampung transaksi sukses dengan interval fixed window **60 detik**.
  - Menggabungkan seluruh transaksi sukses selama 1 menit ke dalam **1 pesan rekap terstruktur** yang dikirim ke grup WhatsApp.
  - Reset buffer setelah pesan rekap terkirim.

---

### 🔹 Fase 5: Implementasi Modul Perintah (Command Handlers)

#### 🔸 Role Mahasiswa / Korti:
- [ ] **5.1 `!pinjam [kode_ruangan] [DD/MM/YYYY] [kode_slot]`**
  - Auto-resolution pengguna via JID pengirim (tanpa input NIM/nama).
  - Validasi aturan minimal H-1 dari hari pemakaian.
  - Validasi slot alfabetik kontigu & ketersediaan slot (cek booking aktif dan force event).
  - Eksekusi transaksi SQLite dengan `BEGIN IMMEDIATE`.
  - Masukkan transaksi sukses ke *micro-batch buffer*.
- [ ] **5.2 `!batal [kode_ruangan] [DD/MM/YYYY] [kode_slot]`**
  - Validasi kepemilikan slot berdasarkan WhatsApp JID pengirim atau role admin/staf.
  - Ubah status booking menjadi `cancelled`.
- [ ] **5.3 `!info [DD/MM/YYYY]` atau `!info`**
  - Tampilkan matriks ketersediaan seluruh ruangan per slot SKS pada tanggal yang diminta.

#### 🔸 Role Staf / Admin:
- [ ] **5.4 `!force [kode_ruangan] [DD/MM/YYYY] [kode_slot] [alasan]`**
  - Pengambilalihan paksa slot ruangan untuk agenda institusi/dosen pengampu mendadak.
  - Parameter alasan wajib dicantumkan.
  - Menimpa booking yang ada (ubah status booking korti lama menjadi `force_cancelled`).
  - Kirim peringatan otomatis via DM ke korti terdampak untuk mencari kelas lain via `!info`.
- [ ] **5.5 `!forceevent [list_ruangan] [DD/MM/YYYY-DD/MM/YYYY] [nama_acara]`**
  - Blokir sekumpulan ruangan sekaligus untuk rentang tanggal tertentu (seminar/ujian).
- [ ] **5.6 `!abort force [id_booking]`**
  - Membatalkan status pemblokiran/force ruangan oleh admin.

---

### 🔹 Fase 6: Background Sync Google Sheets & Cron Scheduler
- [ ] **6.1 Google Sheets Mirror Worker (`src/core/services/sheets.service.ts`)**
  - Background worker batch sync berkala untuk update template monitoring staf SDP.
  - Format penulisan sel seragam: `[Prodi]/[Kelas]/[Nama Dosen atau Korti]` (Contoh: `SI/3DPS/Ir. I Made Ardwi Pradnyana`).
- [ ] **6.2 Cron Job Rekap Harian (`src/core/cron/daily-recap.ts`)**
  - Eksekusi setiap pukul **07:00 pagi** setiap hari.
  - Kirim rekap status seluruh ruangan untuk hari H dan H+1 ke grup utama.

---

### 🔹 Fase 7: Testing, Hardening & Deployment
- [ ] **7.1 Uji Validasi SKS Matrix 50 Menit & Continuity**
  - Unit test slot A-O, format jam baru, dan penolakan slot non-kontigu.
- [ ] **7.2 Uji Aturan H-1 Peminjaman (Lead Time Rule)**
  - Verifikasi penolakan pemesanan hari H oleh Korti dan pemberian izin untuk Staf/Admin.
- [ ] **7.3 Uji Beban & Race Condition Test**
  - Simulasi 2 korti melakukan request `!pinjam` pada slot yang sama di milidetik bersamaan via SQLite `BEGIN IMMEDIATE`.
- [ ] **7.4 Uji Automated Seeder Spreadsheet `KORTI `**
  - Validasi parsing file spreadsheet, normalisasi no HP ke JID, dan keakuratan data di tabel `users`.
