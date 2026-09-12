import type { WASocket } from '@whiskeysockets/baileys';
import { dispatchRejection, dispatchSuccess } from '@/bot/responder.ts';
import type { CommandHandler, MessageContext } from '@/bot/types.ts';
import { ErrorCode, ValidationError } from '@/core/errors/index.ts';
import { cancelBookingUseCase } from '@/core/features/booking/index.ts';
import { logger } from '@/core/logger/index.ts';

const log = logger.child({ module: 'COMMAND_BATAL' });

/**
 * Factory untuk membuat CommandHandler perintah `!batal` (Fase 5.2).
 *
 * Format penggunaan WhatsApp:
 * `!batal [kode_ruangan] [DD/MM/YYYY] [kode_slot]`
 * Contoh: `!batal RAK_2.1 15/10/2026 DEF`
 *
 * Alur eksekusi:
 * 1. Validasi kecukupan parameter input dari pesan WhatsApp.
 * 2. Eksekusi `cancelBookingUseCase` (Zod validation, JID auto-resolution, validasi kepemilikan / role staf/admin, SQLite BEGIN IMMEDIATE).
 * 3. Jika gagal: perbarui reaksi emoji menjadi ❌ dan kirim notifikasi penolakan Japri/DM edukatif.
 * 4. Jika berhasil: perbarui reaksi emoji menjadi ✅ dan kirim pesan konfirmasi pembatalan.
 */
export function createBatalCommandHandler(): CommandHandler {
  return async (ctx: MessageContext, sock: WASocket): Promise<void> => {
    const args = ctx.parsedCommand.args;

    // 1. Validasi sintaks dasar jumlah parameter
    if (args.length < 3) {
      log.warn(`Perintah !batal ditolak karena argumen kurang lengkap dari ${ctx.senderJid}`, {
        args,
      });
      const syntaxError = new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Format perintah pembatalan ruangan tidak lengkap.',
        {
          args,
          hint: 'Gunakan format: !batal [kode_ruangan] [DD/MM/YYYY] [kode_slot]\nContoh: !batal RAK_2.1 15/10/2026 DEF',
        }
      );
      await dispatchRejection(sock, ctx, syntaxError);
      return;
    }

    const [roomCode, date, slotCode] = args;

    // 2. Eksekusi core use case
    const cancelResult = await cancelBookingUseCase({
      roomCode,
      date,
      slotCode,
      userJid: ctx.senderJid,
    });

    if (!cancelResult.success) {
      log.warn(`Pembatalan ruangan via WhatsApp gagal: ${cancelResult.error.userMessage}`, {
        sender: ctx.senderJid,
        args,
      });
      await dispatchRejection(sock, ctx, cancelResult.error);
      return;
    }

    const cancelled = cancelResult.data;
    log.info(
      `Pembatalan ruangan berhasil diproses via WhatsApp: ${cancelled.room.code} pada ${cancelled.date.raw} (${cancelled.slot.raw}) oleh ${cancelled.user.nama}`
    );

    // 3. Perbarui reaksi emoji sumber menjadi sukses (✅)
    await dispatchSuccess(sock, ctx.messageKey);

    // 4. Jika pembatalan ini adalah duplikat idempoten milik pengguna sendiri:
    // Cukup perbarui reaksi menjadi ✅ tanpa mengirim pesan chat pembatalan ulang
    if (cancelled.isDuplicate) {
      log.info(
        `Pembatalan duplikat idempoten terdeteksi untuk ${ctx.senderJid} pada ruangan ${cancelled.room.code} (${cancelled.slot.raw}); hanya merespons reaksi ✅ tanpa chat.`
      );
      return;
    }

    // 5. Kirim notifikasi konfirmasi pembatalan ke chat tempat perintah dikirim
    const roleNotice = cancelled.isStaffOrAdmin && cancelled.user.jid !== cancelled.cancelledBookings[0]?.userJid
      ? ` (dibatalkan oleh ${cancelled.user.role}: *${cancelled.user.nama}*)`
      : '';

    const messageText = `🗑️ *Peminjaman Ruangan Berhasil Dibatalkan*\n\n` +
      `Ruangan *${cancelled.room.code}* (${cancelled.room.name}) pada tanggal *${cancelled.date.raw}* untuk slot *${cancelled.slot.raw}* (${cancelled.slot.timeRange}) telah dibatalkan${roleNotice}.\n\n` +
      `Slot tersebut kini kembali tersedia untuk dipesan oleh kelas lain.`;

    await sock.sendMessage(ctx.chatJid, { text: messageText });
  };
}
