import { describe, expect, it } from 'bun:test';
import { AppLogger, logger } from '../src/logger/index.ts';

describe('Logger Module', () => {
  it('should instantiate AppLogger correctly', () => {
    expect(logger).toBeInstanceOf(AppLogger);
  });

  it('should create child logger with custom context', () => {
    const childLog = logger.child({ module: 'TEST_MODULE', action: 'RUN_TEST' });
    expect(childLog).toBeInstanceOf(AppLogger);
  });

  it('should execute log methods without throwing errors', () => {
    const log = logger.child({ module: 'UNIT_TEST' });
    expect(() => log.info('Unit test info message')).not.toThrow();
    expect(() => log.success('Unit test success message', { id: 1 })).not.toThrow();
    expect(() => log.warn('Unit test warn message')).not.toThrow();
    expect(() => log.debug('Unit test debug message')).not.toThrow();
    expect(() => log.error('Unit test error message', new Error('Test error'))).not.toThrow();
  });
});
