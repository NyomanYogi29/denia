import { existsSync } from 'node:fs';
import path from 'node:path';
import * as XLSX from 'xlsx';
import { upsertUser } from '@/core/db/repositories/user.repository.ts';
import { AppError, ErrorCode, NotFoundError, ValidationError } from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import { isValidWhatsAppJid, normalizeToWhatsAppJid } from '@/core/utils/jid.ts';
import type {
  SeedKortiItem,
  SeedKortiOptions,
  SeedKortiSummary,
  SeedSkippedRow,
} from './types.ts';

const log = logger.child({ module: 'SEEDER_USECASE' });

/**
 * Membersihkan dan menormalisasi nomor telepon mentah dari spreadsheet Excel
 */
export function sanitizeSpreadsheetPhone(val: unknown): string | null {
  if (val === null || val === undefined) return null;

  let str = String(val).trim();
  if (!str || str === '*' || str === '-' || str === '.') return null;

  // Tangani format notasi ilmiah Excel (contoh: 8.7776716707E10)
  if (/^[\d.]+e[+-]?\d+$/i.test(str)) {
    const num = Number(str);
    if (!isNaN(num)) {
      str = BigInt(Math.round(num)).toString();
    }
  }

  // Hapus karakter non-numerik di awal/akhir seperti tanda *, petik, spasi, dash
  str = str.replace(/^[*\s'"-]+/, '').replace(/[*\s'"-]+$/, '').trim();
  if (!str || str === '*' || str === '-') return null;

  return str;
}

/**
 * Path default pencarian file master spreadsheet jika opsi tidak diberikan
 */
export function resolveDefaultSpreadsheetPath(): string {
  const candidates = [
    path.resolve(process.cwd(), 'data/RUANG KULIAH SDP DENPASAR.xlsx'),
    path.resolve(process.cwd(), 'RUANG KULIAH SDP DENPASAR.xlsx'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0]!;
}

/**
 * Use case murni untuk membaca sheet 'KORTI ' dari file Excel dan melakukan upsert data ke tabel users.
 */
export async function seedKortiUseCase(
  options: SeedKortiOptions = {}
): Promise<Result<SeedKortiSummary, AppError>> {
  const resolvedPath = options.filePath
    ? path.resolve(process.cwd(), options.filePath)
    : resolveDefaultSpreadsheetPath();

  log.info(`Memulai seeder Korti dari berkas spreadsheet: "${resolvedPath}"`, {
    dryRun: Boolean(options.dryRun),
  });

  if (!existsSync(resolvedPath)) {
    log.warn(`Berkas master spreadsheet tidak ditemukan di: "${resolvedPath}"`);
    return err(
      new NotFoundError(
        ErrorCode.RESOURCE_NOT_FOUND,
        `Berkas spreadsheet master tidak ditemukan pada path: "${resolvedPath}"`,
        {
          filePath: resolvedPath,
          hint: 'Pastikan file "RUANG KULIAH SDP DENPASAR.xlsx" berada di folder data/ atau berikan opsi --file <path>.',
        }
      )
    );
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.readFile(resolvedPath);
  } catch (error) {
    log.error(`Gagal membaca berkas Excel di "${resolvedPath}"`, error);
    return err(
      new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        `Gagal membaca berkas Excel: ${error instanceof Error ? error.message : String(error)}`,
        { filePath: resolvedPath }
      )
    );
  }

  // Cari sheet Korti (case-insensitive & toleran terhadap spasi seperti 'KORTI ')
  const targetSheetName = workbook.SheetNames.find(
    (name) => name.trim().toUpperCase() === 'KORTI'
  );

  if (!targetSheetName) {
    log.warn(`Sheet "KORTI" tidak ditemukan di "${resolvedPath}"`, {
      availableSheets: workbook.SheetNames,
    });
    return err(
      new ValidationError(
        ErrorCode.RESOURCE_NOT_FOUND,
        `Sheet "KORTI" tidak ditemukan di dalam workbook. Sheet yang tersedia: ${workbook.SheetNames.join(', ')}`,
        { availableSheets: workbook.SheetNames, filePath: resolvedPath }
      )
    );
  }

  const sheet = workbook.Sheets[targetSheetName];
  if (!sheet || !sheet['!ref']) {
    log.warn(`Sheet "${targetSheetName}" kosong atau tidak memiliki data`);
    return err(
      new ValidationError(
        ErrorCode.RESOURCE_NOT_FOUND,
        `Sheet "${targetSheetName}" kosong atau tidak memiliki data.`,
        {
          sheetName: targetSheetName,
        }
      )
    );
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);

  let currentFakultas: string | undefined = undefined;
  let currentProdi: string | undefined = undefined;
  let currentSemester: number | undefined = undefined;

  const validItems: SeedKortiItem[] = [];
  const skippedRows: SeedSkippedRow[] = [];
  let scannedCount = 0;

  // Header berada pada baris ke-3 (indeks range.s.r), data dimulai setelahnya
  for (let R = range.s.r + 1; R <= range.e.r; ++R) {
    scannedCount++;
    const rowNumber = R + 1;

    const getVal = (colIdx: number) => {
      const cell = sheet[XLSX.utils.encode_cell({ r: R, c: colIdx })];
      return cell ? cell.v : null;
    };

    const rawFakultas = getVal(0);
    const rawProdi = getVal(1);
    const rawSemester = getVal(2);
    const rawKelas = getVal(3);
    const rawNama = getVal(4);
    const rawPhone = getVal(5);

    const fStr = rawFakultas ? String(rawFakultas).trim() : '';
    const pStr = rawProdi ? String(rawProdi).trim() : '';
    const sStr = rawSemester !== null && rawSemester !== undefined ? String(rawSemester).trim() : '';
    const nStr = rawNama ? String(rawNama).trim() : '';

    // Propagasi nilai merged cell vertikal untuk Fakultas
    if (fStr && !fStr.toUpperCase().includes('FAKULTAS') && !fStr.startsWith('Apabila')) {
      currentFakultas = fStr;
    }
    // Propagasi nilai merged cell vertikal untuk Prodi
    if (pStr && !pStr.toUpperCase().includes('PRODI')) {
      currentProdi = pStr;
    }
    // Propagasi nilai merged cell vertikal untuk Semester
    if (sStr && sStr !== '-' && !sStr.toUpperCase().includes('SEMESTER')) {
      const parsedS = parseInt(sStr, 10);
      if (!isNaN(parsedS)) currentSemester = parsedS;
    }

    // Abaikan baris header berulang, catatan footer, atau nama kosong
    if (!nStr || nStr.toUpperCase() === 'NAMA' || nStr.startsWith('By:') || nStr.startsWith('By ')) {
      skippedRows.push({
        row: rowNumber,
        reason: !nStr ? 'Nama kosong / kelas belum terisi' : 'Baris instruksi/footer/header',
        rawName: nStr || undefined,
        rawPhone,
      });
      continue;
    }

    // Sanitasi nomor HP
    const sanitizedPhone = sanitizeSpreadsheetPhone(rawPhone);
    if (!sanitizedPhone) {
      skippedRows.push({
        row: rowNumber,
        reason: 'Nomor telepon kosong / tanda bintang (*)',
        rawName: nStr,
        rawPhone,
      });
      continue;
    }

    // Validasi apakah dapat dijadikan JID
    if (!isValidWhatsAppJid(sanitizedPhone)) {
      skippedRows.push({
        row: rowNumber,
        reason: `Nomor telepon tidak valid untuk WhatsApp JID: "${sanitizedPhone}"`,
        rawName: nStr,
        rawPhone,
      });
      continue;
    }

    let jid: string;
    try {
      jid = normalizeToWhatsAppJid(sanitizedPhone);
    } catch (errNormalize) {
      skippedRows.push({
        row: rowNumber,
        reason: `Gagal normalisasi JID: ${errNormalize instanceof Error ? errNormalize.message : String(errNormalize)}`,
        rawName: nStr,
        rawPhone,
      });
      continue;
    }

    // Normalisasi kelas (misal desimal "1.0" menjadi "1")
    const kelasStr = rawKelas ? String(rawKelas).trim().replace(/\.0$/, '') : '-';

    const item: SeedKortiItem = Object.freeze({
      row: rowNumber,
      jid,
      nama: nStr,
      fakultas: currentFakultas,
      prodi: currentProdi,
      semester: currentSemester,
      kelas: kelasStr,
      noTelp: sanitizedPhone,
      role: 'korti',
    });

    validItems.push(item);
  }

  // Jika bukan dry-run, lakukan upsert ke database SQLite
  if (!options.dryRun) {
    log.info(`Menyimpan ${validItems.length} pengguna korti ke basis data...`);
    for (const item of validItems) {
      const upsertResult = await upsertUser({
        jid: item.jid,
        nama: item.nama,
        fakultas: item.fakultas,
        prodi: item.prodi,
        semester: item.semester,
        kelas: item.kelas,
        noTelp: item.noTelp,
        role: item.role,
      });

      if (!upsertResult.success) {
        log.error(`Gagal melakukan upsert korti ${item.nama} (${item.jid})`, upsertResult.error);
        return err(upsertResult.error);
      }
    }
  }

  const summary: SeedKortiSummary = Object.freeze({
    filePath: resolvedPath,
    sheetName: targetSheetName,
    totalScanned: scannedCount,
    totalImported: validItems.length,
    totalSkipped: skippedRows.length,
    isDryRun: Boolean(options.dryRun),
    items: Object.freeze(validItems),
    skipped: Object.freeze(skippedRows),
  });

  log.info(`Seeder Korti selesai. Total dipindai: ${scannedCount}, Diimpor: ${validItems.length}, Dilewati: ${skippedRows.length}`);
  return ok(summary);
}
