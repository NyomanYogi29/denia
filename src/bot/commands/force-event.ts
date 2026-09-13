import type { WASocket } from '@whiskeysockets/baileys';
import { dispatchRejection, dispatchSuccess } from '@/bot/responder.ts';
import type { CommandHandler, MessageContext } from '@/bot/types.ts';
import { ErrorCode, ValidationError } from '@/core/errors/index.ts';
import { forceEventUseCase } from '@/core/features/force-event/index.ts';
import { logger } from '@/core/logger/index.ts';
import {
  formatForceEventDisplacedDm,
  formatForceEventSuccessAnnouncement,
  type DisplacedBookingItem,
} from '@/core/templates/index.ts';

const log = logger.child({ module: 'COMMAND_FORCE_EVENT' });

/**
 * Mem-parsing argumen teks untuk perintah !forceevent secara cerdas,
 * mendukung penulisan spasi setelah koma pada daftar ruangan maupun spasi di sekitar pemisah tanggal.
 */
function parseForceEventArgs(args: readonly string[]): {
  readonly roomCodesRaw: string;
  readonly dateRangeRaw: string;
  readonly eventName: string;
} | null {
  if (args.length < 3) {
    return null;
  }

  // Cari posisi token yang mengandung tanggal DD/MM/YYYY
  const dateRegex = /\d{2}\/\d{2}\/\d{4}/;
  const firstDateIdx = args.findIndex((arg) => dateRegex.test(arg));

  if (firstDateIdx <= 0) {
    // Jika tidak terdeteksi via regex posisi tengah, fallback ke urutan posisi dasar
    const [roomCodesRaw, dateRangeRaw, ...eventNameParts] = args;
    const eventName = eventNameParts.join(' ').trim();
    if (!roomCodesRaw || !dateRangeRaw || !eventName) return null;
    return { roomCodesRaw, dateRangeRaw, eventName };
  }

  // Segala token sebelum firstDateIdx adalah daftar ruangan
  const roomCodesRaw = args.slice(0, firstDateIdx).join(' ').trim();

  // Periksa apakah token tanggal bersambung (contoh: "15/10/2026", "-", "17/10/2026")
  let dateEndIdx = firstDateIdx;
  if (
    args[firstDateIdx + 1] === '-' ||
    args[firstDateIdx + 1]?.toLowerCase() === 's.d.' ||
    args[firstDateIdx + 1]?.toLowerCase() === 'sampai'
  ) {
    if (args[firstDateIdx + 2] && dateRegex.test(args[firstDateIdx + 2]!)) {
      dateEndIdx = firstDateIdx + 2;
    }
  }

  const dateRangeRaw = args.slice(firstDateIdx, dateEndIdx + 1).join('').trim();
  const eventName = args.slice(dateEndIdx + 1).join(' ').trim();

  if (!roomCodesRaw || !dateRangeRaw || !eventName) {
    return null;
  }

  return { roomCodesRaw, dateRangeRaw, eventName };
}

/**
 * Factory untuk membuat CommandHandler perintah `!forceevent` (Fase 5.5).
 *
 * Format penggunaan WhatsApp:
 * `!forceevent [list_ruangan] [DD/MM/YYYY-DD/MM/YYYY] [nama_acara]`
 * Contoh: `!forceevent RAK_1.1,RAK_2.1 15/10/2026-17/10/2026 Seminar Nasional Riset TI`
 *
 * Alur eksekusi:
 * 1. Validasi sintaks parameter input (minimal 3 elemen: list_ruangan, dateRange, eventName).
 * 2. Eksekusi `forceEventUseCase` (otorisasi Staf/Admin, validasi domain, SQLite BEGIN IMMEDIATE).
 * 3. Jika gagal: perbarui reaksi emoji menjadi ❌ dan kirim notifikasi penolakan Japri/DM.
 * 4. Jika berhasil:
 *    - Beri reaksi ✅ pada pesan staf/admin.
 *    - Kirim notifikasi peringatan otomatis via DM (Japri) ke setiap Korti yang tergeser (displaced).
 *    - Kirim pesan pengumuman resmi instan (unbuffered) di grup/chat tempat perintah dipanggil.
 */
