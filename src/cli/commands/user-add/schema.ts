import { z } from 'zod';
import { isValidWhatsAppJid, normalizeToWhatsAppJid } from '@/cli/utils';

/**
 * Zod schema untuk validasi input pendaftaran pengguna baru (user add)
 */
export const userAddInputSchema = z.object({
  jid: z
    .string()
    .trim()
    .min(1, 'Nomor WhatsApp atau JID wajib diisi')
    .refine((val) => isValidWhatsAppJid(val), {
      message:
        'Format nomor WhatsApp tidak valid. Masukkan nomor telepon (contoh: 08123456789 atau 628123456789) atau JID (628xxx@s.whatsapp.net).',
    })
    .transform((val) => normalizeToWhatsAppJid(val)),

  nama: z
    .string()
    .trim()
    .min(2, 'Nama minimal 2 karakter')
    .max(100, 'Nama maksimal 100 karakter'),

  nim: z
    .string()
    .trim()
    .min(3, 'NIM/NIP minimal 3 karakter')
    .max(30, 'NIM/NIP maksimal 30 karakter'),

  kelas: z
    .string()
    .trim()
    .min(2, 'Kelas/unit minimal 2 karakter (contoh: PTI 4A, Staf SDP)')
    .max(50, 'Kelas/unit maksimal 50 karakter'),

  role: z
    .enum(['korti', 'staff', 'admin'] as const)
    .default('korti'),
});

export type UserAddInput = z.infer<typeof userAddInputSchema>;
export type UserAddRawInput = z.input<typeof userAddInputSchema>;
