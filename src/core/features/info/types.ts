import type { AvailabilityMatrixData } from '@/core/templates/availability-matrix.ts';

export interface GetRoomAvailabilityInput {
  readonly date?: string;
  readonly roomCode?: string;
  readonly userJid?: string;
}

export interface GetRoomAvailabilityResult {
  readonly matrixData: AvailabilityMatrixData;
  readonly formattedMessage: string;
}
