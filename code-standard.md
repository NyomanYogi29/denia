# 📐 Standar Penulisan Kode Proyek "Denia"

Dokumen ini merangkum arsitektur direktori, pola desain, konvensi penulisan kode, dan boilerplate standar yang wajib diikuti pada proyek Bot WhatsApp Denia (Bun + TypeScript + Drizzle).

---

## 1. Arsitektur Direktori Utama (`src/`)

Struktur kode utama di dalam `src/` dibagi menjadi dua domain tingkat atas yang terisolasi dan sejajar:

```
src/
├── core/             # Fondasi sistem, domain bot WhatsApp, dan infrastruktur utama
│   ├── config/       # Environment variables loader & validator
│   ├── constants/    # Kamus domain statis (slots SKS, ruangan SDP, dll.)
│   ├── db/           # Skema Drizzle ORM, migrasi, dan client database SQLite
│   ├── errors/       # AppError hierarchy, error codes, dan error resolver
│   ├── logger/       # AppLogger terpusat berbasis Pino & Pino-pretty
│   ├── templates/    # Formatter pesan WhatsApp (rekap grup, japri/DM, reaction)
│   ├── types/        # Result pattern (Result<T, E>), generic response types
│   ├── utils/        # Core utility functions (slot-parser, date, room-parser)
│   ├── bot/          # Baileys WhatsApp client, event handlers, router, dispatcher
│   └── services/     # Layanan asynchronous (buffer service, sheets sync, dll.)
├── cli/              # Perangkat antarmuka baris perintah (Command-Line Interface)
│   ├── commands/     # Perintah CLI spesifik (register whitelist korti/staf/admin)
│   └── index.ts      # Entry point executable CLI runner
└── index.ts          # Entry point utama aplikasi runtime bot WhatsApp
```

### Prinsip Pemisahan Domain:
1. **`src/core/` (Bot & Domain Engine)**:
   - Menangani siklus hidup runtime bot WhatsApp Baileys, persistensi database, validasi domain, dan sinkronisasi Google Sheets.
   - Tidak boleh bergantung (*no dependency*) pada modul `src/cli/`.

2. **`src/cli/` (Developer & Admin Tooling)**:
   - Terisolasi untuk interaksi terminal/developer (misal: registrasi awal whitelist pengguna, seeding, database inspection, force intervention via CLI).
   - Diizinkan mengimpor dan memanfaatkan modul-modul dari `@/core/*` (seperti database `@/core/db`, logger `@/core/logger`, error handling `@/core/errors`, dan utilitas `@/core/utils`).

---

## 2. Struktur Modul & Barrel Export

Setiap modul di dalam `src/core/<module>/` dan subfitur di `src/cli/<feature>/` memiliki tanggung jawab tunggal dan wajib menyediakan barrel export `index.ts`:

```
src/core/<module>/
├── <feature>.ts      # Logika domain / implementasi
├── types.ts          # Definisi interface & type khusus modul (opsional jika ringkas)
└── index.ts          # Re-export publik API (fungsi, kelas, tipe, konstanta)
```

### Aturan Import & Export:
- Re-export tipe wajib menggunakan kata kunci `type` (`export type { ... }` atau `export { type Foo }`).
- File internal di dalam modul yang sama saling mengimpor menggunakan relative path berekstensi `.ts` (`./types.ts`).
- Konsumen di luar modul mengimpor via path alias `@/core/<module>` atau `@/cli/<feature>`.

---

## 3. Konvensi Bahasa & TypeScript

1. **Runtime Native Bun**:
   - Prioritaskan API native Bun bila tersedia (`Bun.env`, `Bun.file()`, `bun:sqlite`, `bun:test`).
2. **Immutability**:
   - Objek konfigurasi, kamus domain, dan konstanta wajib dibekukan dengan `Object.freeze()`.
   - Gunakan modifier `readonly` pada properti class/interface dan `readonly T[]` untuk list statis.
3. **Type-Safety & Explicit Types**:
   - Hindari penggunaan `any` tanpa alasan mendesak; gunakan `unknown` atau generic parameter.
   - Pisahkan import type secara eksplisit: `import type { ... } from '...'`.

---

