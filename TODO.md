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
- [x] **3.2 Automated Seeder Korti dari Spreadsheet (`src/core/services/seeder.service.ts` & `src/cli/`)**
  - Script membaca sheet `KORTI ` dari file master `RUANG KULIAH SDP DENPASAR.xlsx`.
  - Normalisasi nomor telepon menjadi WhatsApp JID (`628xxx@s.whatsapp.net`).
  - Upsert data ke tabel `users` (nama, fakultas, prodi, semester, kelas, no_telp, role).
  - CLI command: `denia seed korti` untuk eksekusi seeder dari terminal.
  - Penyesuaian `denia user add` agar selaras dengan skema pengguna baru tanpa NIM.
- [x] **3.2.1 Danger Zone Maintenance Command (`denia flushdb`)**
  - Implementasi perintah pembersihan darurat: `denia flushdb all`, `denia flushdb user`, `denia flushdb rooms`, `denia flushdb force_events`, `denia flushdb bookings`.
  - Core flush service (`src/core/services/flush.service.ts`) dengan penanganan relasi cascade.
  - Interactive danger confirmation prompt dan opsi bypass non-interaktif `--force` (`-f`).
- [ ] **3.2.2 Security Guard & Master Password Enforcement untuk Danger Zone Commands**
  - Setup konfigurasi security di `.env` (`DENIA_MASTER_PASSWORD` / hash aman).
  - Validasi master password pada prompt terminal sebelum eksekusi perintah destruktif (`flushdb`).
  - Proteksi lockout / rate limit terhadap kesalahan password berulang pada CLI.
- [x] **3.3 Pesan Masuk & Router Handler (`src/bot/events.ts`)**
  - Filter prefix perintah tanda seru (`!`) di `src/core/utils/prefix.ts`.
  - Ekstraksi otomatis WhatsApp JID pengirim (`message.key.participant || message.key.remoteJid`).
  - Auto-resolution identitas pengguna dari tabel `users`.
  - Kirim reaksi emoji instan `⏳` pada pesan yang sedang diproses.
- [x] **3.4 Response Dispatcher (`src/bot/responder.ts`)**
  - Pengiriman pesan pribadi (*DM/Japri*) untuk notifikasi error/penolakan.
  - Pembaruan reaksi emoji (`✅` untuk berhasil masuk buffer, `❌` untuk ditolak).

---

### 🔹 Fase 4: Micro-Batch Buffer Service (Pencegah Spam Grup)
- [x] **4.1 Tumbling Window Buffer (`src/core/services/buffer.service.ts`)**
  - Implementasikan buffer penampung transaksi sukses dengan interval fixed window **30 detik** terisolasi per grup JID.
  - Format pesan adaptif super ringkas:
    - Jika $N = 1$: One-liner (`📌 Ruang *RAK_2.1* digunakan oleh *3DPS*, pada jam *10:30 - 13:20* untuk tanggal *10/09/2026*.`).
    - Jika $N \ge 2$: Daftar bernomor kompak (`📋 *Pemesanan Ruangan Terbaru:*`).
  - Pemetaan rentang jam otomatis dari kamus slot SKS (misal `DEF` $\rightarrow$ `10:30 - 13:20`).
  - Mekanisme perlindungan jaringan: hold/retry saat socket Baileys disconnect & auto-flush saat reconnect.
  - Unit test komprehensif di `tests/buffer.test.ts`.

---

### 🔹 Fase 5: Implementasi Modul Perintah (Command Handlers)

#### 🔸 Role Mahasiswa / Korti:
- [x] **5.1 `!pinjam [kode_ruangan] [DD/MM/YYYY] [kode_slot]`**
  - Auto-resolution pengguna via JID pengirim (tanpa input NIM/nama).
  - Validasi aturan minimal H-1 dari hari pemakaian.
  - Validasi slot alfabetik kontigu & ketersediaan slot (cek booking aktif dan force event).
  - Eksekusi transaksi SQLite dengan `BEGIN IMMEDIATE`.
  - Masukkan transaksi sukses ke *micro-batch buffer*.
- [x] **5.2 `!batal [kode_ruangan] [DD/MM/YYYY] [kode_slot]`**
  - Validasi kepemilikan slot berdasarkan WhatsApp JID pengirim atau role admin/staf.
  - Ubah status booking menjadi `cancelled`.
- [x] **5.3 `!info [DD/MM/YYYY]` atau `!info`**
  - Tampilkan matriks ketersediaan seluruh ruangan per slot SKS pada tanggal yang diminta.

