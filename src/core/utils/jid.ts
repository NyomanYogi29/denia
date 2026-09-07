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

  // Jika input adalah format WhatsApp LID, tolak karena bukan nomor telepon/PN
  if (trimmed.includes('@lid')) {
    throw new Error('Input adalah format WhatsApp LID, bukan nomor telepon.');
  }

  // Jika sudah memiliki suffix JID, ekstrak dan bersihkan bagian numeriknya
  if (trimmed.includes('@s.whatsapp.net')) {
    const [numPart] = trimmed.split('@');
    const userPart = (numPart ?? '').split(':')[0] ?? '';
    const cleaned = userPart.replace(/\D/g, '');
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
  const userPart = (numPart ?? '').split(':')[0] ?? '';
  return userPart.replace(/\D/g, '');
}

export interface MessageKeyLike {
  readonly remoteJid?: string | null;
  readonly participant?: string | null;
  readonly remoteJidAlt?: string | null;
  readonly participantAlt?: string | null;
  readonly fromMe?: boolean | null;
}

/**
 * Mengekstrak dan menormalisasi WhatsApp JID pengirim dari key pesan WhatsApp Baileys.
 *
 * Pada grup WhatsApp, pengirim berada di `key.participant` (atau `key.participantAlt`).
 * Pada chat pribadi (DM/Japri), pengirim berada di `key.remoteJid` (atau `key.remoteJidAlt`).
 * Mendukung ekstraksi Phone Number JID asli ketika WhatsApp menggunakan LID addressing mode (@lid).
 *
 * Contoh:
 * extractSenderJid({ remoteJid: '120363@g.us', participant: '628123456789:1@s.whatsapp.net' }) -> '628123456789@s.whatsapp.net'
 * extractSenderJid({ remoteJid: '255976091455538@lid', remoteJidAlt: '6285157580906@s.whatsapp.net' }) -> '6285157580906@s.whatsapp.net'
 */
export function extractSenderJid(key?: MessageKeyLike | null): string | null {
  if (!key || key.fromMe) {
    return null;
  }

  const isPnJid = (jid?: string | null): boolean =>
    typeof jid === 'string' && jid.includes('@s.whatsapp.net');

  let rawSender: string | null = null;

  // 1. Prioritaskan Phone Number JID (@s.whatsapp.net) baik dari primary maupun alt field
  if (isPnJid(key.participant)) {
    rawSender = key.participant!;
  } else if (isPnJid(key.participantAlt)) {
    rawSender = key.participantAlt!;
  } else if (isPnJid(key.remoteJidAlt)) {
    rawSender = key.remoteJidAlt!;
  } else if (isPnJid(key.remoteJid)) {
    rawSender = key.remoteJid!;
  } else {
    // 2. Fallback: ambil participant (grup) atau remoteJid (DM)
    rawSender = key.participant || key.remoteJid || null;
  }

  if (!rawSender || rawSender.endsWith('@g.us')) {
    return null;
  }

  try {
    return normalizeToWhatsAppJid(rawSender);
  } catch {
    // Jika format @lid, kembalikan string @lid agar caller dapat me-resolve asinkron via Baileys Signal lidMapping
    if (rawSender.endsWith('@lid')) {
      return rawSender.trim();
    }
    return null;
  }
}
