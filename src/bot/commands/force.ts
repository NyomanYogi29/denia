import type { WASocket } from '@whiskeysockets/baileys';
import { dispatchRejection, dispatchSuccess } from '@/bot/responder.ts';
import type { CommandHandler, MessageContext } from '@/bot/types.ts';
import { ErrorCode, ValidationError } from '@/core/errors/index.ts';
import { forceBookingUseCase } from '@/core/features/force/index.ts';
import { logger } from '@/core/logger/index.ts';
import {
  formatForceDisplacedDm,
  formatForceSuccessAnnouncement,
} from '@/core/templates/index.ts';

const log = logger.child({ module: 'COMMAND_FORCE' });

/**
 * Factory untuk membuat CommandHandler perintah `!force` (Fase 5.4).
 *
 * Format penggunaan WhatsApp:
 * `!force [kode_ruangan] [DD/MM/YYYY] [kode_slot] [alasan]`
 * Contoh: `!force RAK_2.1 15/10/2026 DEF Ujian Sidang Skripsi Mendadak`
 *
 * Alur eksekusi:
 * 1. Validasi sintaks parameter input (minimal 4 argumen: roomCode, date, slotCode, reason).
 * 2. Eksekusi `forceBookingUseCase` (otorisasi Staf/Admin, validasi domain, SQLite BEGIN IMMEDIATE).
 * 3. Jika gagal: perbarui reaksi emoji menjadi ❌ dan kirim notifikasi penolakan Japri/DM.
 * 4. Jika berhasil:
 *    - Beri reaksi ✅ pada pesan staf/admin.
 *    - Kirim notifikasi peringatan otomatis via DM (Japri) ke setiap Korti yang tergeser (displaced).
 *    - Kirim pesan pengumuman resmi instan (unbuffered) di grup/chat tempat perintah dipanggil.
 */
export function createForceCommandHandler(): CommandHandler {
  return async (ctx: MessageContext, sock: WASocket): Promise<void> => {
    const args = ctx.parsedCommand.args;

    // 1. Validasi sintaks dasar jumlah parameter (minimal 4 elemen: roomCode, date, slotCode, reason)
    if (args.length < 4) {
      log.warn(`Perintah !force ditolak karena argumen kurang lengkap dari ${ctx.senderJid}`, {
        args,
      });
      const syntaxError = new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Format perintah pengambilalihan ruangan tidak lengkap. Alasan wajib dicantumkan.',
        {
          args,
          hint: 'Gunakan format: !force [kode_ruangan] [DD/MM/YYYY] [kode_slot] [alasan]\nContoh: !force RAK_2.1 15/10/2026 DEF Ujian Sidang Skripsi Mendadak',
        }
      );
      await dispatchRejection(sock, ctx, syntaxError);
      return;
    }

    const [roomCode, date, slotCode, ...reasonParts] = args;
    const reason = reasonParts.join(' ').trim();

    if (!reason || reason.length < 3) {
      const reasonError = new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Alasan pengambilalihan ruangan wajib dicantumkan (minimal 3 karakter).',
        {
          args,
          hint: 'Contoh: !force RAK_2.1 15/10/2026 DEF Kuliah Pengganti Dosen Tamu',
        }
      );
      await dispatchRejection(sock, ctx, reasonError);
      return;
    }

    // 2. Eksekusi core use case
    const forceResult = await forceBookingUseCase({
      roomCode,
      date,
      slotCode,
      userJid: ctx.senderJid,
      reason,
    });

    if (!forceResult.success) {
      log.warn(`Force booking via WhatsApp gagal: ${forceResult.error.userMessage}`, {
        sender: ctx.senderJid,
        args,
      });
      await dispatchRejection(sock, ctx, forceResult.error);
      return;
    }

    const forced = forceResult.data;
    log.info(
      `Force booking berhasil diproses via WhatsApp: ${forced.room.code} pada ${forced.date.raw} (${forced.slot.raw}) oleh ${forced.user.nama}`
    );

    // 3. Perbarui reaksi emoji sumber menjadi sukses (✅)
    await dispatchSuccess(sock, ctx.messageKey);

    // 4. Jika pemesanan ini adalah duplikat idempoten milik pemanggil sendiri:
    if (forced.isDuplicate) {
      log.info(
        `Force booking duplikat idempoten terdeteksi untuk ${ctx.senderJid} pada ${forced.room.code}; hanya merespons reaksi ✅.`
      );
      return;
    }

    // 5. Kirim peringatan otomatis via DM ke korti terdampak (displaced)
    if (forced.displacedBookings.length > 0) {
      // Kelompokkan per JID peminjam terdampak agar tidak mengirim pesan ganda jika memesan banyak slot
      const displacedByJid = new Map<string, typeof forced.displacedBookings[0]>();
      for (const displaced of forced.displacedBookings) {
        if (!displacedByJid.has(displaced.userJid)) {
          displacedByJid.set(displaced.userJid, displaced);
        }
      }

      for (const [displacedJid, displacedInfo] of displacedByJid) {
        try {
          const dmText = formatForceDisplacedDm({
            recipientName: displacedInfo.userName,
            recipientClass: displacedInfo.userClass,
            roomCode: forced.room.code,
            roomName: forced.room.name,
            date: forced.date.raw,
            slotCode: forced.slot.raw,
            timeRange: forced.slot.timeRange,
            reason: forced.reason,
            staffName: forced.user.nama,
          });

          await sock.sendMessage(displacedJid, { text: dmText });
          log.info(`Berhasil mengirim DM peringatan penggusuran slot ke ${displacedJid}`);
        } catch (dmErr) {
          log.error(`Gagal mengirim DM peringatan penggusuran slot ke ${displacedJid}`, dmErr);
        }
      }
    }

    // 6. Kirim pengumuman resmi instan (unbuffered) di chat/grup pemanggil
    const announcementText = formatForceSuccessAnnouncement({
      roomCode: forced.room.code,
      roomName: forced.room.name,
      date: forced.date.raw,
      slotCode: forced.slot.raw,
      timeRange: forced.slot.timeRange,
      reason: forced.reason,
      staffName: forced.user.nama,
      displacedCount: forced.displacedBookings.length,
      bookingIds: forced.bookings.map((b) => b.id),
    });

    await sock.sendMessage(ctx.chatJid, { text: announcementText });
  };
}
