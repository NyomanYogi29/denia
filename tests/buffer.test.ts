import { describe, expect, it, mock } from 'bun:test';
import { BufferService, createBufferService } from '../src/core/services/buffer.ts';
import type { BatchBookingItem } from '../src/core/templates/index.ts';

describe('BufferService (Fase 4: Micro-Batch Buffer)', () => {
  it('should format single booking (N = 1) as one-liner upon flush', async () => {
    let sentGroupJid = '';
    let sentText = '';
    let sentItems: readonly BatchBookingItem[] = [];

    const service = createBufferService({
      windowMs: 50, // fast window for test
      getSocket: () => ({} as any),
      onFlush: async (groupJid, text, items) => {
        sentGroupJid = groupJid;
        sentText = text;
        sentItems = items;
      },
    });

    service.push({
      groupJid: '12036302@g.us',
      date: '10/09/2026',
      roomCode: 'RAK_2.1',
      slotCode: 'DEF',
      borrowerName: 'Nyoman Yogi',
      borrowerClass: '3DPS',
    });

    expect(service.getPendingCount('12036302@g.us')).toBe(1);

    // Tunggu window habis
    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(sentGroupJid).toBe('12036302@g.us');
    expect(sentItems.length).toBe(1);
    expect(sentText).toBe(
      '📌 Ruang *RAK_2.1* digunakan oleh *3DPS*, pada jam *10:30 - 13:20* untuk tanggal *10/09/2026*.'
    );
    expect(service.getPendingCount('12036302@g.us')).toBe(0);

    await service.destroy();
  });

  it('should format multiple bookings (N >= 2) into a compact list upon flush', async () => {
    let sentText = '';
    let sentItems: readonly BatchBookingItem[] = [];

    const service = createBufferService({
      windowMs: 50,
      getSocket: () => ({} as any),
      onFlush: async (_jid, text, items) => {
        sentText = text;
        sentItems = items;
      },
    });

    service.push({
      groupJid: '12036302@g.us',
      date: '10/09/2026',
      roomCode: 'RAK_2.1',
      slotCode: 'DEF',
      borrowerName: 'Nyoman Yogi',
      borrowerClass: '3DPS',
    });

    service.push({
      groupJid: '12036302@g.us',
      date: '10/09/2026',
      roomCode: 'KHD_HYBRID',
      slotCode: 'ABC',
      borrowerName: 'Gede Adi',
      borrowerClass: '5A',
    });

    expect(service.getPendingCount('12036302@g.us')).toBe(2);

    await new Promise((resolve) => setTimeout(resolve, 80));

    expect(sentItems.length).toBe(2);
    expect(sentText).toContain('📋 *Pemesanan Ruangan Terbaru:*');
    expect(sentText).toContain('1. Ruang *RAK_2.1* digunakan oleh *3DPS* (*10:30 - 13:20*, 10/09/2026)');
    expect(sentText).toContain('2. Ruang *KHD_HYBRID* digunakan oleh *5A* (*07:30 - 10:20*, 10/09/2026)');

    await service.destroy();
  });

  it('should isolate buffers per group JID', async () => {
    const service = createBufferService({
      windowMs: 1000, // jangan sampai auto flush
      getSocket: () => ({} as any),
    });

    service.push({
      groupJid: 'group_A@g.us',
      date: '10/09/2026',
      roomCode: 'RAK_1.1',
      slotCode: 'A',
      borrowerName: 'Budi',
      borrowerClass: '1A',
    });

    service.push({
      groupJid: 'group_B@g.us',
      date: '10/09/2026',
      roomCode: 'RAK_2.1',
      slotCode: 'B',
      borrowerName: 'Siti',
      borrowerClass: '3B',
    });

    expect(service.getPendingCount('group_A@g.us')).toBe(1);
    expect(service.getPendingCount('group_B@g.us')).toBe(1);
    expect(service.getActiveGroups()).toContain('group_A@g.us');
    expect(service.getActiveGroups()).toContain('group_B@g.us');

    await service.destroy();
  });

  it('should NOT drop items if socket is disconnected during flush, and retry', async () => {
    let socketOnline = false;
    let flushCallCount = 0;
    let deliveredText = '';

    const service = createBufferService({
      windowMs: 40,
      getSocket: () => (socketOnline ? ({} as any) : null),
      onFlush: async (_jid, text) => {
        flushCallCount++;
        deliveredText = text;
      },
    });

    service.push({
      groupJid: 'test_group@g.us',
      date: '10/09/2026',
      roomCode: 'RAK_2.1',
      slotCode: 'D',
      borrowerName: 'Yogi',
      borrowerClass: '3DPS',
    });

    // Window habis pertama kali saat socket offline
    await new Promise((resolve) => setTimeout(resolve, 60));

    // Data tidak boleh hilang dari buffer!
    expect(service.getPendingCount('test_group@g.us')).toBe(1);
    expect(flushCallCount).toBe(0);

    // Sekarang simulasikan socket tersambung kembali
    socketOnline = true;
    await service.flushAllPending();

    expect(flushCallCount).toBe(1);
    expect(service.getPendingCount('test_group@g.us')).toBe(0);
    expect(deliveredText).toContain('RAK_2.1');

    await service.destroy();
  });
});
