import { describe, expect, it } from 'bun:test';
import {
  compressSlotList,
  formatAvailabilityMatrix,
  type AvailabilityMatrixData,
} from '@/core/templates';

describe('Availability Matrix Template (src/core/templates/availability-matrix.ts)', () => {
  describe('compressSlotList', () => {
    it('should return "-" when slot list is empty', () => {
      expect(compressSlotList([])).toBe('-');
    });

    it('should return single slot code as-is', () => {
      expect(compressSlotList(['A'])).toBe('A');
    });

    it('should combine contiguous slots of 2 and 3 items without dash', () => {
      expect(compressSlotList(['A', 'B'])).toBe('AB');
      expect(compressSlotList(['D', 'E', 'F'])).toBe('DEF');
    });

    it('should use dash format for 4 or more contiguous slots', () => {
      expect(compressSlotList(['G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'])).toBe('G-O');
      expect(compressSlotList(['A', 'B', 'C', 'D'])).toBe('A-D');
    });

    it('should separate disjoint slot groups with comma', () => {
      expect(compressSlotList(['A', 'B', 'E', 'F'])).toBe('AB, EF');
      expect(compressSlotList(['C', 'G', 'H', 'I', 'J'])).toBe('C, G-J');
    });

    it('should sort unsorted slots properly', () => {
      expect(compressSlotList(['F', 'E', 'D'])).toBe('DEF');
    });
  });

  describe('formatAvailabilityMatrix', () => {
    const mockDate = {
      raw: '15/10/2026',
      iso: '2026-10-15',
      day: 15,
      month: 10,
      year: 2026,
    };

    it('should handle empty rooms array gracefully', () => {
      const emptyData: AvailabilityMatrixData = {
        date: mockDate,
        formattedIndonesianDate: 'Kamis, 15 Oktober 2026',
        rooms: [],
        summary: {
          totalRooms: 0,
          fullyAvailableRooms: 0,
          partiallyBookedRooms: 0,
          fullyBlockedRooms: 0,
        },
      };

      const result = formatAvailabilityMatrix(emptyData);
      expect(result).toContain('MATRIKS KETERSEDIAAN RUANGAN SDP UNDIKSHA');
      expect(result).toContain('Kamis, 15 Oktober 2026');
      expect(result).toContain('Tidak ada data ruangan yang aktif');
    });

    it('should render fully available rooms with 🟢 Semua Kosong', () => {
      const data: AvailabilityMatrixData = {
        date: mockDate,
        formattedIndonesianDate: 'Kamis, 15 Oktober 2026',
        rooms: [
          {
            room: {
              code: 'RAK_1.1',
              name: 'Ruang 1.1',
              building: 'Gedung R.A. Kartini',
              floor: 1,
              capacity: 40,
              isActive: true,
            },
            slots: [],
            availableSlots: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'],
            bookedSlots: [],
            blockedSlots: [],
          },
        ],
        summary: {
          totalRooms: 1,
          fullyAvailableRooms: 1,
          partiallyBookedRooms: 0,
          fullyBlockedRooms: 0,
        },
      };

      const result = formatAvailabilityMatrix(data);
      expect(result).toContain('Gedung R.A. Kartini');
      expect(result).toContain('RAK_1.1');
      expect(result).toContain('🟢 *Semua Kosong* (A-O)');
    });

    it('should render partially booked rooms and blocked slots', () => {
      const data: AvailabilityMatrixData = {
        date: mockDate,
        formattedIndonesianDate: 'Kamis, 15 Oktober 2026',
        rooms: [
          {
            room: {
              code: 'RAK_2.1',
              name: 'Ruang 2.1',
              building: 'Gedung R.A. Kartini',
              floor: 2,
              capacity: 40,
              isActive: true,
            },
            slots: [],
            availableSlots: ['A', 'B', 'C', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O'],
            bookedSlots: [
              {
                slotCode: 'D',
                status: 'booked',
                borrowerClass: 'PTI 3A',
              },
              {
                slotCode: 'E',
                status: 'booked',
                borrowerClass: 'PTI 3A',
              },
              {
                slotCode: 'F',
                status: 'booked',
                borrowerClass: 'PTI 3A',
              },
            ],
            blockedSlots: [],
          },
        ],
        summary: {
          totalRooms: 1,
          fullyAvailableRooms: 0,
          partiallyBookedRooms: 1,
          fullyBlockedRooms: 0,
        },
      };

      const result = formatAvailabilityMatrix(data);
      expect(result).toContain('RAK_2.1');
      expect(result).toContain('Kosong *ABC, G-O*');
      expect(result).toContain('Terisi: *DEF* (PTI 3A)');
    });

    it('should render header and remaining slots correctly when isToday and passedSlots are present', () => {
      const data: AvailabilityMatrixData = {
        date: mockDate,
        formattedIndonesianDate: 'Kamis, 15 Oktober 2026',
        isToday: true,
        currentTimeWita: '15:00',
        passedSlots: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
        rooms: [
          {
            room: {
              code: 'RAK_2.1',
              name: 'Ruang 2.1',
              building: 'Gedung R.A. Kartini',
              floor: 2,
              capacity: 40,
              isActive: true,
            },
            slots: [],
            availableSlots: ['I', 'J', 'K', 'L', 'M', 'N', 'O'],
            bookedSlots: [],
            blockedSlots: [],
          },
        ],
        summary: {
          totalRooms: 1,
          fullyAvailableRooms: 1,
          partiallyBookedRooms: 0,
          fullyBlockedRooms: 0,
        },
      };

      const result = formatAvailabilityMatrix(data);
      expect(result).toContain('Hari Ini, Kamis, 15 Oktober 2026');
      expect(result).toContain('Slot *A-H* telah terlewat per *15:00 WITA*');
      expect(result).toContain('RAK_2.1');
      expect(result).toContain('🟢 *Tersedia:* *I-O*');
      expect(result).toContain('!info besok');
    });

    it('should render Besok prefix when isTomorrow is true', () => {
      const data: AvailabilityMatrixData = {
        date: mockDate,
        formattedIndonesianDate: 'Jumat, 16 Oktober 2026',
        isTomorrow: true,
        rooms: [],
        summary: {
          totalRooms: 0,
          fullyAvailableRooms: 0,
          partiallyBookedRooms: 0,
          fullyBlockedRooms: 0,
        },
      };

      const result = formatAvailabilityMatrix(data);
      expect(result).toContain('Besok, Jumat, 16 Oktober 2026');
    });
  });
});
