/**
 * Standarisasi emoji reaksi untuk status interaksi dan pemrosesan pesan WhatsApp.
 */
export const ReactionEmoji = Object.freeze({
  PROCESSING: '⏳',
  SUCCESS: '✅',
  FAILED: '❌',
} as const);

export type ReactionEmojiType = (typeof ReactionEmoji)[keyof typeof ReactionEmoji];
