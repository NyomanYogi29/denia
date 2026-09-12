import type { proto, WAMessage, WASocket } from '@whiskeysockets/baileys';
import { findUserByJid } from '@/core/db/repositories';
import { AppError, ErrorCode, ValidationError } from '@/core/errors';
import { logger } from '@/core/logger';
import { ReactionEmoji, type ReactionEmojiType } from '@/core/templates';
import { err, ok, type Result } from '@/core/types';
import {
  DEFAULT_COMMAND_PREFIX,
  extractSenderJid,
  isCommandMessage,
  normalizeToWhatsAppJid,
  parseCommand,
} from '@/core/utils';
import { checkRateLimit } from '@/core/middleware';
import type {
  BotClient,
  CommandHandler,
  MessageContext,
  MessageRouter,
  MessageRouterOptions,
} from './types.ts';

const log = logger.child({ module: 'MESSAGE_ROUTER' });

/**
 * Mengekstrak teks dari berbagai kemungkinan tipe payload pesan Baileys WAMessage
 */
export function extractMessageText(msg: WAMessage): string | null {
  const message = msg.message;
  if (!message) {
    return null;
  }

  return (
    message.conversation ??
    message.extendedTextMessage?.text ??
    message.imageMessage?.caption ??
    message.videoMessage?.caption ??
    message.documentMessage?.caption ??
    message.ephemeralMessage?.message?.conversation ??
    message.ephemeralMessage?.message?.extendedTextMessage?.text ??
    message.viewOnceMessage?.message?.conversation ??
    message.viewOnceMessage?.message?.extendedTextMessage?.text ??
    message.viewOnceMessageV2?.message?.conversation ??
    message.viewOnceMessageV2?.message?.extendedTextMessage?.text ??
    null
  );
}

/**
 * Mengirim reaksi emoji pada suatu pesan WhatsApp secara aman
 */
export async function sendReaction(
  sock: WASocket,
  key: proto.IMessageKey,
  emoji: ReactionEmojiType
): Promise<Result<void, AppError>> {
  try {
    const chatJid = key.remoteJid;
    if (!chatJid) {
      return err(
        new ValidationError(
          ErrorCode.INVALID_COMMAND_SYNTAX,
          'Tidak dapat mengirim reaksi emoji: chatJid / remoteJid tidak ditemukan.'
        )
      );
    }

    await sock.sendMessage(chatJid, {
      react: {
        text: emoji,
        key,
      },
    });

    log.debug('Berhasil mengirim reaksi emoji', { emoji, chatJid });
    return ok(undefined);
  } catch (error) {
    log.warn('Gagal mengirim reaksi emoji pada pesan WhatsApp', { error, key });
    const appErr =
      error instanceof AppError
        ? error
        : new AppError({
            code: ErrorCode.INTERNAL_ERROR,
            userMessage: 'Gagal mengirim reaksi emoji WhatsApp',
            cause: error,
          });
    return err(appErr);
  }
}

/**
 * Factory untuk membuat Message Router dengan filter prefix '!', ekstraksi JID, reaksi instan ⏳, dan auto-resolusi user
 */
