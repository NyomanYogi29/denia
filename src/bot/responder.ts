import type { proto, WASocket } from '@whiskeysockets/baileys';
import { AppError, ErrorCode, resolveError, ValidationError } from '@/core/errors';
import { logger } from '@/core/logger';
import {
  formatDirectErrorMessage,
  ReactionEmoji,
  type ReactionEmojiType,
} from '@/core/templates';
import { err, ok, type Result } from '@/core/types';
import { normalizeToWhatsAppJid } from '@/core/utils';
import type {
  DirectErrorDispatchOptions,
  MessageContext,
  ResponseDispatcher,
} from './types.ts';

const log = logger.child({ module: 'RESPONSE_DISPATCHER' });

/**
 * Mengirim atau memperbarui reaksi emoji pada pesan WhatsApp tertentu secara aman
 */
export async function dispatchReaction(
  sock: WASocket,
  key: proto.IMessageKey,
  emoji: ReactionEmojiType
): Promise<Result<void, AppError>> {
  try {
    const chatJid = key.remoteJid;
    if (!chatJid) {
      const valErr = new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Tidak dapat mengirim reaksi emoji: remoteJid tidak ditemukan pada key pesan.'
      );
      log.warn(valErr.userMessage, { key });
      return err(valErr);
    }

    await sock.sendMessage(chatJid, {
      react: {
        text: emoji,
        key,
      },
    });

    log.debug('Berhasil memperbarui reaksi emoji pesan WhatsApp', { emoji, chatJid });
    return ok(undefined);
  } catch (error) {
    log.warn('Gagal memperbarui reaksi emoji pada pesan WhatsApp', { error, key, emoji });
    const appErr =
      error instanceof AppError
        ? error
        : new AppError({
            code: ErrorCode.INTERNAL_ERROR,
            userMessage: 'Gagal memperbarui reaksi emoji WhatsApp',
            cause: error,
          });
    return err(appErr);
  }
}

/**
 * Memperbarui reaksi emoji menjadi sukses (✅) pada pesan yang berhasil diproses atau masuk buffer
 */
export async function dispatchSuccess(
  sock: WASocket,
  key: proto.IMessageKey
): Promise<Result<void, AppError>> {
  return dispatchReaction(sock, key, ReactionEmoji.SUCCESS);
}

/**
 * Memperbarui reaksi emoji menjadi pesan terkirim ke DM (📩) pada pesan grup
 */
export async function dispatchDmSent(
  sock: WASocket,
  key: proto.IMessageKey
): Promise<Result<void, AppError>> {
  return dispatchReaction(sock, key, ReactionEmoji.DM_SENT);
}

/**
 * Mengirim pesan kesalahan / penolakan terformat langsung ke nomor pribadi pengirim (DM / Japri)
 */
export async function dispatchDirectError(
  sock: WASocket,
  recipientJid: string,
  options: DirectErrorDispatchOptions
): Promise<Result<void, AppError>> {
  try {
    let targetJid: string;
    try {
      targetJid = normalizeToWhatsAppJid(recipientJid);
    } catch {
      targetJid = recipientJid.trim();
    }

    // Resolusi error menjadi format terstruktur yang ramah pengguna
    const resolved = resolveError(options.error);

    // Format pesan DM edukatif
    const formattedMessage = formatDirectErrorMessage({
      error: resolved,
      command: options.command,
      recipientName: options.recipientName,
    });

    // Logging terpusat dengan log level yang sesuai dari ResolvedError
    if (resolved.logLevel === 'error') {
      log.error(`Mengirimkan pesan penolakan Japri (DM) ke ${targetJid}: ${resolved.userMessage}`, {
        code: resolved.code,
        command: options.command,
      });
    } else {
      log.warn(`Mengirimkan pesan penolakan Japri (DM) ke ${targetJid}: ${resolved.userMessage}`, {
        code: resolved.code,
        command: options.command,
      });
    }

    await sock.sendMessage(targetJid, {
      text: formattedMessage,
    });

    log.debug('Pesan Japri / DM berhasil dikirim ke pengirim', { targetJid });
    return ok(undefined);
  } catch (error) {
    log.error('Gagal mengirim pesan Japri / DM penolakan ke pengguna', error);
    const appErr =
      error instanceof AppError
        ? error
        : new AppError({
            code: ErrorCode.INTERNAL_ERROR,
            userMessage: 'Gagal mengirim pesan notifikasi Japri WhatsApp',
            cause: error,
          });
    return err(appErr);
  }
}

/**
 * Menangani alur penolakan perintah secara terpadu:
 * 1. Mengubah reaksi emoji pesan menjadi tanda silang (❌)
 * 2. Mengirimkan notifikasi Japri / DM solutif ke nomor pribadi pengirim
 */
export async function dispatchRejection(
  sock: WASocket,
  ctx: MessageContext,
  error: unknown
): Promise<Result<void, AppError>> {
  // 1. Perbarui reaksi emoji pada pesan sumber menjadi FAILED (❌)
  const reactResult = await dispatchReaction(sock, ctx.messageKey, ReactionEmoji.FAILED);
  if (!reactResult.success) {
    log.warn('Peringatan: Gagal memperbarui reaksi emoji penolakan', {
      error: reactResult.error,
    });
  }

  // 2. Kirim pesan notifikasi Japri / DM ke nomor pribadi pengirim
  const commandStr = ctx.parsedCommand
    ? `${ctx.parsedCommand.prefix}${ctx.parsedCommand.command}${
        ctx.parsedCommand.rawArgs ? ` ${ctx.parsedCommand.rawArgs}` : ''
      }`
    : undefined;

  const dmResult = await dispatchDirectError(sock, ctx.senderJid, {
    error,
    command: commandStr,
    recipientName: ctx.user?.nama,
  });

  return dmResult;
}

/**
 * Factory untuk membuat instance ResponseDispatcher terpusat
 */
export function createResponseDispatcher(): ResponseDispatcher {
  return Object.freeze({
    dispatchReaction,
    dispatchSuccess,
    dispatchRejection,
    dispatchDirectError,
  });
}