export function createForceEventCommandHandler(): CommandHandler {
  return async (ctx: MessageContext, sock: WASocket): Promise<void> => {
    const args = ctx.parsedCommand.args;

    // 1. Validasi sintaks dasar jumlah parameter
    const parsedArgs = parseForceEventArgs(args);
    if (!parsedArgs) {
      log.warn(`Perintah !forceevent ditolak karena argumen tidak lengkap dari ${ctx.senderJid}`, {
        args,
      });
      const syntaxError = new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Format perintah agenda kampus tidak lengkap. Nama acara dan daftar ruangan wajib dicantumkan.',
        {
          args,
          hint: 'Gunakan format: !forceevent [list_ruangan] [DD/MM/YYYY-DD/MM/YYYY] [nama_acara]\nContoh: !forceevent RAK_1.1,RAK_2.1 15/10/2026-17/10/2026 Seminar Nasional Riset TI',
        }
      );
      await dispatchRejection(sock, ctx, syntaxError);
      return;
    }

    const { roomCodesRaw, dateRangeRaw, eventName } = parsedArgs;

    if (eventName.length < 3) {
      const nameError = new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Nama agenda acara wajib dicantumkan (minimal 3 karakter).',
        {
          args,
          hint: 'Contoh: !forceevent RAK_1.1 15/10/2026 Kuliah Perdana Pascasarjana',
        }
      );
      await dispatchRejection(sock, ctx, nameError);
      return;
    }

    // 2. Eksekusi core use case
    const eventResult = await forceEventUseCase({
      roomCodes: roomCodesRaw,
      dateRange: dateRangeRaw,
      eventName,
      userJid: ctx.senderJid,
    });

    if (!eventResult.success) {
      log.warn(`Force event via WhatsApp gagal: ${eventResult.error.userMessage}`, {
        sender: ctx.senderJid,
        args,
      });
      await dispatchRejection(sock, ctx, eventResult.error);
      return;
    }

    const details = eventResult.data;
    const roomCodeList = details.rooms.map((r) => r.code);

    log.info(
      `Force event berhasil diproses via WhatsApp: "${details.eventName}" untuk ${roomCodeList.join(', ')} (${details.dateRange.formattedRange}) oleh ${details.user.nama}`
    );

    // 3. Perbarui reaksi emoji sumber menjadi sukses (✅)
    await dispatchSuccess(sock, ctx.messageKey);

    // 4. Jika pemesanan ini adalah duplikat idempoten milik pemanggil sendiri:
    if (details.isDuplicate) {
      log.info(
        `Force event duplikat idempoten terdeteksi untuk ${ctx.senderJid}; hanya merespons reaksi ✅.`
      );
      return;
    }

    // 5. Kirim peringatan otomatis via DM ke masing-masing korti/user terdampak (displaced)
    if (details.displacedBookings.length > 0) {
      // Kelompokkan per JID peminjam terdampak
      const displacedByUser = new Map<
        string,
        {
          name?: string;
          kelas?: string;
          items: DisplacedBookingItem[];
        }
      >();

      for (const displaced of details.displacedBookings) {
        const existing = displacedByUser.get(displaced.userJid);
        const item: DisplacedBookingItem = {
          roomCode: displaced.roomCode,
          date: displaced.bookingDate,
          slotCode: displaced.slotCode,
        };

        if (existing) {
          existing.items.push(item);
        } else {
          displacedByUser.set(displaced.userJid, {
            name: displaced.userName,
            kelas: displaced.userClass,
            items: [item],
          });
        }
      }

      for (const [displacedJid, info] of displacedByUser) {
        try {
          const dmText = formatForceEventDisplacedDm({
            recipientName: info.name,
            recipientClass: info.kelas,
            eventName: details.eventName,
            staffName: details.user.nama,
            items: info.items,
          });

          await sock.sendMessage(displacedJid, { text: dmText });
          log.info(`Berhasil mengirim DM peringatan pembatalan agenda kampus ke ${displacedJid}`);
        } catch (dmErr) {
          log.error(`Gagal mengirim DM peringatan pembatalan agenda kampus ke ${displacedJid}`, dmErr);
        }
      }
    }

    // 6. Kirim pengumuman resmi instan (unbuffered) di chat/grup pemanggil
    const announcementText = formatForceEventSuccessAnnouncement({
      eventName: details.eventName,
      roomCodes: roomCodeList,
      dateRangeText: details.dateRange.formattedRange,
      staffName: details.user.nama,
      displacedCount: details.displacedBookings.length,
    });

    await sock.sendMessage(ctx.chatJid, { text: announcementText });
  };
}
