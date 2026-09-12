import type { RoomInfo } from '@/core/constants';
import type { Booking, User } from '@/core/db/schema.ts';
import type { DisplacedBooking } from '@/core/db/repositories/index.ts';
import type { ParsedDate, ParsedSlot } from '@/core/utils';
import type {
  ForceBookingInput,
  ForceBookingRawInput,
} from '@/core/validators/index.ts';

export type ForceBookingUseCaseInput = Partial<ForceBookingRawInput>;

export interface ForceBookingDetails {
  readonly room: RoomInfo;
  readonly date: ParsedDate;
  readonly slot: ParsedSlot;
  readonly user: User;
  readonly reason: string;
  readonly bookings: readonly Booking[];
  readonly displacedBookings: readonly DisplacedBooking[];
  readonly isDuplicate?: boolean;
}

export type ForceBookingUseCaseResult = ForceBookingDetails;

export type {
  ForceBookingInput,
  ForceBookingRawInput,
  DisplacedBooking,
};
