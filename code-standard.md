# 📐 Standar Penulisan Kode Proyek "Denia"

Dokumen ini merangkum arsitektur direktori, pola desain, konvensi penulisan kode, dan boilerplate standar yang wajib diikuti pada proyek Bot WhatsApp Denia (Bun + TypeScript + Drizzle).

---

## 1. Arsitektur Direktori Utama (`src/`)

Struktur kode utama di dalam `src/` dibagi menjadi dua domain terisolasi dan sejajar:

```
src/
├── bot/              # Baileys WhatsApp client, event handlers, router, dispatcher
├── cli/              # Perangkat antarmuka baris perintah (Command-Line Interface)
│   ├── commands/     # Perintah CLI spesifik (register whitelist korti/staf/admin)
│   └── index.ts      # Entry point executable CLI runner
├── core/             # Fondasi sistem, domain data, dan utilitas inti
│   ├── config/       # Environment variables loader & validator (Object.freeze)
│   ├── constants/    # Kamus domain statis (slots SKS, ruangan SDP, dll.)
│   ├── db/           # Skema Drizzle ORM, migrasi, dan client database SQLite
│   ├── errors/       # AppError hierarchy, error codes, dan error resolver
│   ├── logger/       # AppLogger terpusat berbasis Pino & Pino-pretty
│   ├── templates/    # Formatter pesan WhatsApp (rekap grup, japri/DM, reaction)
│   ├── types/        # Result pattern (Result<T, E>), generic response types
│   ├── utils/        # Core utility functions (slot-parser, date, room-parser)
│   └── services/     # Layanan asynchronous (buffer service, sheets sync, dll.)
└── index.ts          # Entry point utama aplikasi runtime bot WhatsApp
```

### Prinsip Pemisahan Domain:
1. **`src/core/` (Domain Engine & Utilities)**:
   - Fondasi bersama: database, logger, error handling, utilitas validasi, dan config.
   - Tidak bergantung pada `src/cli/` maupun `src/bot/`.
2. **`src/bot/` (WhatsApp Client & Command Engine)**:
   - Menangani siklus hidup Baileys, event messages, command routing, dan response dispatcher.
3. **`src/cli/` (Developer & Admin Tooling)**:
   - Terisolasi untuk interaksi terminal (registrasi whitelist, inspeksi, dan database seed).

---

## 2. Struktur Modul & Barrel Export

Setiap modul di `src/core/<module>/` dan subfitur di `src/cli/<feature>/` wajib menyediakan barrel export `index.ts`:

- Re-export tipe wajib menggunakan kata kunci `type` (`export type { ... }`).
- File internal di modul yang sama saling mengimpor menggunakan relative path bertanda ekstensi `.ts` (`./types.ts`).
- Konsumen di luar modul mengimpor via path alias `@/core/<module>` atau `@/cli/<feature>`.

---

## 3. Konvensi Bahasa & TypeScript

1. **Runtime Native Bun**: Prioritaskan API native Bun (`Bun.env`, `Bun.file()`, `bun:sqlite`, `bun:test`).
2. **Immutability**: Objek konfigurasi, kamus domain, dan konstanta wajib dibekukan dengan `Object.freeze()`. Gunakan modifier `readonly` pada properti interface/class dan array statis.
3. **Type-Safety**: Hindari penggunaan `any`. Gunakan `unknown` atau parameter generic, serta pisahkan type import secara eksplisit: `import type { ... } from '...'`.

---

## 4. Standarisasi Result Pattern (`src/core/types/result.ts`)

Seluruh fungsi/metode domain yang dapat mengalami kegagalan (seperti parsing, validasi, query DB, koneksi socket, dan command handler) **wajib** menggunakan Result Pattern:

- Tipe kontrak: `Result<T, E = AppError> = Ok<T> | Err<E>` (di mana `Ok<T> = { success: true, data: T }` dan `Err<E> = { success: false, error: E }`).
- Gunakan helper function `ok<T>(data)` untuk membungkus hasil sukses dan `err<E>(error)` untuk kegagalan.
- **Dilarang melempar uncaught throw** pada alur bisnis aplikasi. Tangkap exception tak terduga dengan `try-catch` dan bungkus menjadi `err(new AppError(...))`.

```typescript
import { ok, err, type Result } from '@/core/types';
import { ValidationError, ErrorCode } from '@/core/errors';

export function parseRoomInput(input: string): Result<string> {
  if (!input.trim()) {
    return err(new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, 'Kode ruangan tidak boleh kosong'));
  }
  return ok(input.trim().toUpperCase());
}
```

---

## 5. Standarisasi Error Handling & Hierarchy (`src/core/errors/`)

