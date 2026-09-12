import type { RoomInfo } from '@/core/constants';
import type { Booking, User } from '@/core/db/schema.ts';
import type { ParsedDate, ParsedSlot } from '@/core/utils';
import type { CreateBookingInput, CreateBookingRawInput } from '@/core/validators';

export type CreateBookingUseCaseInput = Partial<CreateBookingRawInput>;

export interface BookedRoomDetails {
  readonly room: RoomInfo;
  readonly date: ParsedDate;
  readonly slot: ParsedSlot;
  readonly user: User;
  readonly bookings: readonly Booking[];
}

export type CreateBookingUseCaseResult = BookedRoomDetails;

export type { CreateBookingInput, CreateBookingRawInput };
