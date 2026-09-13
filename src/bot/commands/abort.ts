import type { WASocket } from '@whiskeysockets/baileys';
import { dispatchRejection, dispatchSuccess } from '@/bot/responder.ts';
import type { CommandHandler, MessageContext } from '@/bot/types.ts';
import { ErrorCode, ValidationError } from '@/core/errors/index.ts';
import {
  abortForceBookingUseCase,
  abortForceEventUseCase,
} from '@/core/features/abort/index.ts';
import { logger } from '@/core/logger/index.ts';
import {
  formatAbortForceEventRestoredDm,
  formatAbortForceEventSuccessAnnouncement,
  formatAbortForceRestoredDm,
  formatAbortForceSuccessAnnouncement,
} from '@/core/templates/index.ts';

const log = logger.child({ module: 'COMMAND_ABORT' });

/**
 * Factory untuk membuat CommandHandler perintah `!abort` (Fase 5.6).
 *
 * Format penggunaan WhatsApp:
 * 1. Membatalkan force booking:
 *    `!abort force [id_booking]` (Contoh: `!abort force 15` atau `!abort force 15, 16`)
 * 2. Membatalkan force event:
 *    `!abort forceevent [id_event]` atau `!abort event [id_event]` (Contoh: `!abort forceevent 5`)
 *
 * Alur eksekusi:
 * 1. Validasi sintaks dasar parameter input.
 * 2. Eksekusi usecase terkait (otorisasi Staf/Admin, validasi domain, SQLite BEGIN IMMEDIATE).
 * 3. Jika gagal: perbarui reaksi emoji menjadi ❌ dan kirim notifikasi penolakan Japri/DM.
 * 4. Jika berhasil:
 *    - Beri reaksi ✅ pada pesan staf/admin pemanggil.
 *    - Kirim notifikasi DM ramah kepada Korti yang sebelumnya tergeser bahwa ruangan telah tersedia kembali.
 *    - Kirim pesan pengumuman resmi instan di grup/chat tempat perintah dipanggil.
 */
