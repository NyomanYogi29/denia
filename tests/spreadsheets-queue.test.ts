import { describe, expect, it, beforeEach } from 'bun:test';
import {
  enqueueCellUpdates,
  getPendingQueueSize,
  clearPendingQueue,
} from '../src/spreadsheets/queue.ts';

describe('Spreadsheets Queue Module', () => {
  beforeEach(() => {
    clearPendingQueue();
  });

  it('should coalesce duplicate updates to the same cell', () => {
    enqueueCellUpdates([
      { tab: 'SENIN', cellA1: 'F10', value: 'Old Value' },
      { tab: 'SENIN', cellA1: 'G10', value: 'Slot E' },
      { tab: 'SENIN', cellA1: 'F10', value: 'New Overwritten Value' },
    ]);

    // F10 is duplicate, so unique pending keys should be 2
    expect(getPendingQueueSize()).toBe(2);
  });
});
