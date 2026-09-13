import type { RoomInfo } from '@/core/constants';
import type { ForceEvent, User } from '@/core/db/schema.ts';
import type { DisplacedEventBooking } from '@/core/db/repositories/index.ts';
import type { ParsedDateRange } from '@/core/utils';
import type {
  ForceEventInput,
  ForceEventRawInput,
} from '@/core/validators/index.ts';

export type ForceEventUseCaseInput = Partial<ForceEventRawInput>;

export interface ForceEventDetails {
  readonly rooms: readonly RoomInfo[];
  readonly dateRange: ParsedDateRange;
  readonly user: User;
  readonly eventName: string;
  readonly events: readonly ForceEvent[];
  readonly displacedBookings: readonly DisplacedEventBooking[];
  readonly isDuplicate?: boolean;
}

export type ForceEventUseCaseResult = ForceEventDetails;

export type {
  ForceEventInput,
  ForceEventRawInput,
  DisplacedEventBooking,
};
