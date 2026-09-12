import { describe, expect, it } from 'bun:test';
import { executeInfo, infoAction } from '@/cli/commands/info';

describe('CLI Info Command Consumer (Fase 5.3 - denia info / jadwal)', () => {
  it('should get availability via infoAction with default date in quiet mode', async () => {
    const result = await infoAction({}, { isQuiet: true });

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.matrixData.rooms.length).toBeGreaterThan(0);
    expect(result.data.formattedMessage).toContain('MATRIKS KETERSEDIAAN RUANGAN SDP UNDIKSHA');
  });

  it('should get availability with specific date and room filter', async () => {
    const result = await infoAction(
      {
        date: '20/12/2026',
        roomCode: 'RAK_2.1',
      },
      { isQuiet: true }
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.matrixData.rooms.length).toBe(1);
    expect(result.data.matrixData.rooms[0]!.room.code).toBe('RAK_2.1');
    expect(result.data.matrixData.date.raw).toBe('20/12/2026');
  });

  it('should support executeInfo with positional arguments', async () => {
    const result = await executeInfo(
      {},
      { isQuiet: true } as any,
      ['info', '20/12/2026', 'RAK_1.1']
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.matrixData.rooms.length).toBe(1);
    expect(result.data.matrixData.rooms[0]!.room.code).toBe('RAK_1.1');
    expect(result.data.matrixData.date.raw).toBe('20/12/2026');
  });

  it('should support executeInfo with flags', async () => {
    const result = await executeInfo(
      { date: '20/12/2026', room: 'KHD_2.2' },
      { isQuiet: true } as any,
      ['info']
    );

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.data.matrixData.rooms.length).toBe(1);
    expect(result.data.matrixData.rooms[0]!.room.code).toBe('KHD_2.2');
  });

  it('should return error on invalid date format', async () => {
    const result = await infoAction(
      { date: 'invalid-date' },
      { isQuiet: true }
    );

    expect(result.success).toBe(false);
    if (result.success) return;

    expect(result.error.code).toBe('INVALID_DATE_FORMAT');
  });
});
