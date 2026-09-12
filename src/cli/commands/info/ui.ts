import chalk from 'chalk';
import type { AvailabilityMatrixData } from '@/core/templates';

/**
 * Menampilkan judul perintah matriks ketersediaan pada terminal
 */
export function renderHeader(): void {
  console.log(chalk.bold.cyan('\n=== Matriks Ketersediaan Ruangan SDP Undiksha (Fase 5.3) ===\n'));
}

/**
 * Menampilkan matriks ketersediaan ruangan ke terminal dengan format chalk berwarna
 */
export function renderMatrixTerminal(matrix: AvailabilityMatrixData): void {
  console.log(chalk.bold.white(`📅 Tanggal : `) + chalk.bold.yellow(`${matrix.formattedIndonesianDate} (${matrix.date.raw})`));
  console.log(chalk.gray('─'.repeat(60)));

  if (matrix.rooms.length === 0) {
    console.log(chalk.yellow('⚠️  Tidak ada data ruangan yang aktif pada tanggal ini.\n'));
    return;
  }

  // Kelompokkan ruangan berdasarkan gedung
  const buildingsMap = new Map<string, typeof matrix.rooms>();
  for (const item of matrix.rooms) {
    const buildingName = item.room.building;
    if (!buildingsMap.has(buildingName)) {
      buildingsMap.set(buildingName, []);
    }
    (buildingsMap.get(buildingName) as any).push(item);
  }

  for (const [building, roomItems] of buildingsMap.entries()) {
    console.log(chalk.bold.magenta(`\n🏢 ${building}`));

    for (const item of roomItems) {
      const { room, availableSlots, bookedSlots, blockedSlots } = item;

      // Kasus 1: Seluruh slot diblokir
      if (availableSlots.length === 0 && blockedSlots.length > 0) {
        const evName = blockedSlots[0]?.eventName ?? 'Agenda Institusi';
        console.log(`  • ${chalk.bold.cyan(room.code.padEnd(8))} (${room.name}) : ${chalk.red(`⛔ Diblokir seharian: ${evName}`)}`);
        continue;
      }

      // Kasus 2: Semua slot kosong
      if (bookedSlots.length === 0 && blockedSlots.length === 0) {
        console.log(`  • ${chalk.bold.cyan(room.code.padEnd(8))} (${room.name}) : ${chalk.bold.green('🟢 Semua Kosong (A-O)')}`);
        continue;
      }

      // Kasus 3: Ada sebagian terisi
      const freeSlotsText = availableSlots.length > 0 ? availableSlots.join('') : 'Penuh';
      const bookedParts: string[] = [];

      for (const b of bookedSlots) {
        const label = b.borrowerClass || b.borrowerName || 'Terisi';
        bookedParts.push(`${chalk.yellow(b.slotCode)}(${label})`);
      }
      for (const bl of blockedSlots) {
        const evName = bl.eventName || 'Blokir';
        bookedParts.push(`${chalk.red(bl.slotCode)}(${evName})`);
      }

      console.log(
        `  • ${chalk.bold.cyan(room.code.padEnd(8))} (${room.name}) : ` +
        `Kosong: ${chalk.green(freeSlotsText.padEnd(8))} | ` +
        `Terisi: ${bookedParts.join(', ')}`
      );
    }
  }

  console.log(chalk.gray('\n' + '─'.repeat(60)));
  console.log(
    chalk.bold('📈 Ringkasan: ') +
    `${matrix.summary.totalRooms} ruangan (${chalk.green(matrix.summary.fullyAvailableRooms + ' kosong penuh')}, ` +
    `${chalk.yellow(matrix.summary.partiallyBookedRooms + ' terisi sebagian')}, ` +
    `${chalk.red(matrix.summary.fullyBlockedRooms + ' diblokir')})`
  );
  console.log(chalk.gray('💡 Perintah pinjam: denia pinjam <room> <date> <slot> --jid <whatsapp>\n'));
}
