import { describe, expect, it } from 'bun:test';
import { config } from '@/config';

describe('Configuration Module', () => {
  it('should load config correctly and be frozen (immutable)', () => {
    expect(config).toBeDefined();
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.app)).toBe(true);
    expect(Object.isFrozen(config.db)).toBe(true);
    expect(Object.isFrozen(config.whatsapp)).toBe(true);
    expect(Object.isFrozen(config.google)).toBe(true);
  });

  it('should have valid database file name configured', () => {
    expect(config.db.fileName).toBeDefined();
    expect(typeof config.db.fileName).toBe('string');
  });

  it('should have valid whatsapp configuration', () => {
    expect(config.whatsapp.groupJid).toBeDefined();
    expect(Array.isArray(config.whatsapp.adminJids)).toBe(true);
    expect(config.whatsapp.adminJids.length).toBeGreaterThan(0);
  });

  it('should have valid google sheets configuration', () => {
    expect(config.google.sheetId).toBeDefined();
    expect(typeof config.google.sheetId).toBe('string');
  });
});
