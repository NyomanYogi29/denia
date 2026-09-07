import { describe, expect, it } from 'bun:test';
import { executeFlushDb } from '@/cli/commands/flushdb';
import { db, rooms, users } from '@/core/db';
import {
  flushDatabase,
  normalizeFlushTarget,
} from '@/core/services/flush.service.ts';

describe('Danger Zone: FlushDB Module', () => {
  describe('normalizeFlushTarget', () => {
    it('should normalize valid target strings correctly', () => {
      expect(normalizeFlushTarget('all')).toBe('all');
      expect(normalizeFlushTarget('ALL')).toBe('all');
      expect(normalizeFlushTarget('user')).toBe('user');
      expect(normalizeFlushTarget('users')).toBe('user');
      expect(normalizeFlushTarget('rooms')).toBe('rooms');
      expect(normalizeFlushTarget('room')).toBe('rooms');
      expect(normalizeFlushTarget('force_events')).toBe('force_events');
      expect(normalizeFlushTarget('force-events')).toBe('force_events');
      expect(normalizeFlushTarget('forceevents')).toBe('force_events');
      expect(normalizeFlushTarget('force')).toBe('force_events');
      expect(normalizeFlushTarget('bookings')).toBe('bookings');
      expect(normalizeFlushTarget('booking')).toBe('bookings');
    });

    it('should return null for invalid target strings', () => {
      expect(normalizeFlushTarget('')).toBeNull();
      expect(normalizeFlushTarget('unknown_table')).toBeNull();
      expect(normalizeFlushTarget('drop_database')).toBeNull();
    });
  });

  describe('flushDatabase core service', () => {
    it('should flush user table and report deleted counts', async () => {
      // Insert temporary test user
      await db.insert(users).values({
        jid: '6289999999999@s.whatsapp.net',
        nama: 'Test Flush User',
        kelas: 'FLUSH_TEST',
        noTelp: '089999999999',
        role: 'korti',
      });

      const result = await flushDatabase('user');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.target).toBe('user');
        expect(result.data.deletedCounts.users).toBeGreaterThanOrEqual(1);
      }
    });

    it('should flush force_events without affecting rooms or users', async () => {
      const result = await flushDatabase('force_events');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.target).toBe('force_events');
        expect(typeof result.data.deletedCounts.forceEvents).toBe('number');
      }
    });
  });

  describe('executeFlushDb CLI handler', () => {
    it('should fail when target is missing', async () => {
      const result = await executeFlushDb({}, { isQuiet: true } as any);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Target flushdb wajib dicantumkan');
      }
    });

    it('should fail when target is invalid', async () => {
      const result = await executeFlushDb({}, { isQuiet: true } as any, 'invalid_target');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('tidak valid');
      }
    });

    it('should execute successfully with --force flag', async () => {
      const result = await executeFlushDb(
        { force: true },
        { isQuiet: true, isJsonOutput: false } as any,
        'user'
      );
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.target).toBe('user');
      }
    });
  });
});
