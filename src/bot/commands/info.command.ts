import type { WASocket } from '@whiskeysockets/baileys';
import { dispatchRejection, dispatchSuccess } from '@/bot/responder.ts';
import type { CommandHandler, MessageContext } from '@/bot/types.ts';
import { getRoomAvailabilityUseCase } from '@/core/features/info/index.ts';
import { logger } from '@/core/logger/index.ts';
import { DATE_REGEX } from '@/core/utils/index.ts';

const log = logger.child({ module: 'COMMAND_INFO' });

/**
 * Factory untuk membuat CommandHandler perintah `!info` (Fase 5.3).
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
 * 4. Jika berhasil: perbarui reaksi emoji menjadi ✅ dan kirim matriks ketersediaan ruangan ke chat.
 */
export function createInfoCommandHandler(): CommandHandler {
  return async (ctx: MessageContext, sock: WASocket): Promise<void> => {
    const args = ctx.parsedCommand.args;

    let dateInput: string | undefined;
    let roomCodeInput: string | undefined;

    if (args.length === 1) {
      const arg = args[0]!;
      if (DATE_REGEX.test(arg)) {
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
      if (DATE_REGEX.test(first!) || first!.includes('/')) {
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

    // Perbarui reaksi emoji sumber menjadi sukses (✅)
    await dispatchSuccess(sock, ctx.messageKey);

    // Kirim matriks jadwal ke chat tempat perintah dipanggil
    await sock.sendMessage(ctx.chatJid, { text: formattedMessage });
  };
}
