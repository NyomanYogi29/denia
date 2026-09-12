import type { RoomInfo } from '@/core/constants';
import type { Booking, User } from '@/core/db/schema.ts';
import type { ParsedDate, ParsedSlot } from '@/core/utils';
import type {
  CreateBookingInput,
  CreateBookingRawInput,
  CancelBookingInput,
  CancelBookingRawInput,
} from '@/core/validators';

export type CreateBookingUseCaseInput = Partial<CreateBookingRawInput>;

export interface BookedRoomDetails {
  readonly room: RoomInfo;
  readonly date: ParsedDate;
  readonly slot: ParsedSlot;
  readonly user: User;
  readonly bookings: readonly Booking[];
}

export type CreateBookingUseCaseResult = BookedRoomDetails;

export type CancelBookingUseCaseInput = Partial<CancelBookingRawInput>;

export interface CancelledBookingDetails {
  readonly room: RoomInfo;
  readonly date: ParsedDate;
  readonly slot: ParsedSlot;
  readonly user: User;
  readonly cancelledBookings: readonly Booking[];
  readonly isStaffOrAdmin: boolean;
}

export type CancelBookingUseCaseResult = CancelledBookingDetails;

export type {
  CreateBookingInput,
  CreateBookingRawInput,
  CancelBookingInput,
  CancelBookingRawInput,
};
