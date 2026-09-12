import { describe, expect, it } from 'bun:test';
import { findRoomByCode, listRooms } from '@/core/db/repositories/room.repository.ts';

describe('Room Repository (src/core/db/repositories/room.repository.ts)', () => {
  it('should find registered room by code case-insensitively', async () => {
    const result = await findRoomByCode('rak_2.1');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).not.toBeNull();
      expect(result.data?.code).toBe('RAK_2.1');
      expect(result.data?.building).toContain('Kartini');
      expect(result.data?.floor).toBe(2);
    }
  });

  it('should return null when room code is not found in database', async () => {
    const result = await findRoomByCode('NON_EXISTENT_ROOM_XYZ');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeNull();
    }
  });

  it('should list all rooms in database', async () => {
    const result = await listRooms();
    expect(result.success).toBe(true);
    if (result.success) {
      expect(Array.isArray(result.data)).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
    }
  });

  it('should filter rooms by building or floor', async () => {
    const result = await listRooms({ floor: 2 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data.every((r) => r.floor === 2)).toBe(true);
    }
  });
});