export function createMessageRouter(
  options: MessageRouterOptions = {}
): MessageRouter {
  const prefix = options.prefix ?? DEFAULT_COMMAND_PREFIX;
  const autoReact = options.autoReact ?? true;
  const commandHandlers = new Map<string, CommandHandler>();

  const register = (command: string, handler: CommandHandler): MessageRouter => {
    const normalized = command.trim().toLowerCase();
    commandHandlers.set(normalized, handler);
    log.debug(`Handler untuk perintah "!${normalized}" berhasil didaftarkan`);
    return router;
  };

  const has = (command: string): boolean => {
    return commandHandlers.has(command.trim().toLowerCase());
  };

  const get = (command: string): CommandHandler | undefined => {
    return commandHandlers.get(command.trim().toLowerCase());
  };

  const handleMessage = async (
    msg: WAMessage,
    sock: WASocket
  ): Promise<Result<MessageContext | null, AppError>> => {
    try {
      // 1. Abaikan jika pesan kosong, dikirim oleh bot sendiri, atau tidak memiliki key
      if (!msg.message || msg.key.fromMe) {
        return ok(null);
      }

      // 2. Ekstraksi teks pesan
      const rawText = extractMessageText(msg);
      if (!rawText) {
        return ok(null);
      }

      // 3. Filter prefix perintah tanda seru (!) via utilitas core
      if (!isCommandMessage(rawText, prefix)) {
        return ok(null);
      }

      // 4. Ekstraksi otomatis WhatsApp JID pengirim (key.participant || key.remoteJid)
      let senderJid = extractSenderJid(msg.key);
      if (!senderJid) {
        log.warn('Pesan perintah diabaikan: gagal mengekstrak JID pengirim yang valid', {
          key: msg.key,
        });
        return ok(null);
      }

      // Jika JID pengirim berupa @lid (WhatsApp Privacy ID), resolve ke Phone Number JID via Baileys Signal lidMapping
      if (senderJid.endsWith('@lid')) {
        log.debug(`Mencoba me-resolve WhatsApp LID ${senderJid} ke Phone Number JID...`);
        try {
          const lidStore = (sock as any)?.signalRepository?.lidMapping;
          const pn = await lidStore?.getPNForLID(senderJid);
          if (pn) {
            senderJid = normalizeToWhatsAppJid(pn);
            log.info(`Berhasil me-resolve WhatsApp LID ke Phone Number: ${senderJid}`);
          } else {
            log.warn(`Gagal me-resolve WhatsApp LID ${senderJid} ke nomor telepon.`);
          }
        } catch (lidErr) {
          log.warn('Terjadi kesalahan saat lookup WhatsApp LID ke Baileys lidMapping', {
            error: lidErr,
          });
        }
      }

      // 5. Parsing struktur perintah (!<command> <args>)
      const parseResult = parseCommand(rawText, prefix);
      if (!parseResult.success) {
        log.warn('Gagal mem-parsing perintah pesan masuk', {
          error: parseResult.error,
        });
        return err(parseResult.error);
      }

      const parsedCommand = parseResult.data;
      const chatJid = msg.key.remoteJid ?? senderJid;
      const isGroup = chatJid.endsWith('@g.us');

      // 6. Kirim reaksi emoji instan ⏳ pada pesan yang sedang diproses
      if (autoReact) {
        await sendReaction(sock, msg.key, ReactionEmoji.PROCESSING);
      }

      // 7. Auto-resolution identitas pengguna dari tabel `users`
      log.info(`Memproses perintah "!${parsedCommand.command}" dari ${senderJid}...`);
      const userResult = await findUserByJid(senderJid);
      const user = userResult.success ? userResult.data : null;

      if (!user) {
        log.warn(`Pengirim "${senderJid}" belum terdaftar pada whitelist database users`);
      } else {
        log.debug(`Pengguna teridentifikasi: ${user.nama} (${user.kelas} - ${user.role})`);
      }

      // 8. Bentuk MessageContext
      const context: MessageContext = Object.freeze({
        rawMessage: msg,
        messageKey: msg.key,
        chatJid,
        isGroup,
        senderJid,
        rawText,
        parsedCommand,
        user,
      });

      // 9. Penanganan unauthorized user jika hook disediakan
      if (!user && options.onUnauthorizedUser) {
        await options.onUnauthorizedUser(context, sock);
      }

      // 10. Validasi Batas Laju (Rate Limiting) berbasis Redis (Bypass untuk Admin & Staf)
      const isStaffOrAdmin = user?.role === 'admin' || user?.role === 'staff';
      if (!isStaffOrAdmin) {
        const rateLimit = await checkRateLimit(senderJid);
        if (!rateLimit.allowed) {
          log.warn(`Perintah "!${parsedCommand.command}" ditolak karena melewati batas laju: ${senderJid}`, {
            senderJid,
            currentCount: rateLimit.currentCount,
            limit: rateLimit.limit,
            resetInSeconds: rateLimit.resetInSeconds,
          });

          // Tetap pasang reaksi PROCESSING (⏳) pada pesan sumber
          if (autoReact) {
            await sendReaction(sock, msg.key, ReactionEmoji.PROCESSING);
          }

          // Kirim notifikasi peringatan edukatif via DM / Japri ke pengirim
          const warningMessage =
            `⚠️ *Batas Pengiriman Perintah Tercapai*\n\n` +
            `Anda telah mencapai batas maksimum *${rateLimit.limit} perintah per menit*.\n` +
            `Silakan tunggu *${rateLimit.resetInSeconds} detik* sebelum mengirim perintah berikutnya.`;

          try {
            await sock.sendMessage(senderJid, { text: warningMessage });
          } catch (dmErr) {
            log.warn('Gagal mengirim pesan peringatan rate limit via DM', { error: dmErr });
          }

          return ok(context);
        }
      }

      // 11. Dispatching ke command handler yang terdaftar
      const handler = commandHandlers.get(parsedCommand.command);
      if (handler) {
        try {
          await handler(context, sock);
        } catch (handlerError) {
          const appErr =
            handlerError instanceof AppError
              ? handlerError
              : new AppError({
                  code: ErrorCode.INTERNAL_ERROR,
                  userMessage: `Terjadi kesalahan saat memproses perintah "!${parsedCommand.command}".`,
                  cause: handlerError,
                });
          log.error(`Gagal mengeksekusi handler untuk perintah "!${parsedCommand.command}"`, appErr);
          if (options.onError) {
            await options.onError(appErr, context, sock);
          }
          return err(appErr);
        }
      } else if (options.onUnknownCommand) {
        await options.onUnknownCommand(context, sock);
      }

      return ok(context);
    } catch (error) {
      log.error('Terjadi kesalahan tak terduga saat memproses pesan WhatsApp', error);
      const appErr =
        error instanceof AppError
          ? error
          : new AppError({
              code: ErrorCode.INTERNAL_ERROR,
              userMessage: 'Terjadi kesalahan sistem saat memproses pesan WhatsApp.',
              cause: error,
            });
      return err(appErr);
    }
  };

  const attachToClient = (client: BotClient): void => {
    client.on('messages.upsert', async ({ messages, type }) => {
      // Hanya proses pesan pemberitahuan real-time ('notify')
      if (type !== 'notify') {
        return;
      }

      const sock = client.getSocket();
      if (!sock) {
        log.warn('Menerima event messages.upsert tetapi socket belum tersedia.');
        return;
      }

      for (const msg of messages) {
        await handleMessage(msg, sock);
      }
    });

    log.info('Message router berhasil di-attach ke client event listener');
  };

  const router: MessageRouter = Object.freeze({
    register,
    has,
    get,
    handleMessage,
    attachToClient,
  });

  return router;
}