#### 🔸 Evaluasi Hasil Testing Sementara Bot (Pra-Fase 5.4):
- [x] **E.1 Persistensi Data & Manajemen Sesi Autentikasi Bot**
  - Status: *Sudah terimplementasi & teruji (Completed)*.
  - Mengisolasi sepenuhnya domain persistensi data bisnis (`data/bot.db`) dari domain sesi kredensial WhatsApp Baileys (`auth_info/`). Rotasi kunci enkripsi sesi ditangani otomatis secara berkala oleh event `creds.update` Baileys/Signal Protocol. Menyediakan perlindungan data tingkat tinggi melalui modul snapshot auto-backup native SQLite (`VACUUM INTO` di `src/core/db/backup.ts`) saat startup bot (`src/index.ts`) dengan rotasi retensi otomatis (menyimpan 5 cadangan terbaru di `data/backups/`). Memasang mekanisme self-healing saat sesi WhatsApp dinyatakan *logged out* (`src/bot/client.ts`): membersihkan folder `auth_info/` secara terisolasi (dengan proteksi guard direktori root/data) dan otomatis meminta QR code baru di terminal tanpa memerlukan restart proses ataupun manipulasi folder manual yang berisiko merusak basis data.
- [x] **E.2 Rate Limiting Perintah Pengguna (Per-User Rate Limit)**
  - Status: *Sudah terimplementasi & teruji (Completed)*.
  - Menerapkan pembatasan laju maksimal 7 perintah per 60 detik per pengguna (`JID`) menggunakan Bun native `RedisClient` (`redis.incr` + `redis.expire 60s`) dengan konfigurasi `REDIS_URL`, `RATE_LIMIT_MAX_REQUESTS`, dan `RATE_LIMIT_WINDOW_SECONDS`. Dikelola melalui singleton helper di `src/core/db/redis.ts` dan middleware di `src/core/middleware/rate-limiter.middleware.ts`. Menggunakan kebijakan *fail-open* (`enableOfflineQueue: false`) agar bot tetap beroperasi mulus saat Redis offline. Dilengkapi containerisasi Redis terisolasi via Docker Compose (`docker-compose.yml`), otomasi startup Redis di script `bun run dev` (`bun run redis:up && bun --watch run src/index.ts`), dukungan hot-reload otomatis via Bun `--watch`, health check ramah (`log.warn` informatif), throttled logging saat fail-open, serta graceful shutdown (`redisClose`). Role `admin` dan `staff` otomatis dibebaskan dari rate limiting (*bypassed*). Pengguna yang terkena rate limit menerima reaksi `⏳` di grup dan pesan edukatif sisa waktu tunggu via DM/Japri.
- [x] **E.3 Sinkronisasi Status Booking pada Tampilan Matriks `!info`**
  - Status: *Sudah terimplementasi & teruji (Completed)*.
  - Perintah `!info` tanpa parameter tanggal default menampilkan jadwal **Hari Ini**, dengan menyaring slot perkuliahan yang telah mulai/terlewat (`currentTime >= slot.startTime`) dari daftar slot kosong dan mencantumkan info jam terlewat di header, serta menyertakan tips `!info besok`. Perintah `!info besok` (dan variasinya dengan kode ruangan) otomatis menampilkan jadwal esok hari (H+1) sehingga booking aktif oleh Korti yang diajukan untuk besok langsung terlihat jelas.
- [x] **E.4 Routing Output Matriks `!info` ke Jalur Pribadi (DM)**
  - Status: *Sudah terimplementasi & teruji (Completed)*.
  - Seluruh pemanggilan perintah `!info` (baik umum maupun spesifik ruangan/tanggal) di dalam grup WhatsApp secara otomatis merouting pesan matriks ketersediaan lengkap ke DM pribadi pengguna (`senderJid`), dengan reaksi emoji `📩` (DM_SENT) pada pesan pemicu di grup tanpa mengirim balasan teks di grup. Jika dipanggil di DM langsung, bot merespons dengan reaksi `✅`. Apabila pengiriman DM gagal, bot memberi reaksi `❌` dan mengirim notifikasi fallback 1 baris di grup.
- [x] **E.5 Proteksi Otorisasi Pembatalan (`!batal` / `!cancel`) Antar-Korti**
  - Status: *Sudah terimplementasi & terverifikasi (Verified)*.
  - Guard kepemilikan sudah aktif di `cancelBookingImmediate` (`user_jid` check) dan `cancelBookingUseCase` (hanya pemilik asli atau admin/staf yang berhak membatalkan). Upaya pembatalan oleh pengguna lain otomatis ditolak dengan reaksi emoji ❌ di grup dan notifikasi edukatif dikirim via DM/Japri.

#### 🔸 Role Staf / Admin:
- [x] **5.4 `!force [kode_ruangan] [DD/MM/YYYY] [kode_slot] [alasan]`**
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
- [ ] **6.2 Cron Job Rekap Terjadwal (`src/core/cron/daily-recap.ts`)**
  - Eksekusi terjadwal 2 kali sehari:
    - **Pukul 07:00 WITA**: Rekapitulasi penuh pemakaian seluruh ruangan untuk **Hari Ini (Hari H)**.
    - **Pukul 15:00 WITA**: Rekapitulasi status seluruh ruangan untuk **Besok (Hari H+1)** selaras batas operasional H-1 Korti.
  - Kirim rekap status seluruh ruangan ke grup WhatsApp utama.

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
