import { describe, expect, it } from 'bun:test';
import { ErrorCode, resolveError, SlotConflictError } from '../src/errors/index.ts';
import {
  formatBatchRecap,
  formatDirectErrorMessage,
  ReactionEmoji,
  type BatchBookingItem,
} from '../src/templates/index.ts';

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

    it('should format batch recap grouped by date with correct totals', () => {
      const bookings: BatchBookingItem[] = [
        {
          date: '10/09/2026',
          roomCode: 'RAK_4.1',
          slotCode: 'DEF',
          slotTime: '09:30 - 12:30',
          borrowerName: 'Gede Adi (Korti PTI 4A)',
        },
        {
          date: '10/09/2026',
          roomCode: 'LAB_KOMP_1',
          slotCode: 'ABC',
          borrowerName: 'Kadek Budi (Korti SI 2B)',
        },
        {
          date: '11/09/2026',
          roomCode: 'SEMINAR_A',
          slotCode: 'GHI',
          slotTime: '13:30 - 16:30',
          borrowerName: 'Komang Ayu (BEM FTK)',
        },
      ];

      const recap = formatBatchRecap({
        bookings,
        timestamp: '10/09/2026 10:00:00 WITA',
      });

      expect(recap).toContain('📋 *REKAP PEMESANAN RUANGAN SDP UNDIKSHA*');
      expect(recap).toContain('_Waktu Proses: 10/09/2026 10:00:00 WITA_');
      expect(recap).toContain('📅 *Tanggal: 10/09/2026*');
      expect(recap).toContain('📅 *Tanggal: 11/09/2026*');
      expect(recap).toContain('• 🏢 *RAK_4.1* | Slot *DEF* (09:30 - 12:30)');
      expect(recap).toContain('👤 Peminjam: Gede Adi (Korti PTI 4A)');
      expect(recap).toContain('• 🏢 *LAB_KOMP_1* | Slot *ABC*');
      expect(recap).toContain('• 🏢 *SEMINAR_A* | Slot *GHI* (13:30 - 16:30)');
      expect(recap).toContain('✅ *Total Transaksi Dikonfirmasi*: 3');
      expect(recap).toContain('!cekruangan [DD/MM/YYYY]');
    });
  });
});
