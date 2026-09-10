export interface SeedKortiOptions {
  readonly filePath?: string;
  readonly dryRun?: boolean;
}

export interface SeedKortiItem {
  readonly row: number;
  readonly jid: string;
  readonly nama: string;
  readonly fakultas?: string;
  readonly prodi?: string;
  readonly semester?: number;
  readonly kelas: string;
  readonly noTelp: string;
  readonly role: 'korti';
}

export interface SeedSkippedRow {
  readonly row: number;
  readonly reason: string;
  readonly rawName?: string;
  readonly rawPhone?: unknown;
}

export interface SeedKortiSummary {
  readonly filePath: string;
  readonly sheetName: string;
  readonly totalScanned: number;
  readonly totalImported: number;
  readonly totalSkipped: number;
  readonly isDryRun: boolean;
  readonly items: readonly SeedKortiItem[];
  readonly skipped: readonly SeedSkippedRow[];
}
