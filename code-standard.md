# 📐 Standar Penulisan Kode Proyek "Denia"

Dokumen ini merangkum arsitektur direktori, pola desain (*design patterns*), konvensi penulisan kode, dan boilerplate standar yang wajib diikuti pada proyek Bot WhatsApp Denia (Bun + TypeScript + Drizzle ORM + Baileys). Standar ini diselaraskan dengan spesifikasi operasional nyata pada [Rangkuman_Perancangan_Bot_Denia_V2.md](file:///C:/Users/Nyoman%20Yogi/Documents/projects/denia/Rangkuman_Perancangan_Bot_Denia_V2.md).

---

## 1. Arsitektur Direktori Utama (`src/`) & Clean Architecture

Aplikasi menerapkan pola **Driving Adapters** (Hexagonal/Ports & Adapters) di mana antarmuka terminal (CLI) dan bot WhatsApp (Baileys) bertindak sebagai dua adapter independen yang mengonsumsi *core domain* dan *use case* yang sama:

```
src/
├── bot/              # [Driving Adapter 1] WhatsApp Bot Engine
│   ├── client.ts     # Baileys socket lifecycle & connection manager
│   ├── events.ts     # Message router, prefix filter (!), extraction pengirim
│   ├── responder.ts  # Dispatcher reaksi emoji (⏳, ✅, ❌) & pesan Japri
│   ├── types.ts      # Kontrak tipe koneksi & event Baileys
│   └── index.ts      # Barrel export modul bot
├── cli/              # [Driving Adapter 2] Terminal Administration Tooling
│   ├── commands/     # Subcommand (user add, user list, seed korti, audit)
│   ├── config/       # CLI runtime config flags & parser (.deniarc)
│   ├── errors/       # CLI specific error handling & chalk display
│   ├── utils/        # CLI utilities (JID normalizer, CLI prompts)
│   └── index.ts      # Executable CLI entrypoint (denia <command>)
├── core/             # [Core Domain & Infrastructure]
│   ├── config/       # Environment variables loader & validator (Object.freeze)
│   ├── constants/    # Kamus domain statis (slots SKS 50 menit, ruangan SDP)
│   ├── db/           # Skema Drizzle ORM (rooms, users, bookings), client SQLite
│   ├── errors/       # AppError hierarchy, error codes, dan error resolver
│   ├── logger/       # AppLogger terpusat berbasis Pino & Pino-pretty
│   ├── services/     # Layanan async (Micro-Batch Buffer, Sheets Mirror, Seeder)
│   ├── templates/    # Formatter pesan WA (rekap batch grup, Japri DM, reaksi)
│   ├── types/        # Result pattern (Result<T, E>), generic response types
│   ├── utils/        # Validasi domain (slot kontigu, date parser, H-1 rule)
│   └── index.ts      # Barrel export modul core
└── index.ts          # Entry point utama aplikasi runtime Bot WhatsApp Denia
```

### Prinsip Pemisahan Domain:
1. **`src/core/` (Core Domain & Infrastructure Engine)**:
   - Menjadi *single source of truth* untuk logika bisnis, transaksi SQLite, validasi domain, dan sinkronisasi data.
   - **Dilarang keras** memiliki dependensi ke modul `src/cli/` maupun `src/bot/`.
2. **`src/bot/` (Driving Adapter: WhatsApp)**:
   - Bertanggung jawab membaca pesan WhatsApp, memetakan JID pengirim, mengeksekusi use case core, dan mengirim balasan (reaksi emoji, DM penolakan, atau rekap grup buffer).
3. **`src/cli/` (Driving Adapter: Terminal)**:
   - Terisolasi untuk interaksi developer/staf melalui antarmuka baris perintah (seeding dari spreadsheet `KORTI `, penambahan manual, inspeksi, dan database seed).

---

## 2. Aturan Bisnis & Validasi Domain (Spesifikasi V2)

1. **Eliminasi Parameter NIM & Auto-Resolution WhatsApp JID:**
   - Parameter NIM resmi ditiadakan (*dumped*) dari seluruh alur interaksi pengguna karena tidak ada dalam sheet master kampus.
   - Identitas peminjam (Nama, Fakultas, Prodi, Semester, Kelas) dipetakan otomatis secara *server-side* berdasarkan WhatsApp JID (`message.key.participant` di grup atau `remoteJid` di pesan pribadi).
2. **Aturan H-1 Peminjaman Ruangan (*Lead Time Validation*):**
   - Sesuai regulasi operasional SDP Undiksha, peminjaman reguler oleh Korti wajib dilakukan minimal **H-1 hari sebelum hari pemakaian** (misalnya, untuk memakai ruangan hari Rabu, pemesanan harus dilakukan maksimal hari Selasa).
   - Pengecualian hanya berlaku untuk pemesanan khusus (*force booking*) oleh Staf/Admin institusional.
   - Bot tetap menerima format penanggalan kalender nyata `DD/MM/YYYY` untuk mengakomodasi kuliah pengganti jauh-jauh hari.
3. **Kamus SKS Matrix 50 Menit (Slot A s.d. O):**
   - Jam perkuliahan menggunakan basis 50 menit per SKS (dengan slot H Ishoma 60 menit) dan batas operasional maksimal pukul 22:00 (Slot O).
   - Validasi kontinuitas huruf alfabetik (misal `DEF` sah, `ADF` ditolak) dan pembatasan durasi pemesanan (1–4 SKS per transaksi).
4. **Format Google Sheets Mirror:**
   - Seluruh transaksi aktif yang berhasil dicatat di SQLite disinkronkan ke Google Sheets mirror menggunakan format penamaan sel baku:
     `[Prodi]/[Kelas]/[Nama Dosen atau Korti]` (Contoh: `SI/3DPS/Ir. I Made Ardwi Pradnyana`).

---

## 3. Struktur Modul & Barrel Export

Setiap direktori fitur/modul wajib menyediakan barrel export `index.ts`:
- Re-export tipe wajib menggunakan modifier `type` (`export type { ... }`).
- File internal di dalam modul yang sama saling mengimpor menggunakan relative path bertanda ekstensi `.ts` (`./types.ts`).
- Konsumen di luar modul mengimpor via path alias `@/core/<module>`, `@/bot`, atau `@/cli/<subcommand>`.

---

## 4. Konvensi Bahasa & TypeScript

1. **Runtime Native Bun**: Prioritaskan API native Bun (`Bun.env`, `Bun.file()`, `bun:sqlite`, `bun:test`).
2. **Immutability**: Objek konfigurasi, kamus domain, dan konstanta wajib dibekukan dengan `Object.freeze()`. Gunakan modifier `readonly` pada properti interface/class dan array statis.
3. **Type-Safety Tanpa `any`**: Gunakan `unknown` atau generic types. Pisahkan type import secara eksplisit (`import type { ... }`).
4. **Functional Programming**: Hindari class jika fungsi murni (*pure functions*) mencukupi, kecuali untuk custom error yang mewarisi `AppError`.

---

## 5. Standarisasi Result Pattern (`src/core/types/result.ts`)

Seluruh fungsi/metode domain yang berpotensi gagal (parsing, validasi, query database, koneksi socket, use case bisnis) **wajib** menggunakan Result Pattern:

- Tipe kontrak: `Result<T, E = AppError> = Ok<T> | Err<E>`.
- `Ok<T> = { readonly success: true, readonly data: T }`.
- `Err<E> = { readonly success: false, readonly error: E }`.
- Gunakan helper `ok<T>(data)` untuk sukses dan `err<E>(error)` untuk kegagalan.
- **Dilarang melempar uncaught throw** pada alur bisnis aplikasi. Tangkap exception tak terduga dengan `try-catch` dan bungkus menjadi `err(new AppError(...))`.

```typescript
import { ok, err, type Result } from '@/core/types';
import { ValidationError, ErrorCode } from '@/core/errors';

export function validateBookingLeadTime(bookingDate: string, role: string): Result<boolean> {
  if (role !== 'staff' && role !== 'admin' && isSameDayOrPast(bookingDate)) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_BOOKING_LEAD_TIME,
        'Peminjaman ruangan reguler oleh Korti wajib dilakukan minimal H-1 sebelum hari pemakaian.'
      )
    );
  }
  return ok(true);
}
```

---

## 6. Standarisasi Error Handling & Hierarchy (`src/core/errors/`)

1. **Error Code Terpusat**: Seluruh identifikasi error wajib merujuk pada konstanta `ErrorCode` di `src/core/errors/codes.ts`.
2. **Hierarki AppError**: Seluruh custom error aplikasi diturunkan dari base class `AppError` (`src/core/errors/app-error.ts`) yang memuat `code`, `userMessage`, `metadata`, dan `cause`.
   - `UnauthorizedError`: Nomor pengirim belum terdaftar pada whitelist database.
   - `SlotConflictError`: Bentrok peminjaman ruangan atau ruangan diblokir agenda kampus.
   - `ValidationError`: Kegagalan sintaks, format tanggal, urutan slot, batas SKS, atau pelanggaran aturan H-1.
   - `NotFoundError`: Data ruangan atau entitas peminjaman tidak ditemukan.
3. **Error Resolver (`src/core/errors/resolver.ts`)**: Fungsi `resolveError(error)` memetakan error eksternal (SQLite constraint, Baileys socket error) ke format terstruktur `ResolvedError` untuk menghasilkan pesan WhatsApp Japri/DM yang ramah, solutif, dan tingkat log yang tepat.

---

## 7. Standarisasi Logging Terpusat (`src/core/logger/`)

1. **Larangan `console.log`**: Dilarang keras menggunakan `console.log` atau `console.error` pada alur aplikasi bot (`src/bot/` dan `src/core/`). Gunakan `AppLogger`.
2. **Scoped Child Logger**: Setiap file/layanan wajib menginisialisasi child logger dengan modul yang jelas:
   ```typescript
   import { logger } from '@/core/logger';
   const log = logger.child({ module: 'BUFFER_SERVICE' });
   ```
3. **Pengecualian CLI**: Script antarmuka terminal interaktif di `src/cli/` diizinkan menggunakan format print konsol / `@clack/prompts` demi kenyamanan pengguna terminal.

---

## 8. Standarisasi WhatsApp Bot & Baileys (`src/bot/`)

1. **Result Pattern pada Client**: Method koneksi dan operasi socket (`connect()`, `disconnect()`, `requestPairingCode()`) wajib mengembalikan `Promise<Result<T, AppError>>`.
2. **Default Autentikasi Pairing Code**:
   - Mode autentikasi default adalah **Pairing Code** (`authMode: 'pairing'`) menggunakan nomor bot (`config.whatsapp.botPhoneNumber`).
   - Mode terminal QR Code (`'qr'`) tetap didukung sebagai opsi konfigurasi cadangan.
3. **Ketahanan Koneksi (Auto-Reconnect)**: Client wajib menangani reconnect otomatis untuk disconnect sementara (`restartRequired`, `timedOut`), menghentikan rekoneksi saat `loggedOut`, serta mempertahankan persistent event listeners.
4. **UX WhatsApp Tanpa Spam Grup:**
   - **Reaksi Emoji Instan**: Bot segera bereaksi dengan emoji `⏳` saat memproses, `✅` jika valid dan masuk antrean buffer, atau `❌` jika ditolak.
   - **Notifikasi Error Jalur Pribadi (Japri/DM)**: Pesan error/penolakan dikirim via chat pribadi ke nomor pengirim agar tidak mengotori grup publik angkatan.
   - **Tumbling Window 60 Detik**: Transaksi berhasil ditampung dalam jendela waktu 60 detik dan di-flush bersamaan dalam **satu pesan rekap terstruktur** ke grup WhatsApp.

---

## 9. Standarisasi Database Drizzle & SQLite (`src/core/db/`)

- Skema tabel didefinisikan secara deklaratif di `src/core/db/schema.ts` menggunakan Drizzle ORM.
- **Tabel `rooms`**: Menyimpan master ruangan SDP Undiksha (`code`, `building`, `floor`, `room_name`, `capacity`, `is_active`).
- **Tabel `users`**: Menyimpan data terverifikasi hasil seeder spreadsheet (`jid`, `nama`, `fakultas`, `prodi`, `semester`, `kelas`, `no_telp`, `role`). NIM ditiadakan.
- **Tabel `bookings`**: Menyimpan transaksi slot per SKS unit (`room_code`, `booking_date`, `slot_code`, `user_jid`, `status`, `booking_type`, `notes`).
- **Tabel `force_events`**: Menyimpan agenda blokade institusional/kampus oleh Staf/Admin.
- Konfigurasi engine SQLite lokal berjalan dengan mode `WAL` (`journal_mode = WAL`) dan `PRAGMA foreign_keys = ON`.
- Dilarang bypass Drizzle schema; seluruh transaksi multi-slot wajib memanfaatkan `BEGIN IMMEDIATE` untuk menggaransi *zero race condition*.

---

## 10. Standarisasi Pengujian (`tests/`)

1. **1 Modul = 1 File Test**: Modul core diuji di `tests/<module>.test.ts`, bot di `tests/bot.test.ts`, CLI di `tests/cli-*.test.ts`.
2. **Runner Bun Test**: Gunakan `bun test` dengan runner native `describe`, `it`, `expect`.
3. **Uji Kasus Kritis**:
   - Uji batas durasi SKS 50 menit & validasi huruf kontigu `A-O`.
   - Uji penolakan peminjaman reguler pada hari H (aturan H-1).
   - Uji transaksi konkuren (simulasi 2 korti memesan slot yang sama pada milidetik bersamaan).
   - Uji normalisasi nomor telepon ke format JID WhatsApp pada proses seeding.