1. **Error Code Terpusat**: Seluruh identifikasi error wajib merujuk pada konstanta `ErrorCode` di `src/core/errors/codes.ts`.
2. **Hierarki AppError**: Seluruh custom error aplikasi diturunkan dari base class `AppError` (`src/core/errors/app-error.ts`) yang memuat properti `code`, `userMessage`, `metadata`, dan `cause`.
   - `UnauthorizedError`: Akses ditolak atau nomor pengirim belum terdaftar whitelist.
   - `SlotConflictError`: Bentrok peminjaman ruangan atau ruangan diblokir agenda kampus.
   - `ValidationError`: Kegagalan sintaks, format tanggal, urutan slot, atau batas durasi SKS.
   - `NotFoundError`: Data ruangan atau entitas peminjaman tidak ditemukan.
3. **Error Resolver (`src/core/errors/resolver.ts`)**: Gunakan fungsi `resolveError(error)` untuk memetakan error eksternal (seperti SQLite constraint error) ke format terstruktur `ResolvedError` yang berisi pesan ramah untuk WhatsApp DM, kode error, saran pemecahan masalah, dan tingkat log yang sesuai.

---

## 6. Standarisasi Logging Terpusat (`src/core/logger/`)

1. **Larangan `console.log`**: Dilarang keras menggunakan `console.log` atau `console.error` pada alur aplikasi bot (`src/core/`). Gunakan `AppLogger`.
2. **Scoped Child Logger**: Setiap file/layanan wajib menginisialisasi child logger dengan modul yang jelas:
   ```typescript
   import { logger } from '@/core/logger';
   const log = logger.child({ module: 'WHATSAPP_CLIENT' });
   ```
3. **Metode Logging Standar**:
   - `log.info(message, meta)`: Informasi tahapan proses normal.
   - `log.success(message, meta)`: Informasi keberhasilan transaksi/koneksi.
   - `log.warn(message, meta)`: Peringatan kondisi tidak fatal (retry, slot jumping).
   - `log.error(message, error, meta)`: Penanganan error (otomatis mengekstrak stack trace dan error details).
   - `log.debug(message, meta)`: Log verbose untuk debugging internal.
4. **Pengecualian CLI**: Script terminal interaktif di `src/cli/` diizinkan menggunakan format print teks konsol untuk kenyamanan interaksi pengguna.

---

## 7. Standarisasi Bot WhatsApp & Baileys (`src/core/bot/`)

1. **Result Pattern pada Client**: Method koneksi dan operasi socket (`connect()`, `disconnect()`, `requestPairingCode()`) wajib mengembalikan `Promise<Result<T, AppError>>`.
2. **Default Autentikasi Pairing Code**:
   - Mode autentikasi default adalah **Pairing Code** (`authMode: 'pairing'`) menggunakan nomor bot (`config.whatsapp.botPhoneNumber`).
   - Mode terminal QR Code (`'qr'`) tetap didukung sebagai opsi konfigurasi eksplisit.
3. **Ketahanan Koneksi (Auto-Reconnect)**: Client wajib menangani reconnect otomatis untuk disconnect sementara (`restartRequired`, `timedOut`), menghentikan rekoneksi saat `loggedOut`, serta mempertahankan persistent event listeners lintas siklus koneksi.

---

## 8. Standarisasi Database (`src/core/db/`)

- Skema tabel didefinisikan secara deklaratif di `src/core/db/schema.ts` menggunakan Drizzle ORM.
- Eksekusi database SQLite berjalan dengan mode `WAL` dan `PRAGMA foreign_keys = ON`.
- Re-export schema dan instance `db` terpusat melalui `src/core/db/index.ts`.

---

## 9. Standarisasi Pengujian (`tests/`)

1. **1 Modul = 1 File Test**: Modul core diuji di `tests/<module>.test.ts`, modul CLI di `tests/cli.test.ts`.
2. **Packing Test Cases**: Satukan seluruh skenario pengujian unit di blok `describe('<Module> Module', ...)`.
3. **Runner Bun Test**: Gunakan `bun test` dengan runner native `describe`, `it`, `expect`.

---

## 10. Boilerplate Standar Layanan Core

```typescript
import { ok, err, type Result } from '@/core/types';
import { AppError, ErrorCode, ValidationError } from '@/core/errors';
import { logger } from '@/core/logger';

const log = logger.child({ module: 'EXAMPLE_SERVICE' });

export interface ProcessInput {
  readonly id: string;
}

export async function processItem(input: ProcessInput): Promise<Result<{ processed: boolean }>> {
  try {
    if (!input.id.trim()) {
      return err(new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, 'ID tidak boleh kosong'));
    }

    log.info('Memproses item', { id: input.id });
    // Logika operasi...
    log.success('Item berhasil diproses', { id: input.id });

    return ok({ processed: true });
  } catch (error) {
    log.error('Gagal memproses item', error, { id: input.id });
    return err(
      error instanceof AppError
        ? error
        : new AppError({
            code: ErrorCode.INTERNAL_ERROR,
            userMessage: 'Terjadi kegagalan sistem saat memproses item',
            cause: error,
          })
    );
  }
}
```
