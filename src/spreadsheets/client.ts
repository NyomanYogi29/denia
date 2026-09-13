import type { sheets_v4 } from 'googleapis';
import { getGoogleSheetsClient } from './auth.ts';
import { config } from '@/core/config/env.ts';
import { AppError, ErrorCode } from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { ok, err, type Result } from '@/core/types/index.ts';

const log = logger.child({ module: 'SPREADSHEETS_CLIENT' });

export interface BatchUpdateRangeItem {
  readonly range: string; // e.g. "'SENIN'!F10" atau "'SENIN'!C6:Q21"
  readonly values: (string | number)[][];
}

/**
 * Membaca metadata spreadsheet (judul berkas, daftar sheets/tab, dsb.)
 */
export async function getSpreadsheetMetadata(): Promise<Result<sheets_v4.Schema$Spreadsheet>> {
  try {
    const sheets = getGoogleSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId: config.google.sheetId,
    });
    return ok(response.data);
  } catch (error: unknown) {
    log.error('Gagal mengambil metadata Google Spreadsheet', error);
    return err(
      new AppError({
        code: ErrorCode.EXTERNAL_API_ERROR,
        userMessage: `Gagal terhubung ke Google Spreadsheet (${config.google.sheetId}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error,
      })
    );
  }
}

/**
 * Mengirimkan sekumpulan pembaruan sel dalam 1 kali request batchUpdate API (Atomic & Rate-Limit Safe)
 */
export async function batchUpdateValues(
  data: readonly BatchUpdateRangeItem[]
): Promise<Result<{ totalUpdatedCells: number }>> {
  if (data.length === 0) {
    return ok({ totalUpdatedCells: 0 });
  }

  try {
    const sheets = getGoogleSheetsClient();

    const requestBody: sheets_v4.Schema$BatchUpdateValuesRequest = {
      valueInputOption: 'USER_ENTERED',
      data: data.map((item) => ({
        range: item.range,
        values: item.values as unknown[][],
      })),
    };

    const response = await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: config.google.sheetId,
      requestBody,
    });

    const updatedCells = response.data.totalUpdatedCells ?? 0;
    log.debug(`Berhasil batchUpdate ${updatedCells} sel pada Google Sheets`);

    return ok({ totalUpdatedCells: updatedCells });
  } catch (error: unknown) {
    const isRateLimit =
      error instanceof Error &&
      (error.message.includes('429') ||
        error.message.includes('Quota exceeded') ||
        error.message.includes('RATE_LIMIT_EXCEEDED'));

    const code = isRateLimit ? ErrorCode.RATE_LIMIT_EXCEEDED : ErrorCode.EXTERNAL_API_ERROR;

    log.error(
      isRateLimit
        ? 'Google Sheets API Rate Limit terlampaui (HTTP 429)'
        : 'Gagal melakukan batchUpdate pada Google Sheets',
      error
    );

    return err(
      new AppError({
        code,
        userMessage: `Gagal memperbarui sel Google Sheets: ${
          error instanceof Error ? error.message : String(error)
        }`,
        metadata: { isRateLimit },
        cause: error,
      })
    );
  }
}

/**
 * Mengosongkan suatu rentang sel di Google Sheets
 */
export async function clearCellRange(range: string): Promise<Result<void>> {
  return batchClearRanges([range]);
}

/**
 * Mengosongkan sekumpulan rentang sel di Google Sheets sekaligus dalam 1 request API
 */
export async function batchClearRanges(ranges: readonly string[]): Promise<Result<void>> {
  if (ranges.length === 0) return ok(undefined);

  try {
    const sheets = getGoogleSheetsClient();
    await sheets.spreadsheets.values.batchClear({
      spreadsheetId: config.google.sheetId,
      requestBody: {
        ranges: [...ranges],
      },
    });
    return ok(undefined);
  } catch (error: unknown) {
    log.error(`Gagal mengosongkan rentang Google Sheets: ${ranges.join(', ')}`, error);
    return err(
      new AppError({
        code: ErrorCode.EXTERNAL_API_ERROR,
        userMessage: `Gagal mengosongkan sel (${ranges.join(', ')}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        cause: error,
      })
    );
  }
}
