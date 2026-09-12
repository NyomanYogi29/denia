import { z } from 'zod';
import { isValidWhatsAppJid, normalizeToWhatsAppJid } from '@/core/utils/jid.ts';

/**
 * Zod schema untuk validasi input pendaftaran pengguna baru
 * Berlaku universal untuk CLI (`user add`) maupun Seeder Spreadsheet (`seeder.service.ts`).
 */
export const createUserInputSchema = z
  .object({
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

    fakultas: z
      .string()
      .trim()
      .max(50, 'Fakultas maksimal 50 karakter')
      .optional()
      .nullable(),

    prodi: z
      .string()
      .trim()
      .max(50, 'Prodi maksimal 50 karakter')
      .optional()
      .nullable(),

    semester: z
      .coerce
      .number()
      .int('Semester harus berupa bilangan bulat')
      .min(1, 'Semester minimal 1')
      .max(14, 'Semester maksimal 14')
      .optional()
      .nullable(),

    kelas: z
      .string()
      .trim()
      .min(1, 'Kelas/unit minimal 1 karakter (contoh: PTI 4A, 3DPS, Staf SDP)')
      .max(50, 'Kelas/unit maksimal 50 karakter'),

    noTelp: z
      .string()
      .trim()
      .optional()
      .nullable(),

    role: z
      .enum(['korti', 'staff', 'admin'] as const)
      .default('korti'),
  })
  .transform((data) => {
    // Jika noTelp tidak diisi eksplisit, ekstrak nomor numerik dari JID (misal 628123456789)
    const derivedPhone =
      data.noTelp?.trim() ||
      data.jid.split('@')[0]?.replace(/\D/g, '') ||
      '';

    return {
      ...data,
      noTelp: derivedPhone,
    };
  });

export type CreateUserInput = z.infer<typeof createUserInputSchema>;
export type CreateUserRawInput = z.input<typeof createUserInputSchema>;
