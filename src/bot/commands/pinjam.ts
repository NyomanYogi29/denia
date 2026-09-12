import type { WASocket } from '@whiskeysockets/baileys';
import { dispatchRejection, dispatchSuccess } from '@/bot/responder.ts';
import type { CommandHandler, MessageContext } from '@/bot/types.ts';
import { ErrorCode, ValidationError } from '@/core/errors/index.ts';
import { createBookingUseCase } from '@/core/features/booking/index.ts';
import { logger } from '@/core/logger/index.ts';
import type { BufferService } from '@/core/services/buffer';

const log = logger.child({ module: 'COMMAND_PINJAM' });

export interface PinjamCommandOptions {
  readonly bufferService?: BufferService;
}

/**
 * Factory untuk membuat CommandHandler perintah `!pinjam` (Fase 5.1).
 *
 * Format penggunaan WhatsApp:
 * `!pinjam [kode_ruangan] [DD/MM/YYYY] [kode_slot]`
 * Contoh: `!pinjam RAK_2.1 15/10/2026 DEF`
 *
 * Alur eksekusi:
 * 1. Validasi kecukupan parameter input dari pesan WhatsApp.
 * 2. Eksekusi `createBookingUseCase` (Zod validation, JID auto-resolution, H-1 rule, slot continuity, SQLite BEGIN IMMEDIATE).
 * 3. Jika gagal: perbarui reaksi emoji menjadi ❌ dan kirim pesan penolakan Japri/DM edukatif.
 * 4. Jika berhasil: perbarui reaksi emoji menjadi ✅ dan masukkan ke Tumbling Window Buffer Service (jika tersedia).
 */
export function createPinjamCommandHandler(
  options: PinjamCommandOptions = {}
): CommandHandler {
  const { bufferService } = options;

  return async (ctx: MessageContext, sock: WASocket): Promise<void> => {
    const args = ctx.parsedCommand.args;

    // 1. Validasi sintaks dasar jumlah parameter
    if (args.length < 3) {
      log.warn(`Perintah !pinjam ditolak karena argumen kurang lengkap dari ${ctx.senderJid}`, {
        args,
      });
      const syntaxError = new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Format perintah peminjaman ruangan tidak lengkap.',
        {
          args,
          hint: 'Gunakan format: !pinjam [kode_ruangan] [DD/MM/YYYY] [kode_slot]\nContoh: !pinjam RAK_2.1 15/10/2026 DEF',
        }
      );
      await dispatchRejection(sock, ctx, syntaxError);
      return;
    }

    const [roomCode, date, slotCode, ...notesArr] = args;
    const notes = notesArr.length > 0 ? notesArr.join(' ') : undefined;

    // 2. Eksekusi core use case
    const bookingResult = await createBookingUseCase({
      roomCode,
      date,
      slotCode,
      userJid: ctx.senderJid,
      notes,
    });

    if (!bookingResult.success) {
      log.warn(`Peminjaman ruangan via WhatsApp gagal: ${bookingResult.error.userMessage}`, {
        sender: ctx.senderJid,
        args,
      });
      await dispatchRejection(sock, ctx, bookingResult.error);
      return;
    }

    const booked = bookingResult.data;
    log.info(
      `Peminjaman ruangan berhasil diproses via WhatsApp: ${booked.room.code} pada ${booked.date.raw} (${booked.slot.raw})`
    );

    // 3. Perbarui reaksi emoji sumber menjadi sukses (✅)
    await dispatchSuccess(sock, ctx.messageKey);

    // 4. Jika pemesanan ini adalah duplikat idempoten milik pengguna sendiri:
    // Cukup perbarui reaksi menjadi ✅ tanpa mengirim pesan baru dan tanpa memasukkan ulang ke buffer grup
    if (booked.isDuplicate) {
      log.info(
        `Pemesanan duplikat idempoten terdeteksi untuk ${ctx.senderJid} pada ruangan ${booked.room.code} (${booked.slot.raw}); hanya merespons reaksi ✅ tanpa pesan baru.`
      );
      return;
    }

    // 5. Masukkan ke micro-batch buffer service (30 detik tumbling window)
    if (bufferService) {
      bufferService.push({
        groupJid: ctx.chatJid,
        date: booked.date.raw,
        roomCode: booked.room.code,
        slotCode: booked.slot.raw,
        borrowerName: booked.user.nama,
        borrowerClass: booked.user.kelas,
        borrowerJid: booked.user.jid,
      });
      log.debug('Data pemesanan sukses dimasukkan ke Micro-Batch Buffer', {
        targetJid: ctx.chatJid,
        room: booked.room.code,
      });
    } else {
      log.debug('BufferService tidak disediakan; melewatkan buffering.');
    }
  };
}
