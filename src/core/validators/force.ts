import { z } from 'zod';
import { isValidWhatsAppJid, normalizeToWhatsAppJid } from '@/core/utils/jid.ts';

/**
 * Zod schema untuk validasi input perintah !force (Fase 5.4).
 */
export const forceBookingInputSchema = z.object({
  roomCode: z
    .string()
    .trim()
    .min(1, 'Kode ruangan wajib diisi')
    .transform((val) => val.toUpperCase()),
  date: z
    .string()
    .trim()
    .min(1, 'Tanggal peminjaman wajib diisi'),
  slotCode: z
    .string()
    .trim()
    .min(1, 'Kode slot wajib diisi')
    .transform((val) => val.toUpperCase()),
  userJid: z
    .string()
    .trim()
    .min(1, 'Nomor WhatsApp atau JID staf/admin wajib diisi')
    .refine((val) => isValidWhatsAppJid(val), {
      message:
        'Format nomor WhatsApp tidak valid. Masukkan nomor telepon (contoh: 08123456789 atau 628123456789) atau JID (628xxx@s.whatsapp.net).',
    })
    .transform((val) => normalizeToWhatsAppJid(val)),
  reason: z
    .string()
    .trim()
    .min(3, 'Alasan pengambilalihan ruangan wajib dicantumkan (minimal 3 karakter)')
    .max(255, 'Alasan maksimal 255 karakter'),
});

export type ForceBookingInput = z.infer<typeof forceBookingInputSchema>;
export type ForceBookingRawInput = z.input<typeof forceBookingInputSchema>;