## 4. Standarisasi Error Handling & Result Pattern

### A. Domain Error (`src/core/errors/`)
- Seluruh custom error diturunkan dari `AppError` (`src/core/errors/app-error.ts`).
- Gunakan error code terpusat dari `ErrorCode` (`src/core/errors/codes.ts`).
- Tangani mapping error pihak ketiga (seperti SQLite constraint) melalui `resolveError()` (`src/core/errors/resolver.ts`).

### B. Result Pattern (`src/core/types/`)
- Gunakan `Result<T, E = AppError>` untuk fungsi yang dapat mengembalikan kegagalan yang dapat diprediksi:

```typescript
import { ok, err, type Result } from '@/core/types';
import { ValidationError, ErrorCode } from '@/core/errors';

function parseInput(input: string): Result<string> {
  if (!input.trim()) {
    return err(new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, 'Input tidak boleh kosong'));
  }
  return ok(input.trim());
}
```

---

## 5. Standarisasi Logging (`src/core/logger/`)

- Jangan gunakan `console.log` langsung pada alur aplikasi runtime bot.
- Gunakan child logger per modul untuk melacak konteks eksekusi:

```typescript
import { logger } from '@/core/logger';

const moduleLogger = logger.child({ module: 'BOOKING_SERVICE' });

moduleLogger.info('Memproses booking baru', { userId: '123' });
moduleLogger.success('Booking berhasil dicatat', { bookingId: 45 });
moduleLogger.error('Gagal mencatat booking', error, { payload });
```

*(Catatan khusus CLI: Script interaktif di `src/cli/` diperbolehkan mencetak format teks terminal terstruktur untuk kenyamanan interaksi pengguna).*

---

## 6. Standarisasi Database (`src/core/db/`)

- Model tabel didefinisikan secara deklaratif di `src/core/db/schema.ts` menggunakan Drizzle ORM.
- Eksekusi SQLite berjalan dengan mode `WAL` dan `foreign_keys = ON` melalui `src/core/db/index.ts`.
- Re-export schema dan instance `db` terpusat melalui `src/core/db/index.ts`.

---

## 7. Standarisasi Pengujian (`tests/`)

### Aturan File Test:
1. **1 Modul / Fitur = 1 File Test**:
   - Modul core: `tests/<module>.test.ts` (contoh: `tests/constants.test.ts`, `tests/utils.test.ts`, `tests/db.test.ts`).
   - Modul CLI: `tests/cli.test.ts` atau `tests/cli-<feature>.test.ts`.
2. **Packing Test Cases**: Satukan seluruh skenario pengujian modul tersebut di dalam satu file test dengan blok `describe('<Module> Module', ...)`.
3. Gunakan test runner native `bun:test` (`describe`, `it`, `expect`).

```bash
bun test                    # Menjalankan seluruh test suite
bun test tests/utils.test.ts # Menjalankan test spesifik
```

---

## 8. Boilerplate Templates

### A. Template Modul Baru di Core (`src/core/<module>/`)

`src/core/<module>/service.ts`:
```typescript
import { ok, err, type Result } from '@/core/types';
import { AppError, ErrorCode } from '@/core/errors';
import { logger } from '@/core/logger';

const log = logger.child({ module: 'EXAMPLE_MODULE' });

export interface ProcessInput {
  readonly id: string;
}

export function processItem(input: ProcessInput): Result<{ processed: boolean }> {
  try {
    log.info('Memproses item', { id: input.id });
    return ok({ processed: true });
  } catch (error) {
    log.error('Gagal memproses item', error);
    return err(new AppError({ code: ErrorCode.INTERNAL_ERROR, userMessage: 'Terjadi kegagalan sistem' }));
  }
}
```

`src/core/<module>/index.ts`:
```typescript
export { processItem, type ProcessInput } from './service.ts';
```

### B. Template File Test (`tests/<module>.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { processItem } from '@/core/example';

describe('Example Module', () => {
  it('should process item successfully', () => {
    const res = processItem({ id: 'test-1' });
    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data.processed).toBe(true);
    }
  });

  it('should handle error cases gracefully', () => {
    // Skenario kegagalan / edge cases
  });
});
```
