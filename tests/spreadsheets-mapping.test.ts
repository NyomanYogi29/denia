import { describe, expect, it } from 'bun:test';
import {
  ROOM_ROW_MAP,
  SLOT_COL_MAP,
  getRoomRow,
  getSlotColumn,
  dateToDayTab,
  getCellCoordinate,
  getWeekDaysForDate,
} from '../src/spreadsheets/mappings.ts';

describe('Spreadsheets Mappings Module', () => {
  describe('Room to Row Mapping', () => {
    it('should correctly map Gedung R.A. Kartini rooms to rows 6-21', () => {
      expect(getRoomRow('RAK_1.1')).toBe(6);
      expect(getRoomRow('RAK_1.2')).toBe(7);
      expect(getRoomRow('RAK_1.3')).toBe(8);
      expect(getRoomRow('RAK_1.4')).toBe(9);
      expect(getRoomRow('RAK_2.1')).toBe(10);
      expect(getRoomRow('RAK_4.4')).toBe(21);
    });

    it('should be case-insensitive for room codes', () => {
      expect(getRoomRow('rak_2.1')).toBe(10);
      expect(getRoomRow('rak_4.4')).toBe(21);
    });

    it('should correctly map Gedung Ki Hajar Dewantara rooms', () => {
      expect(getRoomRow('HYBRID')).toBe(27);
      expect(getRoomRow('KHD_HYBRID')).toBe(27);
      expect(getRoomRow('KHD_2.2')).toBe(29);
      expect(getRoomRow('KHD_2.4')).toBe(31);
      expect(getRoomRow('KHD_3.2')).toBe(33);
      expect(getRoomRow('KHD_4.4')).toBe(39);
    });

    it('should correctly map Auditorium', () => {
      expect(getRoomRow('AUDITORIUM')).toBe(45);
      expect(getRoomRow('auditorium')).toBe(45);
    });

    it('should return null for unknown room codes', () => {
      expect(getRoomRow('UNKNOWN_ROOM')).toBeNull();
      expect(getRoomRow('')).toBeNull();
    });
  });

  describe('Slot to Column Mapping', () => {
    it('should correctly map slots A through O to columns C through Q', () => {
      expect(getSlotColumn('A')).toBe('C');
      expect(getSlotColumn('B')).toBe('D');
      expect(getSlotColumn('C')).toBe('E');
      expect(getSlotColumn('D')).toBe('F');
      expect(getSlotColumn('E')).toBe('G');
      expect(getSlotColumn('F')).toBe('H');
      expect(getSlotColumn('G')).toBe('I');
      expect(getSlotColumn('H')).toBe('J');
      expect(getSlotColumn('I')).toBe('K');
      expect(getSlotColumn('J')).toBe('L');
      expect(getSlotColumn('K')).toBe('M');
      expect(getSlotColumn('L')).toBe('N');
      expect(getSlotColumn('M')).toBe('O');
      expect(getSlotColumn('N')).toBe('P');
      expect(getSlotColumn('O')).toBe('Q');
    });

    it('should handle lowercase slot codes', () => {
      expect(getSlotColumn('d')).toBe('F');
      expect(getSlotColumn('o')).toBe('Q');
    });

    it('should return null for invalid slot codes', () => {
      expect(getSlotColumn('Z')).toBeNull();
      expect(getSlotColumn('1')).toBeNull();
    });
  });

  describe('Date to DayTab Mapping', () => {
    it('should map Monday to SENIN', () => {
      // 2026-09-14 is Monday
      expect(dateToDayTab('2026-09-14')).toBe('SENIN');
    });

    it('should map Tuesday through Friday to appropriate tabs', () => {
      expect(dateToDayTab('2026-09-15')).toBe('SELASA');
      expect(dateToDayTab('2026-09-16')).toBe('RABU');
      expect(dateToDayTab('2026-09-17')).toBe('KAMIS');
      expect(dateToDayTab('2026-09-18')).toBe('JUMAT');
    });

    it('should return null for Saturday and Sunday (weekends)', () => {
      // 2026-09-19 is Saturday, 2026-09-20 is Sunday
      expect(dateToDayTab('2026-09-19')).toBeNull();
      expect(dateToDayTab('2026-09-20')).toBeNull();
    });
  });

  describe('Cell Coordinate Generator', () => {
    it('should generate exact cell coordinate and A1 address', () => {
      const coord = getCellCoordinate('RAK_2.1', '2026-09-14', 'D');
      expect(coord).not.toBeNull();
      expect(coord?.tab).toBe('SENIN');
      expect(coord?.row).toBe(10);
      expect(coord?.col).toBe('F');
      expect(coord?.cellA1).toBe('F10');
    });

    it('should return null if booking is on weekend', () => {
      const coord = getCellCoordinate('RAK_2.1', '2026-09-19', 'D');
      expect(coord).toBeNull();
    });

    it('should return null if room is unmapped', () => {
      const coord = getCellCoordinate('UNKNOWN', '2026-09-14', 'D');
      expect(coord).toBeNull();
    });
  });

  describe('Week Days Calculator', () => {
    it('should compute Monday to Friday dates correctly', () => {
      const week = getWeekDaysForDate('2026-09-16'); // Wednesday
      expect(week.SENIN.iso).toBe('2026-09-14');
      expect(week.SENIN.formatted).toBe('14/09/2026');
      expect(week.SELASA.iso).toBe('2026-09-15');
      expect(week.RABU.iso).toBe('2026-09-16');
      expect(week.KAMIS.iso).toBe('2026-09-17');
      expect(week.JUMAT.iso).toBe('2026-09-18');
      expect(week.JUMAT.formatted).toBe('18/09/2026');
    });

    it('should roll forward on Sunday to the upcoming Monday by default', () => {
      const week = getWeekDaysForDate('2026-09-13'); // Sunday
      expect(week.SENIN.iso).toBe('2026-09-14');
      expect(week.SENIN.formatted).toBe('14/09/2026');
      expect(week.JUMAT.iso).toBe('2026-09-18');
      expect(week.JUMAT.formatted).toBe('18/09/2026');
    });

    it('should calculate next week correctly for 21 September 2026', () => {
      const week = getWeekDaysForDate('2026-09-21'); // Next Monday
      expect(week.SENIN.iso).toBe('2026-09-21');
      expect(week.SENIN.formatted).toBe('21/09/2026');
      expect(week.SELASA.iso).toBe('2026-09-22');
      expect(week.SELASA.formatted).toBe('22/09/2026');
      expect(week.RABU.iso).toBe('2026-09-23');
      expect(week.RABU.formatted).toBe('23/09/2026');
      expect(week.KAMIS.iso).toBe('2026-09-24');
      expect(week.KAMIS.formatted).toBe('24/09/2026');
      expect(week.JUMAT.iso).toBe('2026-09-25');
      expect(week.JUMAT.formatted).toBe('25/09/2026');
    });
  });
});
