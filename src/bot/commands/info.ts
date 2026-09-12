import type { WASocket } from '@whiskeysockets/baileys';
import {
  dispatchDmSent,
  dispatchReaction,
  dispatchRejection,
  dispatchSuccess,
} from '@/bot/responder.ts';
import type { CommandHandler, MessageContext } from '@/bot/types.ts';
import { getRoomAvailabilityUseCase } from '@/core/features/info/index.ts';
import { logger } from '@/core/logger/index.ts';
import { ReactionEmoji } from '@/core/templates/index.ts';
import { DATE_REGEX, extractPhoneNumberFromJid } from '@/core/utils/index.ts';

const log = logger.child({ module: 'COMMAND_INFO' });

/**
 * Factory untuk membuat CommandHandler perintah `!info` (Fase 5.3 & Evaluasi E.4).
 *
 * Format penggunaan WhatsApp:
 * - `!info` (menampilkan ketersediaan seluruh ruangan hari ini)
 * - `!info [DD/MM/YYYY]` (menampilkan ketersediaan seluruh ruangan pada tanggal spesifik)
 * - `!info [kode_ruangan] [DD/MM/YYYY]` atau `!info [DD/MM/YYYY] [kode_ruangan]` (filter ruangan spesifik)
 *
 * Alur eksekusi:
 * 1. Parse argumen pesan secara fleksibel (tanggal dan/atau filter kode ruangan).
 * 2. Eksekusi `getRoomAvailabilityUseCase`.
 * 3. Jika gagal: perbarui reaksi emoji menjadi ❌ dan kirim notifikasi penolakan via Japri/DM.
 * 4. Jika berhasil:
 *    - Jika dari grup: kirim matriks lengkap ke DM pemohon (`ctx.senderJid`), beri reaksi 📩 pada pesan di grup (tanpa pesan teks balasan di grup).
 *    - Jika dari chat pribadi (DM): kirim langsung di chat tersebut dan beri reaksi ✅.
 *    - Jika pengiriman DM gagal: beri reaksi ❌ di pesan grup dan kirim peringatan 1 baris di grup.
 */
export function createInfoCommandHandler(): CommandHandler {
  return async (ctx: MessageContext, sock: WASocket): Promise<void> => {
    const args = ctx.parsedCommand.args;

    let dateInput: string | undefined;
    let roomCodeInput: string | undefined;

    if (args.length === 1) {
      const arg = args[0]!;
      const lower = arg.toLowerCase();
      if (
        DATE_REGEX.test(arg) ||
        lower === 'besok' ||
        lower === 'tomorrow' ||
        lower === 'today' ||
        lower === 'hari ini'
      ) {
        dateInput = arg;
      } else {
        // Jika bukan format tanggal murni, bisa berupa kode ruangan atau tanggal yang akan divalidasi
        // Periksa apakah ini kode ruangan atau tanggal
        if (arg.includes('/') || /^\d/.test(arg)) {
          dateInput = arg;
        } else {
          roomCodeInput = arg;
        }
      }
    } else if (args.length >= 2) {
      const [first, second] = args;
      const lowerFirst = first!.toLowerCase();
      const lowerSecond = second!.toLowerCase();
      if (
        DATE_REGEX.test(first!) ||
        first!.includes('/') ||
        lowerFirst === 'besok' ||
        lowerFirst === 'tomorrow' ||
        lowerFirst === 'today' ||
        lowerFirst === 'hari ini'
      ) {
        dateInput = first;
        roomCodeInput = second;
      } else {
        roomCodeInput = first;
        dateInput = second;
      }
    }

    log.debug(`Menjalankan perintah !info dari ${ctx.senderJid}`, {
      dateInput,
      roomCodeInput,
    });

    const availabilityResult = await getRoomAvailabilityUseCase({
      date: dateInput,
      roomCode: roomCodeInput,
      userJid: ctx.senderJid,
    });

    if (!availabilityResult.success) {
      log.warn(`Pemeriksaan ketersediaan ruangan via WhatsApp gagal: ${availabilityResult.error.userMessage}`, {
        sender: ctx.senderJid,
        args,
      });
      await dispatchRejection(sock, ctx, availabilityResult.error);
      return;
    }

    const { formattedMessage } = availabilityResult.data;

    // Jika dipanggil dari dalam grup WhatsApp, routing output matriks ke DM pribadi (Japri)
    if (ctx.isGroup) {
      try {
        await sock.sendMessage(ctx.senderJid, { text: formattedMessage });
        // Beri reaksi emoji 📩 di grup menandakan pesan terkirim ke inbox DM
        await dispatchDmSent(sock, ctx.messageKey);
        log.info(`Berhasil mengirim matriks info ke DM pribadi ${ctx.senderJid}`);
      } catch (dmError) {
        log.error(`Gagal mengirim matriks info ke DM pribadi ${ctx.senderJid}`, dmError);
        // Ubah reaksi menjadi ❌ di grup dan berikan notifikasi fallback
        await dispatchReaction(sock, ctx.messageKey, ReactionEmoji.FAILED);
        const phone = extractPhoneNumberFromJid(ctx.senderJid);
        const fallbackText = `⚠️ @${phone} Gagal mengirim matriks ketersediaan ke chat pribadi (DM) Anda. Pastikan bot tidak diblokir dan silakan kirim pesan ke nomor bot terlebih dahulu.`;
        await sock.sendMessage(ctx.chatJid, {
          text: fallbackText,
          mentions: [ctx.senderJid],
        });
      }
    } else {
      // Jika dipanggil di DM langsung, perbarui reaksi menjadi sukses (✅) dan kirim langsung di chat tersebut
      await dispatchSuccess(sock, ctx.messageKey);
      await sock.sendMessage(ctx.chatJid, { text: formattedMessage });
    }
  };
}
