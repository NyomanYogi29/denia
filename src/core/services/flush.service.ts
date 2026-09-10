import {
  flushDatabaseUseCase,
  normalizeFlushTarget,
  type FlushCounts,
  type FlushResult,
  type FlushTarget,
} from '@/core/features/maintenance/index.ts';

export { normalizeFlushTarget, flushDatabaseUseCase as flushDatabase };
export type { FlushCounts, FlushResult, FlushTarget };
