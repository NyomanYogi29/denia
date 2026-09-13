import chalk from 'chalk';

export function renderSheetsHeader(actionName: string): void {
  console.log(chalk.bold.cyan(`\n=== Google Sheets: ${actionName} ===\n`));
}

export function renderSheetsTestSuccess(data: {
  title: string;
  sheetId: string;
  sheetCount: number;
  sheetTitles: string[];
}): void {
  console.log(chalk.green('✓ Berhasil terhubung ke Google Sheets API!\n'));
  console.log(`  ${chalk.bold('Judul Spreadsheet:')} ${chalk.yellow(data.title)}`);
  console.log(`  ${chalk.bold('Spreadsheet ID   :')} ${chalk.gray(data.sheetId)}`);
  console.log(`  ${chalk.bold('Total Lembar/Tab :')} ${data.sheetCount}`);
  console.log(`  ${chalk.bold('Daftar Tab       :')} ${data.sheetTitles.join(', ')}\n`);
}

export function renderSheetsInitSuccess(createdTabs: string[]): void {
  if (createdTabs.length === 0) {
    console.log(chalk.green('✓ Seluruh tab hari (SENIN - JUMAT) sudah terpasang dengan lengkap di Google Sheets.\n'));
  } else {
    console.log(chalk.green(`✓ Berhasil membuat dan menginisialisasi ${createdTabs.length} tab baru:`));
    for (const tab of createdTabs) {
      console.log(`  ${chalk.cyan('+')} Tab ${chalk.bold(tab)}`);
    }
    console.log();
  }
}

export function renderSheetsSyncSuccess(dateOrTarget: string, totalUpdated: number): void {
  console.log(chalk.green(`✓ Sinkronisasi ke Google Sheets berhasil!\n`));
  console.log(`  ${chalk.bold('Target       :')} ${dateOrTarget}`);
  console.log(`  ${chalk.bold('Total Diubah :')} ${chalk.yellow(totalUpdated)} sel\n`);
}
