# 📋 Master Todo List: Bot WhatsApp "Denia"

> Proyek: Sistem Booking Ruangan SDP Undiksha berbasis WhatsApp Bot (Bun + Baileys + SQLite/Drizzle + Google Sheets Mirror)

---

### 🔹 Fase 1: Fondasi Database & Konfigurasi Dasar
- [x] **1.1 Setup Google Cloud Service Account & Google Sheets Access**
  - Menggunakan format raw JSON: `GOOGLE_SERVICE_ACCOUNT_KEY`.
  - Akses Editor Google Sheet telah di-share ke: `sheets-editor@denia-507501.iam.gserviceaccount.com`.
- [x] **1.2 Setup Environment Variables (`.env`) & Config Loader**
  - Menggunakan native `Bun.env`, functional parser (tanpa class), dan `Object.freeze`.
  - Type-safe config loader terisolasi di `src/config/`.
- [x] **1.3 Setup Skema Database Drizzle (`src/db/schema.ts`)**
  - Tabel `users`, `bookings`, dan `force_events` diinisialisasi.
  - Menggunakan Drizzle v1 `defineRelations` dan SQLite indexing.
  - Client database `src/db/index.ts` dengan WAL mode & foreign keys.
- [x] **1.4 Migration & Indexing**
  - Schema telah di-push dan migration tersimpan di `drizzle/`.
  - Database SQLite lokal tersimpan di `data/mydb.sqlite` dengan unique indexing.

---

### 🔹 Fase 1.5: Logging & Standarisasi Respon Sistem (Pino + Formatter)
- [x] **1.5.1 Setup Logger Terpusat dengan Pino & Pino-Pretty (`src/logger/`)**
  - Dependensi `pino` dan `pino-pretty` terpasang.
  - `src/logger/init.ts`, `src/logger/logger.ts` (`AppLogger`), dan `src/logger/index.ts` dibuat.
  - Mendukung `logger.child({ module })`, `logger.success()`, `logger.error()`, `logger.info()`, `logger.warn()`, `logger.debug()`.
- [x] **1.5.2 Standarisasi Custom Application Errors & Error Codes (`src/errors/`)**
  - `src/errors/codes.ts`: Definisi enum/konstanta `ErrorCode` lengkap.
  - `src/errors/app-error.ts`: Implementasi `AppError`, `UnauthorizedError`, `SlotConflictError`, `ValidationError`, `NotFoundError`.
  - `src/errors/resolver.ts`: Error resolver berbasis `switch-case` (`resolveError()`) untuk SQLite unique constraint mapping, pembuatan pesan WhatsApp Japri/DM, dan level log.
  - `src/errors/index.ts`: Barrel export.
- [x] **1.5.3 Standarisasi Kontrak Respon Sistem (Result Pattern) (`src/types/`)**
  - Buat `src/types/result.ts`: Generic type-safe `Result<T, E = AppError>` (`{ success: true, data: T } | { success: false, error: E }`).
  - Sediakan helper functions `ok<T>(data: T): Result<T>` dan `err<E>(error: E): Result<never, E>`.
  - Buat `src/types/index.ts` untuk barrel export.
- [ ] **1.5.4 Template & Formatter Pesan WhatsApp (`src/templates/`)**
  - Buat `src/templates/batch-recap.ts`: Builder template rekap batch sukses untuk grup WA (header tanggal, daftar ruangan, jam SKS, peminjam).
  - Buat `src/templates/direct-message.ts`: Builder template penolakan/error khusus Japri/DM (penjelasan penyebab dan saran solutif).
  - Buat `src/templates/reaction.ts`: Standarisasi emoji reaksi status interaksi (`⏳` proses, `✅` sukses buffer, `❌` gagal).
  - Buat `src/templates/index.ts` untuk barrel export.

---

### 🔹 Fase 2: Kamus Domain & Validasi Inti (*Core Utilities*)
- [ ] **2.1 Kamus Waktu Akademik SKS (`src/constants/slots.ts`)**
  - Definisikan mapping slot `A` (07:30 - 08:30) sampai `O` (21:30 - 22:30).
- [ ] **2.2 Slot Parsing & Continuity Validator (`src/utils/slot-parser.ts`)**
  - Fungsi validasi alfabetik `A-O`.
  - Fungsi validasi urutan kontigu/sekuensial (e.g., `DEF` ✅, `ADF` ❌).
  - Pembatasan durasi maksimum (maksimal 3–4 SKS per pemesanan).
- [ ] **2.3 Date & Room Parser (`src/utils/date.ts`, `src/constants/rooms.ts`)**
  - Validasi format tanggal `DD/MM/YYYY` dan konversi ke ISO `YYYY-MM-DD`.
  - Validasi kode ruangan yang terdaftar di SDP Undiksha (e.g., `RAK_4.1`).

