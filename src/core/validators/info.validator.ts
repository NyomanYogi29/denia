import { z } from 'zod';

/**
 * Zod schema untuk validasi input perintah informasi ketersediaan ruangan (!info / denia info).
 */
export const roomInfoInputSchema = z.object({
  date: z
    .string()
    .trim()
    .optional(),
  roomCode: z
    .string()
    .trim()
    .transform((val) => val.toUpperCase())
    .optional(),
});

export type RoomInfoInput = z.infer<typeof roomInfoInputSchema>;
export type RoomInfoRawInput = z.input<typeof roomInfoInputSchema>;
