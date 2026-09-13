import { z } from 'zod';
import { isValidWhatsAppJid, normalizeToWhatsAppJid } from '@/core/utils/jid.ts';

/**
 * Helper untuk mengekstrak deretan angka ID dari input angka atau string
 * Contoh: 12 -> [12], "12" -> [12], "#12" -> [12], "12, 13, 14" -> [12, 13, 14]
 */
function parseBookingIds(val: unknown): number[] {
  if (typeof val === 'number') {
    if (Number.isInteger(val) && val > 0) return [val];
    return [];
  }
  if (typeof val === 'string') {
    const matches = val.match(/\d+/g);
    if (!matches) return [];
    return matches.map(Number).filter((n) => Number.isInteger(n) && n > 0);
  }
  if (Array.isArray(val)) {
    return val
      .flatMap((item) => parseBookingIds(item))
      .filter((n) => Number.isInteger(n) && n > 0);
  }
  return [];
}

/**
 * Zod schema untuk validasi input perintah !abort force (Fase 5.6).
 */
export const abortForceInputSchema = z.object({
  id: z
    .unknown()
    .refine((val) => parseBookingIds(val).length > 0, {
      message:
        'ID booking wajib diisi dengan angka bulat positif (contoh: 12, #12, atau 12, 13).',
    })
    .transform((val) => parseBookingIds(val)),
  userJid: z
    .string()
    .trim()
    .min(1, 'Nomor WhatsApp atau JID staf/admin wajib diisi')
    .refine((val) => isValidWhatsAppJid(val), {
      message:
        'Format nomor WhatsApp tidak valid. Masukkan nomor telepon (contoh: 08123456789 atau 628123456789) atau JID (628xxx@s.whatsapp.net).',
    })
    .transform((val) => normalizeToWhatsAppJid(val)),
  autoDetectSession: z.boolean().default(true),
});

export type AbortForceInput = z.infer<typeof abortForceInputSchema>;
export type AbortForceRawInput = z.input<typeof abortForceInputSchema>;

/**
 * Zod schema untuk validasi input perintah !abort forceevent (Fase 5.6).
 */
export const abortForceEventInputSchema = z.object({
  eventId: z
    .unknown()
    .refine((val) => parseBookingIds(val).length > 0, {
      message:
        'ID agenda force event wajib diisi dengan angka bulat positif (contoh: 5 atau #5).',
    })
    .transform((val) => parseBookingIds(val)[0]!),
  userJid: z
    .string()
    .trim()
    .min(1, 'Nomor WhatsApp atau JID staf/admin wajib diisi')
    .refine((val) => isValidWhatsAppJid(val), {
      message:
        'Format nomor WhatsApp tidak valid. Masukkan nomor telepon (contoh: 08123456789 atau 628123456789) atau JID (628xxx@s.whatsapp.net).',
    })
    .transform((val) => normalizeToWhatsAppJid(val)),
});

export type AbortForceEventInput = z.infer<typeof abortForceEventInputSchema>;
export type AbortForceEventRawInput = z.input<typeof abortForceEventInputSchema>;
