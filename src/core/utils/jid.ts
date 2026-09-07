/**
 * Core WhatsApp JID Utilities
 * Digunakan secara universal oleh Baileys Bot Adapter, Seeder Spreadsheet, dan CLI.
 */

/**
 * Normalisasi nomor telepon lokal/internasional menjadi WhatsApp JID standar
 * Contoh:
 * - "08123456789" -> "628123456789@s.whatsapp.net"
 * - "+62 812-3456-789" -> "628123456789@s.whatsapp.net"
 * - "628123456789@s.whatsapp.net" -> "628123456789@s.whatsapp.net"
 */
export function normalizeToWhatsAppJid(input: string): string {
  const trimmed = input.trim();

  // Jika sudah memiliki suffix JID, ekstrak dan bersihkan bagian numeriknya
  if (trimmed.includes('@s.whatsapp.net')) {
    const [numPart] = trimmed.split('@');
    const cleaned = (numPart ?? '').replace(/\D/g, '');
    if (cleaned.length < 10 || cleaned.length > 16) {
      throw new Error('Panjang nomor JID harus antara 10 hingga 16 digit.');
    }
    return `${cleaned}@s.whatsapp.net`;
  }

  let cleaned = trimmed.replace(/\D/g, '');

  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.slice(1);
  } else if (!cleaned.startsWith('62')) {
    if (cleaned.startsWith('8')) {
      cleaned = '62' + cleaned;
    }
  }

  if (cleaned.length < 10 || cleaned.length > 16) {
    throw new Error('Nomor telepon harus terdiri dari 10 sampai 16 digit angka.');
  }

  return `${cleaned}@s.whatsapp.net`;
}

/**
 * Memvalidasi apakah string merupakan nomor WhatsApp atau JID yang valid
 */
export function isValidWhatsAppJid(input: string): boolean {
  try {
    normalizeToWhatsAppJid(input);
    return true;
  } catch {
    return false;
  }
}

/**
 * Mengekstrak nomor telepon murni dari string WhatsApp JID atau nomor telepon
 * Contoh: "628123456789@s.whatsapp.net" -> "628123456789"
 */
export function extractPhoneNumberFromJid(jid: string): string {
  const [numPart] = jid.trim().split('@');
  return (numPart ?? '').replace(/\D/g, '');
}
