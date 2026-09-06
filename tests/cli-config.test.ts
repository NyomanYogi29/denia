import { describe, expect, it } from 'bun:test';
import {
  createRuntimeConfig,
  GLOBAL_FLAG_OPTIONS,
  loadRcConfig,
  parseGlobalFlags,
} from '@/cli/config';

describe('CLI Configuration Module', () => {
  it('should provide valid GLOBAL_FLAG_OPTIONS definition', () => {
    expect(GLOBAL_FLAG_OPTIONS).toBeDefined();
    expect(Object.isFrozen(GLOBAL_FLAG_OPTIONS)).toBe(true);
    expect(GLOBAL_FLAG_OPTIONS.verbose.type).toBe('boolean');
    expect(GLOBAL_FLAG_OPTIONS.quiet.type).toBe('boolean');
    expect(GLOBAL_FLAG_OPTIONS.json.type).toBe('boolean');
    expect(GLOBAL_FLAG_OPTIONS['no-color'].type).toBe('boolean');
    expect(GLOBAL_FLAG_OPTIONS.config.type).toBe('string');
  });

  it('should parse global flags with default values', () => {
    const flags = parseGlobalFlags({});

    expect(flags.verbose).toBe(false);
    expect(flags.quiet).toBe(false);
    expect(flags.json).toBe(false);
    expect(flags.noColor).toBe(false);
    expect(flags.configPath).toBeNull();
    expect(Object.isFrozen(flags)).toBe(true);
  });

  it('should parse global flags with custom values', () => {
    const flags = parseGlobalFlags({
      verbose: true,
      quiet: false,
      json: true,
      'no-color': true,
      config: 'custom/.deniarc.json',
    });

    expect(flags.verbose).toBe(true);
    expect(flags.quiet).toBe(false);
    expect(flags.json).toBe(true);
    expect(flags.noColor).toBe(true);
    expect(flags.configPath).toBe('custom/.deniarc.json');
  });

  it('should return empty RC config when no RC file is present', async () => {
    const res = await loadRcConfig();

    expect(res.success).toBe(true);
    if (res.success) {
      expect(res.data).toEqual({});
      expect(Object.isFrozen(res.data)).toBe(true);
    }
  });

  it('should return CliError when custom RC path does not exist', async () => {
    const res = await loadRcConfig('non_existent_path.json');

    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.userMessage).toContain('tidak ditemukan');
    }
  });

  it('should build immutable runtime configuration successfully', async () => {
    const res = await createRuntimeConfig({
      verbose: true,
      json: true,
    });

    expect(res.success).toBe(true);
    if (res.success) {
      const runtime = res.data;
      expect(runtime.isVerbose).toBe(true);
      expect(runtime.isJsonOutput).toBe(true);
      expect(runtime.isQuiet).toBe(false);
      expect(Object.isFrozen(runtime)).toBe(true);
      expect(Object.isFrozen(runtime.flags)).toBe(true);
    }
  });
});
