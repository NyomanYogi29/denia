export type FlushTarget = 'all' | 'user' | 'rooms' | 'force_events' | 'bookings';

export interface FlushCounts {
  readonly bookings?: number;
  readonly forceEvents?: number;
  readonly users?: number;
  readonly rooms?: number;
}

export interface FlushResult {
  readonly target: FlushTarget;
  readonly deletedCounts: FlushCounts;
}
