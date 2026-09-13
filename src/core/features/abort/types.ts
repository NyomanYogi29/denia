import type { RoomInfo } from '@/core/constants/index.ts';
import type { Booking, ForceEvent, User } from '@/core/db/schema.ts';
import type { DisplacedBooking } from '@/core/db/repositories/index.ts';
import type { ParsedDate, ParsedSlot } from '@/core/utils/index.ts';

export interface AbortForceUseCaseInput {
  readonly id: number | string | number[];
  readonly userJid: string;
  readonly autoDetectSession?: boolean;
}

export interface AbortForceBookingDetails {
  readonly bookings: readonly Booking[];
  readonly room: RoomInfo;
  readonly date: ParsedDate;
  readonly slot: ParsedSlot;
  readonly user: User;
  readonly reason: string;
  readonly forcedByJid: string;
  readonly displacedKorti: readonly DisplacedBooking[];
  readonly isDuplicate: boolean;
}

export interface AbortForceEventUseCaseInput {
  readonly eventId: number | string;
  readonly userJid: string;
}

export interface AbortForceEventDetails {
  readonly events: readonly ForceEvent[];
  readonly eventName: string;
  readonly roomCodes: readonly string[];
  readonly startDate: string;
  readonly endDate: string;
  readonly user: User;
  readonly displacedKorti: readonly DisplacedBooking[];
  readonly isDuplicate: boolean;
}