export function createAbortCommandHandler(): CommandHandler {
  return async (ctx: MessageContext, sock: WASocket): Promise<void> => {
    const args = ctx.parsedCommand.args;

    // 1. Validasi sintaks dasar jumlah parameter
    if (args.length === 0) {
      log.warn(`Perintah !abort ditolak karena argumen kosong dari ${ctx.senderJid}`);
      const syntaxError = new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Format perintah pembatalan tidak lengkap. Tentukan target dan ID yang ingin dibatalkan.',
        {
          args,
          hint: 'Gunakan format:\n• !abort force [id_booking] (Contoh: !abort force 15)\n• !abort forceevent [id_event] (Contoh: !abort forceevent 5)',
        }
      );
      await dispatchRejection(sock, ctx, syntaxError);
      return;
    }

    const firstArg = args[0]!.toLowerCase();

    // 2. Routing subperintah: 'force', 'forceevent'/'event', atau auto-detect jika diawali angka
    if (firstArg === 'force') {
      const rawIds = args.slice(1).join(' ');
      if (!rawIds.trim()) {
        const idMissingError = new ValidationError(
          ErrorCode.INVALID_COMMAND_SYNTAX,
          'ID pemesanan yang ingin dibatalkan wajib dicantumkan.',
          {
            hint: 'Contoh: !abort force 15 atau !abort force 15, 16',
          }
        );
        await dispatchRejection(sock, ctx, idMissingError);
        return;
      }

      // Eksekusi abortForceBookingUseCase
      const result = await abortForceBookingUseCase({
        id: rawIds,
        userJid: ctx.senderJid,
      });

      if (!result.success) {
        log.warn(`Abort force via WhatsApp gagal: ${result.error.userMessage}`, {
          sender: ctx.senderJid,
          args,
        });
        await dispatchRejection(sock, ctx, result.error);
        return;
      }

      const aborted = result.data;
      log.info(
        `Abort force berhasil diproses via WhatsApp: ${aborted.room.code} pada ${aborted.date.raw} (${aborted.slot.raw}) oleh ${aborted.user.nama}`
      );

      // Beri reaksi sukses ✅
      await dispatchSuccess(sock, ctx.messageKey);

      if (aborted.isDuplicate) {
        log.info(
          `Abort force duplikat idempoten terdeteksi untuk ${ctx.senderJid} pada ${aborted.room.code}; hanya merespons reaksi ✅.`
        );
        return;
      }

      // Kirim DM kepada masing-masing Korti yang sebelumnya tergeser
      if (aborted.displacedKorti.length > 0) {
        const displacedByJid = new Map<string, typeof aborted.displacedKorti[0]>();
        for (const displaced of aborted.displacedKorti) {
          if (!displacedByJid.has(displaced.userJid)) {
            displacedByJid.set(displaced.userJid, displaced);
          }
        }

        for (const [displacedJid, displacedInfo] of displacedByJid) {
          try {
            const dmText = formatAbortForceRestoredDm({
              recipientName: displacedInfo.userName,
              recipientClass: displacedInfo.userClass,
              roomCode: aborted.room.code,
              roomName: aborted.room.name,
              date: aborted.date.raw,
              slotCode: aborted.slot.raw,
              timeRange: aborted.slot.timeRange,
              staffName: aborted.user.nama,
            });

            await sock.sendMessage(displacedJid, { text: dmText });
            log.info(`Berhasil mengirim DM pemulihan slot ke ${displacedJid}`);
          } catch (dmErr) {
            log.error(`Gagal mengirim DM pemulihan slot ke ${displacedJid}`, dmErr);
          }
        }
      }

      // Kirim pesan pengumuman resmi di chat/grup pemanggil
      const announcementText = formatAbortForceSuccessAnnouncement({
        roomCode: aborted.room.code,
        roomName: aborted.room.name,
        date: aborted.date.raw,
        slotCode: aborted.slot.raw,
        timeRange: aborted.slot.timeRange,
        reason: aborted.reason,
        staffName: aborted.user.nama,
        bookingIds: aborted.bookings.map((b) => b.id),
        displacedRestoredCount: aborted.displacedKorti.length,
      });

      await sock.sendMessage(ctx.chatJid, { text: announcementText });
      return;
    }

    if (firstArg === 'forceevent' || firstArg === 'event') {
      const rawEventId = args.slice(1).join(' ');
      if (!rawEventId.trim()) {
        const idMissingError = new ValidationError(
          ErrorCode.INVALID_COMMAND_SYNTAX,
          'ID agenda pemblokiran yang ingin dibatalkan wajib dicantumkan.',
          {
            hint: 'Contoh: !abort forceevent 5',
          }
        );
        await dispatchRejection(sock, ctx, idMissingError);
        return;
      }

      // Eksekusi abortForceEventUseCase
      const result = await abortForceEventUseCase({
        eventId: rawEventId,
        userJid: ctx.senderJid,
      });

      if (!result.success) {
        log.warn(`Abort force event via WhatsApp gagal: ${result.error.userMessage}`, {
          sender: ctx.senderJid,
          args,
        });
        await dispatchRejection(sock, ctx, result.error);
        return;
      }

      const aborted = result.data;
      log.info(
        `Abort force event berhasil diproses via WhatsApp: "${aborted.eventName}" oleh ${aborted.user.nama}`
      );

      // Beri reaksi sukses ✅
      await dispatchSuccess(sock, ctx.messageKey);

      if (aborted.isDuplicate) {
        log.info(
          `Abort force event duplikat idempoten terdeteksi untuk ${ctx.senderJid}; hanya merespons reaksi ✅.`
        );
        return;
      }

      // Kirim DM ke korti yang terdampak agenda
      if (aborted.displacedKorti.length > 0) {
        const displacedByJid = new Map<string, typeof aborted.displacedKorti[0]>();
        for (const displaced of aborted.displacedKorti) {
          if (!displacedByJid.has(displaced.userJid)) {
            displacedByJid.set(displaced.userJid, displaced);
          }
        }

        for (const [displacedJid, displacedInfo] of displacedByJid) {
          try {
            const dmText = formatAbortForceEventRestoredDm({
              recipientName: displacedInfo.userName,
              recipientClass: displacedInfo.userClass,
              eventName: aborted.eventName,
              roomCodes: aborted.roomCodes,
              staffName: aborted.user.nama,
            });

            await sock.sendMessage(displacedJid, { text: dmText });
            log.info(`Berhasil mengirim DM pemulihan event ke ${displacedJid}`);
          } catch (dmErr) {
            log.error(`Gagal mengirim DM pemulihan event ke ${displacedJid}`, dmErr);
          }
        }
      }

      // Format rentang tanggal teks
      const dateRangeText =
        aborted.startDate === aborted.endDate
          ? aborted.startDate
          : `${aborted.startDate} s.d. ${aborted.endDate}`;

      // Kirim pengumuman resmi di chat/grup pemanggil
      const announcementText = formatAbortForceEventSuccessAnnouncement({
        eventName: aborted.eventName,
        roomCodes: aborted.roomCodes,
        dateRangeText,
        staffName: aborted.user.nama,
        eventIds: aborted.events.map((e) => e.id),
        displacedRestoredCount: aborted.displacedKorti.length,
      });

      await sock.sendMessage(ctx.chatJid, { text: announcementText });
      return;
    }

    // Default: jika argumen pertama adalah angka langsung (contoh: !abort 15), asumsikan abort force
    if (/^\d+/.test(firstArg)) {
      const rawIds = args.join(' ');
      const result = await abortForceBookingUseCase({
        id: rawIds,
        userJid: ctx.senderJid,
      });

      if (!result.success) {
        await dispatchRejection(sock, ctx, result.error);
        return;
      }

      const aborted = result.data;
      await dispatchSuccess(sock, ctx.messageKey);

      if (aborted.isDuplicate) return;

      if (aborted.displacedKorti.length > 0) {
        const displacedByJid = new Map<string, typeof aborted.displacedKorti[0]>();
        for (const displaced of aborted.displacedKorti) {
          if (!displacedByJid.has(displaced.userJid)) {
            displacedByJid.set(displaced.userJid, displaced);
          }
        }

        for (const [displacedJid, displacedInfo] of displacedByJid) {
          try {
            const dmText = formatAbortForceRestoredDm({
              recipientName: displacedInfo.userName,
              recipientClass: displacedInfo.userClass,
              roomCode: aborted.room.code,
              roomName: aborted.room.name,
              date: aborted.date.raw,
              slotCode: aborted.slot.raw,
              timeRange: aborted.slot.timeRange,
              staffName: aborted.user.nama,
            });
            await sock.sendMessage(displacedJid, { text: dmText });
          } catch (dmErr) {
            log.error(`Gagal mengirim DM pemulihan slot ke ${displacedJid}`, dmErr);
          }
        }
      }

      const announcementText = formatAbortForceSuccessAnnouncement({
        roomCode: aborted.room.code,
        roomName: aborted.room.name,
        date: aborted.date.raw,
        slotCode: aborted.slot.raw,
        timeRange: aborted.slot.timeRange,
        reason: aborted.reason,
        staffName: aborted.user.nama,
        bookingIds: aborted.bookings.map((b) => b.id),
        displacedRestoredCount: aborted.displacedKorti.length,
      });

      await sock.sendMessage(ctx.chatJid, { text: announcementText });
      return;
    }

    // Jika argumen tidak dikenali
    const unknownArgError = new ValidationError(
      ErrorCode.INVALID_COMMAND_SYNTAX,
      `Subperintah "!abort ${firstArg}" tidak dikenali.`,
      {
        args,
        hint: 'Gunakan format:\n• !abort force [id_booking]\n• !abort forceevent [id_event]',
      }
    );
    await dispatchRejection(sock, ctx, unknownArgError);
  };
}
