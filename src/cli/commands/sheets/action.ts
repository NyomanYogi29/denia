import { CliError } from '@/cli/errors/index.ts';
import {
  getSpreadsheetMetadata,
  ensureSpreadsheetTemplate,
  syncDateFull,
  syncCurrentWeek,
} from '@/spreadsheets/index.ts';
import { config } from '@/core/config/env.ts';
import { getTodayIso, parseDateString } from '@/core/utils/date.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import {
  renderSheetsHeader,
  renderSheetsTestSuccess,
  renderSheetsInitSuccess,
  renderSheetsSyncSuccess,
} from './ui.ts';

export interface SheetsActionOptions {
  readonly isQuiet?: boolean;
  readonly isJsonOutput?: boolean;
}

export async function sheetsTestAction(
  options: SheetsActionOptions = {}
): Promise<Result<unknown, CliError>> {
  if (!options.isQuiet && !options.isJsonOutput) {
    renderSheetsHeader('Uji Koneksi Service Account');
  }

  const metaRes = await getSpreadsheetMetadata();
  if (!metaRes.success) {
    return err(
      new CliError({
        code: metaRes.error.code,
        message: metaRes.error.userMessage,
        cause: metaRes.error,
      })
    );
  }

  const meta = metaRes.data;
  const title = meta.properties?.title || 'Tanpa Judul';
  const sheets = meta.sheets || [];
  const sheetTitles = sheets.map((s) => s.properties?.title || '').filter(Boolean);

  const data = {
    title,
    sheetId: config.google.sheetId,
    sheetCount: sheets.length,
    sheetTitles,
  };

  if (options.isJsonOutput) {
    console.log(JSON.stringify(data, null, 2));
  } else if (!options.isQuiet) {
    renderSheetsTestSuccess(data);
  }

  return ok(data);
}

export async function sheetsInitAction(
  options: SheetsActionOptions = {}
): Promise<Result<unknown, CliError>> {
  if (!options.isQuiet && !options.isJsonOutput) {
    renderSheetsHeader('Inisialisasi Template 5 Hari');
  }

  const initRes = await ensureSpreadsheetTemplate();
  if (!initRes.success) {
    return err(
      new CliError({
        code: initRes.error.code,
        message: initRes.error.userMessage,
        cause: initRes.error,
      })
    );
  }

  if (options.isJsonOutput) {
    console.log(JSON.stringify(initRes.data, null, 2));
  } else if (!options.isQuiet) {
    renderSheetsInitSuccess(initRes.data.createdTabs);
  }

  return ok(initRes.data);
}

export async function sheetsSyncAction(
  options: SheetsActionOptions = {},
  dateArg?: string
): Promise<Result<unknown, CliError>> {
  if (!options.isQuiet && !options.isJsonOutput) {
    renderSheetsHeader('Sinkronisasi Jadwal Tanggal');
  }

  let targetIso: string;
  if (!dateArg || dateArg.toLowerCase() === 'today' || dateArg.toLowerCase() === 'hari ini') {
    targetIso = getTodayIso();
  } else if (dateArg.toLowerCase() === 'tomorrow' || dateArg.toLowerCase() === 'besok') {
    const parseRes = parseDateString('besok');
    targetIso = parseRes.success ? parseRes.data.iso : getTodayIso();
  } else {
    const parseRes = parseDateString(dateArg, { allowPast: true });
    if (!parseRes.success) {
      return err(
        new CliError({
          code: parseRes.error.code,
          message: parseRes.error.userMessage,
          hint: 'Gunakan format: denia sheets sync [DD/MM/YYYY] atau "today" / "besok"',
        })
      );
    }
    targetIso = parseRes.data.iso;
  }

  const syncRes = await syncDateFull(targetIso);
  if (!syncRes.success) {
    return err(
      new CliError({
        code: syncRes.error.code,
        message: syncRes.error.userMessage,
        cause: syncRes.error,
      })
    );
  }

  if (options.isJsonOutput) {
    console.log(JSON.stringify(syncRes.data, null, 2));
  } else if (!options.isQuiet) {
    renderSheetsSyncSuccess(`${targetIso} (Tab ${syncRes.data.tab})`, syncRes.data.totalUpdated);
  }

  return ok(syncRes.data);
}

export async function sheetsSyncWeekAction(
  options: SheetsActionOptions = {},
  dateArg?: string
): Promise<Result<unknown, CliError>> {
  if (!options.isQuiet && !options.isJsonOutput) {
    renderSheetsHeader('Sinkronisasi Jadwal Mingguan');
  }

  let targetIso: string | undefined;
  if (dateArg) {
    const parseRes = parseDateString(dateArg, { allowPast: true });
    if (!parseRes.success) {
      return err(
        new CliError({
          code: parseRes.error.code,
          message: parseRes.error.userMessage,
          hint: 'Gunakan format: denia sheets sync-week [DD/MM/YYYY] atau tanpa argumen untuk minggu berjalan',
        })
      );
    }
    targetIso = parseRes.data.iso;
  }

  const syncRes = await syncCurrentWeek(targetIso);
  if (!syncRes.success) {
    return err(
      new CliError({
        code: syncRes.error.code,
        message: syncRes.error.userMessage,
        cause: syncRes.error,
      })
    );
  }

  const { weekDays, totalDays } = syncRes.data;
  const label = `Minggu ${weekDays.SENIN.formatted} s.d. ${weekDays.JUMAT.formatted} (${totalDays} Hari Kerja)`;

  if (options.isJsonOutput) {
    console.log(JSON.stringify(syncRes.data, null, 2));
  } else if (!options.isQuiet) {
    renderSheetsSyncSuccess(label, totalDays);
  }

  return ok(syncRes.data);
}
