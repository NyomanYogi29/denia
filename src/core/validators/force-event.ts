import { z } from 'zod';
import { isValidWhatsAppJid, normalizeToWhatsAppJid } from '@/core/utils/jid.ts';

/**
 * Zod schema untuk validasi input perintah !forceevent (Fase 5.5).
 */
export const forceEventInputSchema = z.object({
  roomCodes: z
    .union([
      z.string().trim().min(1, 'Kode ruangan tidak boleh kosong'),
      z.array(z.string().trim().min(1)).min(1, 'Daftar kode ruangan tidak boleh kosong'),
    ])
    .transform((val) => {
      if (Array.isArray(val)) {
        return val.map((r) => r.trim().toUpperCase()).filter(Boolean);
      }
      return val
        .split(/[,+]/)
        .map((r) => r.trim().toUpperCase())
        .filter(Boolean);
    }),
  dateRange: z
    .string()
    .trim()
    .min(1, 'Rentang tanggal atau tanggal acara wajib diisi'),
  eventName: z
    .string()
    .trim()
    .min(3, 'Nama agenda/acara wajib dicantumkan (minimal 3 karakter)')
    .max(255, 'Nama acara maksimal 255 karakter'),
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

export type ForceEventInput = z.infer<typeof forceEventInputSchema>;
export type ForceEventRawInput = z.input<typeof forceEventInputSchema>;