---

### 🔹 Fase 3: Integrasi Baileys WhatsApp & State Management
- [ ] **3.1 Connection Manager (`src/bot/client.ts`)**
  - Integrasi `@whiskeysockets/baileys` dengan `useMultiFileAuthState` ke folder `auth_info/`.
  - Tampilkan QR code terminal menggunakan `qrcode-terminal`.
  - Implementasi auto-reconnect saat stream restart/disconnect.
- [ ] **3.2 Pesan Masuk & Router Handler (`src/bot/events.ts`)**
  - Filter prefix perintah tanda seru (`!`).
  - Ekstraksi JID pengirim asli (`message.key.participant || message.key.remoteJid`).
  - Kirim reaksi emoji instan `⏳` pada pesan yang sedang diproses.
- [ ] **3.3 Response Dispatcher (`src/bot/responder.ts`)**
  - Pengiriman pesan pribadi (*DM/Japri*) untuk notifikasi error/gagal agar tidak mengotori grup.
  - Pembaruan reaksi emoji (`✅` untuk berhasil, `❌` untuk gagal).

---

### 🔹 Fase 4: Micro-Batch Buffer Service (Pencegah Spam Grup)
- [ ] **4.1 Tumbling Window Buffer (`src/services/buffer.service.ts`)**
  - Implementasikan buffer penampung transaksi sukses dengan interval jendela **60 detik**.
  - Menggabungkan seluruh transaksi sukses selama 1 menit ke dalam **1 pesan rekap terstruktur** yang dikirim ke grup.
  - Reset buffer setelah pesan rekap terkirim.

---

### 🔹 Fase 5: Implementasi Modul Perintah (Command Handlers)

#### 🔸 Role Mahasiswa / Korti:
- [ ] **5.1 `!pinjam [kode_ruangan] [DD/MM/YYYY] [kode_slot]`**
  - Validasi status pendaftaran pengguna di tabel `users`.
  - Cek ketersediaan slot (pastikan tidak ada booking `active` atau `force_event`).
  - Eksekusi transaksi SQLite dengan `BEGIN IMMEDIATE`.
  - Masukkan transaksi sukses ke *micro-batch buffer*.
- [ ] **5.2 `!batal [kode_ruangan] [DD/MM/YYYY] [kode_slot]`**
  - Validasi kepemilikan slot oleh JID pengirim.
  - Ubah status booking menjadi `cancelled`.
- [ ] **5.3 `!info` & `!cekruangan [DD/MM/YYYY]`**
  - Tampilkan matriks ketersediaan ruangan per slot SKS pada tanggal yang diminta.
- [ ] **5.4 `!reportinuse [kode_ruangan]`**
  - Kirim notifikasi eskalasi darurat otomatis ke staf/satpam SDP.

#### 🔸 Role Staf / Admin:
- [ ] **5.5 `!register @mention [NIM] [Kelas]`**
  - Mendaftarkan JID korti ke tabel `users` dengan role `korti`.
- [ ] **5.6 `!force [kode_ruangan] [DD/MM/YYYY] [kode_slot]`**
  - Menimpa booking yang ada (ubah status booking korti lama menjadi `force_cancelled`).
  - Kirim peringatan otomatis via DM ke korti terdampak untuk mencari kelas lain via `!cekruangan`.
- [ ] **5.7 `!forceevent [list_ruangan] [tgl_mulai-tgl_selesai]`**
  - Blokir sekumpulan ruangan untuk acara institusi/kampus.
- [ ] **5.8 `!abort [force|forceevent] [id]`**
  - Membatalkan status pemblokiran ruangan.

---

### 🔹 Fase 6: Background Sync Google Sheets & Cron Scheduler
- [ ] **6.1 Google Sheets Mirror Worker (`src/services/sheets.service.ts`)**
  - Auth Google Sheets menggunakan kredensial `GOOGLE_SERVICE_ACCOUNT_KEY` (raw JSON).
  - Background worker batch sync berkala untuk update dashboard pemantauan staf SDP.
- [ ] **6.2 Cron Job Rekap Harian (`src/cron/daily-recap.ts`)**
  - Eksekusi setiap pukul **07:00 pagi** setiap hari.
  - Kirim rekap ketersediaan seluruh ruangan untuk hari H dan H+1 ke grup utama.

---

### 🔹 Fase 7: Testing, Hardening & Deployment
- [ ] **7.1 Uji Beban & Race Condition Test**
  - Simulasi 2 korti melakukan request `!pinjam` pada slot yang sama di milidetik bersamaan.
- [ ] **7.2 Uji Skenario Edge Cases**
  - Input slot loncat (misal `ACF`), booking tanggal lampau, pembatalan slot milik orang lain.
- [ ] **7.3 Process Management & Logging**
  - Konfigurasi persistensi sesi Baileys & error logger.
