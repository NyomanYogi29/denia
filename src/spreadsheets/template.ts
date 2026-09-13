import { getGoogleSheetsClient } from './auth.ts';
import { getSpreadsheetMetadata, batchUpdateValues, type BatchUpdateRangeItem } from './client.ts';
import { config } from '@/core/config/env.ts';
import { logger } from '@/core/logger/index.ts';
import { ok, err, type Result } from '@/core/types/index.ts';
import { AppError, ErrorCode } from '@/core/errors/index.ts';
import { DAY_TAB_NAMES, DATE_HEADER_CELL, type DayTabName } from './types.ts';

const log = logger.child({ module: 'SPREADSHEETS_TEMPLATE' });

const SLOT_HEADER_ROW = [
  '7.30-8.20 (A)',
  '8.30-9.20 (B)',
  '9.30-10.20 (C)',
  '10.30-11.20 (D)',
  '11.30-12.20 (E)',
  '12.30-13.20 (F)',
  '13.30-14.20 (G)',
  '14.30-15.30 (H)',
  '15.30-16.20 (I)',
  '16.20-17.10 (J)',
  '17.30-18.20 (K)',
  '18.20-19.10 (L)',
  '19.30-20.20 (M)',
  '20.20-21.10 (N)',
  '21.10-22.00 (O)',
];

/**
 * Memeriksa dan menginisialisasi lembar kerja Google Sheets agar memiliki struktur
 * 5 tab hari (SENIN - JUMAT) lengkap dengan gedung, ruangan, dan header slot SKS.
 */
export async function ensureSpreadsheetTemplate(): Promise<Result<{ createdTabs: string[] }>> {
  const metaRes = await getSpreadsheetMetadata();
  if (!metaRes.success) {
    return metaRes;
  }

  const existingSheets = metaRes.data.sheets || [];
  const existingSheetTitles = new Set(
    existingSheets.map((s) => s.properties?.title?.trim().toUpperCase()).filter(Boolean)
  );

  const sheetsClient = getGoogleSheetsClient();
  const createdTabs: string[] = [];

  // 1. Buat tab hari yang belum ada
  for (const tab of DAY_TAB_NAMES) {
    if (!existingSheetTitles.has(tab)) {
      log.info(`Tab "${tab}" belum ada di spreadsheet. Membuat tab baru...`);
      try {
        await sheetsClient.spreadsheets.batchUpdate({
          spreadsheetId: config.google.sheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: tab,
                    gridProperties: {
                      rowCount: 50,
                      columnCount: 20,
                    },
                  },
                },
              },
            ],
          },
        });
        createdTabs.push(tab);
      } catch (error) {
        log.error(`Gagal membuat tab "${tab}"`, error);
        return err(
          new AppError({
            code: ErrorCode.EXTERNAL_API_ERROR,
            userMessage: `Gagal membuat tab "${tab}" di Google Sheets: ${
              error instanceof Error ? error.message : String(error)
            }`,
            metadata: { tab },
            cause: error,
          })
        );
      }
    }
  }

  // 2. Isi struktur template dasar untuk tab yang baru dibuat (atau jika diperbarui)
  for (const tab of DAY_TAB_NAMES) {
    const templateUpdates: BatchUpdateRangeItem[] = [];

    // Header Tanggal
    templateUpdates.push({
      range: `'${tab}'!${DATE_HEADER_CELL}`,
      values: [['TANGGAL:']],
    });

    // Seksi R.A. Kartini
    templateUpdates.push({
      range: `'${tab}'!A4:C4`,
      values: [['GEDUNG', 'RUANGAN ', 'JAM PERKULIAHAN']],
    });
    templateUpdates.push({
      range: `'${tab}'!C5:Q5`,
      values: [SLOT_HEADER_ROW],
    });
    templateUpdates.push({
      range: `'${tab}'!A6`,
      values: [['R.A. KARTINI']],
    });

    const rakRooms = [
      '1.1', '1.2', '1.3', '1.4',
      '2.1', '2.2', '2.3', '2.4',
      '3.1', '3.2', '3.3', '3.4',
      '4.1', '4.2', '4.3', '4.4',
    ];
    templateUpdates.push({
      range: `'${tab}'!B6:B21`,
      values: rakRooms.map((r) => [r]),
    });

    // Seksi Ki Hajar Dewantara
    templateUpdates.push({
      range: `'${tab}'!A25:C25`,
      values: [['GEDUNG', 'RUANGAN ', 'JAM PERKULIAHAN']],
    });
    templateUpdates.push({
      range: `'${tab}'!C26:Q26`,
      values: [SLOT_HEADER_ROW],
    });
    templateUpdates.push({
      range: `'${tab}'!A27`,
      values: [['KI HAJAR DEWANTARA']],
    });

    const khdRooms = [
      'HYBRID',
      '2.1', '2.2', '2.3', '2.4',
      '3.1', '3.2', '3.3', '3.4',
      '4.1', '4.2', '4.3', '4.4',
    ];
    templateUpdates.push({
      range: `'${tab}'!B27:B39`,
      values: khdRooms.map((r) => [r]),
    });

    // Seksi Auditorium
    templateUpdates.push({
      range: `'${tab}'!A43:C43`,
      values: [['AUDITORIUM', '', 'JAM PERKULIAHAN']],
    });
    templateUpdates.push({
      range: `'${tab}'!C44:Q44`,
      values: [SLOT_HEADER_ROW],
    });

    // Jika tab baru saja dibuat, tuliskan template dasarnya
    if (createdTabs.includes(tab)) {
      await batchUpdateValues(templateUpdates);
    }
  }

  return ok({ createdTabs });
}
