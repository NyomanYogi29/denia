import type { RoomInfo } from '@/core/constants';
import type { ParsedDate } from '@/core/utils';

export type SlotStatusType = 'available' | 'booked' | 'blocked' | 'passed';

export interface RoomSlotStatus {
  readonly slotCode: string;
  readonly status: SlotStatusType;
  readonly borrowerClass?: string;
  readonly borrowerName?: string;
  readonly eventName?: string;
}

export interface RoomScheduleItem {
  readonly room: RoomInfo;
  readonly slots: readonly RoomSlotStatus[];
  readonly availableSlots: readonly string[];
  readonly bookedSlots: readonly RoomSlotStatus[];
  readonly blockedSlots: readonly RoomSlotStatus[];
}

export interface AvailabilityMatrixData {
  readonly date: ParsedDate;
  readonly formattedIndonesianDate: string;
  readonly rooms: readonly RoomScheduleItem[];
  readonly isToday?: boolean;
  readonly isTomorrow?: boolean;
  readonly currentTimeWita?: string;
  readonly passedSlots?: readonly string[];
  readonly summary: {
    readonly totalRooms: number;
    readonly fullyAvailableRooms: number;
    readonly partiallyBookedRooms: number;
    readonly fullyBlockedRooms: number;
  };
}

/**
 * Mengelompokkan huruf slot kontigu menjadi format teks yang ringkas.
 * Contoh:
 * - ['A', 'B', 'C'] -> 'ABC'
 * - ['G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'] -> 'G-O'
 * - ['A', 'B', 'E', 'F'] -> 'AB, EF'
 */
export function compressSlotList(slotCodes: readonly string[]): string {
  if (slotCodes.length === 0) return '-';

  const sorted = [...slotCodes].map((s) => s.toUpperCase()).sort();
  const groups: string[][] = [];
  let currentGroup: string[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i]!;
    if (currentGroup.length === 0) {
      currentGroup.push(current);
    } else {
      const prev = currentGroup[currentGroup.length - 1]!;
      if (current.charCodeAt(0) === prev.charCodeAt(0) + 1) {
        currentGroup.push(current);
      } else {
        groups.push(currentGroup);
        currentGroup = [current];
      }
    }
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups
    .map((grp) => {
      if (grp.length >= 4) {
        return `${grp[0]}-${grp[grp.length - 1]}`;
      }
      return grp.join('');
    })
    .join(', ');
}

/**
 * Format matriks ketersediaan seluruh ruangan ke format pesan WhatsApp yang rapi,
 * mudah dibaca, dan informatif bagi mahasiswa/korti.
 */
export function formatAvailabilityMatrix(data: AvailabilityMatrixData): string {
  const {
    date,
    formattedIndonesianDate,
    rooms,
    summary,
    isToday,
    isTomorrow,
    currentTimeWita,
    passedSlots = [],
  } = data;

  let datePrefix = '';
  if (isTomorrow) {
    datePrefix = 'Besok, ';
  } else if (isToday) {
    datePrefix = 'Hari Ini, ';
  }

  const lines: string[] = [
    '📊 *MATRIKS KETERSEDIAAN RUANGAN SDP UNDIKSHA*',
    `📅 Tanggal : *${datePrefix}${formattedIndonesianDate}* (${date.raw})`,
  ];

  if (isToday && passedSlots.length > 0) {
    const timeDisplay = currentTimeWita ? ` per *${currentTimeWita} WITA*` : '';
    lines.push(`⏰ Info Jam : Slot *${compressSlotList(passedSlots)}* telah terlewat${timeDisplay}.`);
  }

  lines.push('──────────────────────────', '');

  if (rooms.length === 0) {
    lines.push('⚠️ _Tidak ada data ruangan yang aktif pada tanggal ini._');
    return lines.join('\n');
  }

  // Kelompokkan ruangan berdasarkan gedung
  const buildingsMap = new Map<string, RoomScheduleItem[]>();
  for (const item of rooms) {
    const buildingName = item.room.building;
    if (!buildingsMap.has(buildingName)) {
      buildingsMap.set(buildingName, []);
    }
    buildingsMap.get(buildingName)!.push(item);
  }

  for (const [building, roomItems] of buildingsMap.entries()) {
    lines.push(`🏢 *${building}*`);

    for (const item of roomItems) {
      const { room, availableSlots, bookedSlots, blockedSlots } = item;

      // Kasus 1: Seluruh slot diblokir force event
      if (availableSlots.length === 0 && blockedSlots.length > 0 && bookedSlots.length === 0) {
        const eventName = blockedSlots[0]?.eventName ?? 'Agenda Institusi';
        lines.push(`• *${room.code}* (${room.name}) : ⛔ _Diblokir: ${eventName}_`);
        continue;
      }

      // Kasus 2: Semua slot kosong (belum ada yang booking/block)
      if (bookedSlots.length === 0 && blockedSlots.length === 0) {
        if (isToday && availableSlots.length === 0) {
          lines.push(`• *${room.code}* (${room.name}) : ⚪ _Tidak ada slot tersisa hari ini_`);
        } else if (isToday && passedSlots.length > 0) {
          lines.push(
            `• *${room.code}* (${room.name}) : 🟢 *Tersedia:* *${compressSlotList(availableSlots)}*`
          );
        } else {
          lines.push(`• *${room.code}* (${room.name}) : 🟢 *Semua Kosong* (A-O)`);
        }
        continue;
      }

      // Kasus 3: Ada sebagian terisi / sebagian kosong
      const bookedGroupMap = new Map<string, string[]>();
      for (const b of bookedSlots) {
        const label = b.borrowerClass || b.borrowerName || 'Terisi';
        if (!bookedGroupMap.has(label)) {
          bookedGroupMap.set(label, []);
        }
        bookedGroupMap.get(label)!.push(b.slotCode);
      }

      const bookedStrings: string[] = [];
      for (const [label, slots] of bookedGroupMap.entries()) {
        bookedStrings.push(`*${compressSlotList(slots)}* (${label})`);
      }

      const blockedGroupMap = new Map<string, string[]>();
      for (const bl of blockedSlots) {
        const evName = bl.eventName || 'Agenda Kampus';
        if (!blockedGroupMap.has(evName)) {
          blockedGroupMap.set(evName, []);
        }
        blockedGroupMap.get(evName)!.push(bl.slotCode);
      }
      for (const [evName, slots] of blockedGroupMap.entries()) {
        bookedStrings.push(`⛔ *${compressSlotList(slots)}* (${evName})`);
      }

      const freeText =
        availableSlots.length > 0 ? `Kosong *${compressSlotList(availableSlots)}*` : 'Penuh';

      lines.push(
        `• *${room.code}* (${room.name}) : ${freeText} | Terisi: ${bookedStrings.join(', ')}`
      );
    }
    lines.push('');
  }

  lines.push('──────────────────────────');
  lines.push(
    `📈 *Ringkasan:* ${summary.totalRooms} ruangan (${summary.fullyAvailableRooms} kosong penuh, ${summary.partiallyBookedRooms} terisi sebagian)`
  );
  if (isToday) {
    lines.push('💡 _Ketik `!info besok` untuk melihat ketersediaan jadwal esok hari._');
  }
  lines.push('💡 _Pesan ruang:_ `!pinjam [kode_ruangan] [DD/MM/YYYY] [kode_slot]`');

  return lines.join('\n');
}
