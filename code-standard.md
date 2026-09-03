# 📐 Standar Penulisan Kode Proyek "Denia"

Dokumen ini merangkum pola arsitektur, konvensi penulisan kode, dan boilerplate standar yang wajib diikuti pada proyek Bot WhatsApp Denia (Bun + TypeScript + Drizzle).

---

## 1. Struktur Modul & Barrel Export

Setiap modul di dalam `src/<module>/` memiliki tanggung jawab tunggal dan wajib menyediakan barrel export `index.ts`:

```
src/<module>/
├── <feature>.ts      # Logika domain / implementasi
├── types.ts          # Definisi interface & type khusus modul (opsional jika ringkas)
└── index.ts          # Re-export publik API (fungsi, kelas, tipe, konstanta)
```

### Aturan Barrel Export:
- Re-export tipe wajib menggunakan kata kunci `type` (`export type { ... }` atau `export { type Foo }`).
- File internal di dalam modul saling mengimpor menggunakan relative path berekstensi `.ts` (`./types.ts`).
- Konsumen di luar modul mengimpor via path alias `@/<module>` atau relatif ke barrel `index.ts`.

---

## 2. Konvensi Bahasa & TypeScript

1. **Runtime Native Bun**:
   - Gunakan API native Bun bila tersedia (`Bun.env`, `Bun.file()`, `bun:sqlite`, `bun:test`).
2. **Immutability**:
   - Objek konfigurasi/konstanta wajib dibekukan dengan `Object.freeze()`.
   - Gunakan modifier `readonly` pada properti class/interface dan `readonly T[]` untuk list statis.
3. **Type-Safety & Explicit Types**:
   - Hindari penggunaan `any` tanpa alasan mendesak; gunakan `unknown` atau generic parameter.
   - Pisahkan import type: `import type { ... } from '...'`.

---

## 3. Standarisasi Error Handling & Result Pattern

### A. Domain Error (`src/errors/`)
- Seluruh custom error diturunkan dari `AppError` (`src/errors/app-error.ts`).
- Gunakan error code terpusat dari `ErrorCode` (`src/errors/codes.ts`).
- Tangani mapping error pihak ketiga (seperti SQLite constraint) melalui `resolveError()` (`src/errors/resolver.ts`).

### B. Result Pattern (`src/types/`)
- Gunakan `Result<T, E = AppError>` untuk fungsi yang dapat mengembalikan kegagalan yang dapat diprediksi:

```typescript
import { ok, err, type Result } from '@/types';
import { ValidationError, ErrorCode } from '@/errors';

function parseInput(input: string): Result<string> {
  if (!input.trim()) {
    return err(new ValidationError(ErrorCode.INVALID_SYNTAX, 'Input tidak boleh kosong'));
  }
  return ok(input.trim());
}
```

---

## 4. Standarisasi Logging (`src/logger/`)

- Jangan gunakan `console.log` langsung di kode aplikasi.
- Gunakan child logger per modul untuk melacak konteks eksekusi:

```typescript
import { logger } from '@/logger';

const moduleLogger = logger.child({ module: 'BOOKING_SERVICE' });

moduleLogger.info('Memproses booking baru', { userId: '123' });
moduleLogger.success('Booking berhasil dicatat', { bookingId: 45 });
moduleLogger.error('Gagal mencatat booking', error, { payload });
```

---

## 5. Standarisasi Database (`src/db/`)

- Model tabel didefinisikan secara deklaratif di `src/db/schema.ts` menggunakan Drizzle ORM.
- Eksekusi SQLite berjalan dengan mode `WAL` dan `foreign_keys = ON` melalui `src/db/index.ts`.
- Re-export schema dan instance `db` terpusat melalui `src/db/index.ts`.

---

## 6. Standarisasi Pengujian (`tests/`)

### Aturan File Test:
1. **1 Modul = 1 File Test**: Nama file test disesuaikan dengan nama folder modul: `tests/<module>.test.ts`.
2. **Packing Test Cases**: Satukan seluruh skenario pengujian modul tersebut di dalam satu file test dengan blok `describe('<Module> Module', ...)`.
3. Gunakan test runner native `bun:test` (`describe`, `it`, `expect`).

```bash
bun test             # Menjalankan seluruh test suite
bun test tests/types.test.ts  # Menjalankan test modul spesifik
```

---

## 7. Boilerplate Templates

### A. Template Modul Baru (`src/<module>/`)

`src/<module>/service.ts`:
```typescript
import { ok, err, type Result } from '@/types';
import { AppError, ErrorCode } from '@/errors';
import { logger } from '@/logger';

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

`src/<module>/index.ts`:
```typescript
export { processItem, type ProcessInput } from './service.ts';
```

### B. Template File Test (`tests/<module>.test.ts`)

```typescript
import { describe, expect, it } from 'bun:test';
import { processItem } from '@/example'; // atau '../src/example/index.ts'

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
