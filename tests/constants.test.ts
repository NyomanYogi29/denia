import { describe, expect, it } from 'bun:test';
import {
  SLOT_CODES,
  SLOTS,
  MIN_BOOKING_SKS,
  MAX_BOOKING_SKS,
  isValidSlotCode,
  getSlotInfo,
  ROOM_LIST,
  ROOM_CODES,
  ROOM_MAP,
  isValidRoomCode,
  getRoomInfo,
} from '@/constants';

describe('Constants Module', () => {
  describe('Academic Slots Constants (SKS Matrix)', () => {
    it('should be frozen (immutable)', () => {
      expect(Object.isFrozen(SLOT_CODES)).toBe(true);
      expect(Object.isFrozen(SLOTS)).toBe(true);
      expect(Object.isFrozen(SLOTS.A)).toBe(true);
      expect(Object.isFrozen(SLOTS.O)).toBe(true);
    });

    it('should define exactly 15 academic slots from A to O', () => {
      expect(SLOT_CODES.length).toBe(15);
      expect(SLOT_CODES[0]).toBe('A');
      expect(SLOT_CODES[14]).toBe('O');
      expect(Object.keys(SLOTS).length).toBe(15);
    });

    it('should have contiguous 60-minute time intervals from 07:30 to 22:30', () => {
      expect(SLOTS.A.startTime).toBe('07:30');
      expect(SLOTS.O.endTime).toBe('22:30');

      for (let i = 0; i < SLOT_CODES.length - 1; i++) {
        const currentCode = SLOT_CODES[i]!;
        const nextCode = SLOT_CODES[i + 1]!;
        const currentSlot = SLOTS[currentCode];
        const nextSlot = SLOTS[nextCode];

        // Ensure next slot starts right when the current slot ends
        expect(nextSlot.startTime).toBe(currentSlot.endTime);
        expect(currentSlot.order + 1).toBe(nextSlot.order);
      }
    });

    it('should define correct booking duration limits', () => {
      expect(MIN_BOOKING_SKS).toBe(1);
      expect(MAX_BOOKING_SKS).toBe(4);
    });

    it('should validate slot codes accurately with isValidSlotCode (case-insensitive)', () => {
      expect(isValidSlotCode('A')).toBe(true);
      expect(isValidSlotCode('a')).toBe(true);
      expect(isValidSlotCode('O')).toBe(true);
      expect(isValidSlotCode('o')).toBe(true);
      expect(isValidSlotCode('DEF')).toBe(false);
      expect(isValidSlotCode('P')).toBe(false);
      expect(isValidSlotCode('')).toBe(false);
      expect(isValidSlotCode('123')).toBe(false);
    });

    it('should get slot info correctly with getSlotInfo', () => {
      const slotD = getSlotInfo('D');
      expect(slotD).toBeDefined();
      expect(slotD?.code).toBe('D');
      expect(slotD?.startTime).toBe('10:30');
      expect(slotD?.endTime).toBe('11:30');
      expect(slotD?.label).toBe('10:30 - 11:30');

      // Case-insensitive retrieval
      const slotDLower = getSlotInfo('d');
      expect(slotDLower).toEqual(slotD);

      // Non-existent slot
      expect(getSlotInfo('Z')).toBeUndefined();
    });
  });

  describe('Campus Rooms Constants', () => {
    it('should be frozen (immutable)', () => {
      expect(Object.isFrozen(ROOM_LIST)).toBe(true);
      expect(Object.isFrozen(ROOM_CODES)).toBe(true);
      expect(Object.isFrozen(ROOM_MAP)).toBe(true);
      expect(Object.isFrozen(ROOM_LIST[0])).toBe(true);
    });

    it('should register Gedung R.A. Kartini (RAK) rooms across floors 1 to 4 and Auditorium', () => {
      expect(ROOM_LIST.length).toBeGreaterThanOrEqual(27);
      expect(ROOM_CODES).toContain('RAK_1.1');
      expect(ROOM_CODES).toContain('RAK_4.1');
      expect(ROOM_CODES).toContain('AUDITORIUM');

      const rak41 = ROOM_MAP['RAK_4.1'];
      expect(rak41).toBeDefined();
      expect(rak41?.building).toBe('Gedung R.A. Kartini');
      expect(rak41?.floor).toBe(4);
      expect(rak41?.capacity).toBe(40);

      // Ruangan berakhiran .4 berkapasitas maksimal 17 orang
      const smallRooms = ['RAK_1.4', 'RAK_2.4', 'RAK_3.4', 'RAK_4.4', 'KHD_2.4', 'KHD_3.4', 'KHD_4.4'];
      for (const code of smallRooms) {
        expect(ROOM_MAP[code]?.capacity).toBe(17);
      }
    });

    it('should register Gedung Ki Hadjar Dewantara (KHD) rooms and Hybrid room correctly', () => {
      expect(ROOM_CODES).toContain('KHD_2.2');
      expect(ROOM_CODES).toContain('KHD_4.3');
      expect(ROOM_CODES).toContain('HYBRID');

      const khd22 = ROOM_MAP['KHD_2.2'];
      expect(khd22).toBeDefined();
      expect(khd22?.building).toBe('Gedung Ki Hadjar Dewantara');
      expect(khd22?.floor).toBe(2);
      expect(khd22?.capacity).toBe(40);

      const hybrid = ROOM_MAP['HYBRID'];
      expect(hybrid).toBeDefined();
      expect(hybrid?.name).toBe('Ruang Hybrid 1.2');
      expect(hybrid?.building).toBe('Gedung Ki Hadjar Dewantara');
      expect(hybrid?.floor).toBe(1);
      expect(hybrid?.capacity).toBe(25);
    });

    it('should validate room codes accurately with isValidRoomCode (case-insensitive)', () => {
      expect(isValidRoomCode('RAK_4.1')).toBe(true);
      expect(isValidRoomCode('rak_4.1')).toBe(true);
      expect(isValidRoomCode('KHD_2.2')).toBe(true);
      expect(isValidRoomCode('khd_3.4')).toBe(true);
      expect(isValidRoomCode('HYBRID')).toBe(true);
      expect(isValidRoomCode('hybrid')).toBe(true);
      expect(isValidRoomCode('AUDITORIUM')).toBe(true);
      expect(isValidRoomCode('auditorium')).toBe(true);
      expect(isValidRoomCode('ROOM_XYZ')).toBe(false);
      expect(isValidRoomCode('')).toBe(false);
    });

    it('should get room info correctly with getRoomInfo', () => {
      const room = getRoomInfo('RAK_4.1');
      expect(room).toBeDefined();
      expect(room?.code).toBe('RAK_4.1');
      expect(room?.name).toBe('Ruang 4.1');

      // Case-insensitive
      const roomLower = getRoomInfo('rak_4.1');
      expect(roomLower).toEqual(room);

      // Non-existent room
      expect(getRoomInfo('INVALID_ROOM')).toBeUndefined();
    });
  });
});
