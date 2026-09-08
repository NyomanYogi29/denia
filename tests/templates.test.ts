import { describe, expect, it } from 'bun:test';
import { ErrorCode, resolveError, SlotConflictError } from '../src/core/errors/index.ts';
import {
  formatBatchRecap,
  formatDirectErrorMessage,
  ReactionEmoji,
  type BatchBookingItem,
} from '../src/core/templates/index.ts';

describe('Templates Module', () => {
  describe('ReactionEmoji', () => {
    it('should have standard emoji constants and be immutable', () => {
      expect(ReactionEmoji.PROCESSING).toBe('⏳');
      expect(ReactionEmoji.SUCCESS).toBe('✅');
      expect(ReactionEmoji.FAILED).toBe('❌');
      expect(Object.isFrozen(ReactionEmoji)).toBe(true);
    });
  });

  describe('Direct Message Error Template', () => {
    it('should format direct error message with full details', () => {
      const conflictError = new SlotConflictError();
      const resolved = resolveError(conflictError);

      const message = formatDirectErrorMessage({
        error: resolved,
        command: '!pinjam RAK_4.1 10/09/2026 DEF',
        recipientName: 'Wayan Yoga',
      });

      expect(message).toContain('⚠️ *NOTIFIKASI SISTEM SDP UNDIKSHA* ⚠️');
      expect(message).toContain('Halo *Wayan Yoga*');
      expect(message).toContain('!pinjam RAK_4.1 10/09/2026 DEF');
      expect(message).toContain(resolved.userMessage);
      expect(message).toContain(resolved.suggestion);
      expect(message).toContain('Japri (DM)');
    });

    it('should format message with fallback greeting and without command if omitted', () => {
      const resolved = resolveError(new Error('Unknown problem'));

      const message = formatDirectErrorMessage({
        error: resolved,
      });

      expect(message).toContain('Halo,');
      expect(message).not.toContain('📌 *Perintah*:');
      expect(message).toContain(resolved.userMessage);
    });
  });

  describe('Batch Recap Template', () => {
    it('should return empty string when there are no bookings', () => {
      const result = formatBatchRecap({ bookings: [] });
      expect(result).toBe('');
    });

    it('should format single booking (N = 1) as a super compact one-liner', () => {
      const bookings: BatchBookingItem[] = [
        {
          date: '10/09/2026',
          roomCode: 'RAK_2.1',
          slotCode: 'DEF',
          timeRange: '10:30 - 13:20',
          borrowerName: 'Nyoman Yogi',
          borrowerClass: '3DPS',
        },
      ];

      const recap = formatBatchRecap({ bookings });

      expect(recap).toBe(
        '📌 Ruang *RAK_2.1* digunakan oleh *3DPS*, pada jam *10:30 - 13:20* untuk tanggal *10/09/2026*.'
      );
    });

    it('should format multiple bookings (N >= 2) as a compact numbered list', () => {
      const bookings: BatchBookingItem[] = [
        {
          date: '10/09/2026',
          roomCode: 'RAK_2.1',
          slotCode: 'DEF',
          timeRange: '10:30 - 13:20',
          borrowerName: 'Nyoman Yogi',
          borrowerClass: '3DPS',
        },
        {
          date: '10/09/2026',
          roomCode: 'KHD_HYBRID',
          slotCode: 'ABC',
          timeRange: '08:30 - 11:20',
          borrowerName: 'Gede Adi',
          borrowerClass: '5A',
        },
      ];

      const recap = formatBatchRecap({ bookings });

      expect(recap).toContain('📋 *Pemesanan Ruangan Terbaru:*');
      expect(recap).toContain('1. Ruang *RAK_2.1* digunakan oleh *3DPS* (*10:30 - 13:20*, 10/09/2026)');
      expect(recap).toContain('2. Ruang *KHD_HYBRID* digunakan oleh *5A* (*08:30 - 11:20*, 10/09/2026)');
    });
  });
});
