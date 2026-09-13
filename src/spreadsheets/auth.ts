import { google, type sheets_v4 } from 'googleapis';
import { config } from '@/core/config/env.ts';
import { logger } from '@/core/logger/index.ts';

const log = logger.child({ module: 'SPREADSHEETS_AUTH' });

let sheetsClientInstance: sheets_v4.Sheets | null = null;

/**
 * Menginisialisasi atau mengambil instance singleton klien Google Sheets API v4
 */
export function getGoogleSheetsClient(): sheets_v4.Sheets {
  if (sheetsClientInstance) {
    return sheetsClientInstance;
  }

  const scopes = ['https://www.googleapis.com/auth/spreadsheets'];

  let auth: InstanceType<typeof google.auth.GoogleAuth>;

  if (config.google.serviceAccountKey) {
    auth = new google.auth.GoogleAuth({
      credentials: config.google.serviceAccountKey as unknown as Record<string, unknown>,
      scopes,
    });
  } else if (config.google.serviceAccountPath) {
    auth = new google.auth.GoogleAuth({
      keyFile: config.google.serviceAccountPath,
      scopes,
    });
  } else {
    throw new Error(
      '[GoogleAuth Error] Kredensial Google Service Account tidak ditemukan di konfigurasi (.env).'
    );
  }

  sheetsClientInstance = google.sheets({ version: 'v4', auth });
  log.info('Klien Google Sheets API v4 berhasil diinisialisasi dengan kredensial Service Account');
  return sheetsClientInstance;
}
