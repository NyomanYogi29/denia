import type { WASocket } from '@whiskeysockets/baileys';
import { dispatchSuccess } from '@/bot/responder.ts';
import type { CommandHandler, MessageContext } from '@/bot/types.ts';
import { logger } from '@/core/logger/index.ts';
import { formatHelpMessage } from '@/core/templates/index.ts';

const log = logger.child({ module: 'COMMAND_HELP' });

/**
 * Factory untuk membuat CommandHandler perintah `!help` (atau alias `!panduan`, `!bantuan`, `!menu`).
 *
 * Format penggunaan WhatsApp:
 * - `!help` (menampilkan ringkasan seluruh perintah bot)
 * - `!help [perintah]` (menampilkan panduan spesifik perintah tertentu, misal: `!help pinjam`)
 */
export function createHelpCommandHandler(): CommandHandler {
  return async (ctx: MessageContext, sock: WASocket): Promise<void> => {
    const targetCommand = ctx.parsedCommand.args[0]?.trim();

    log.info(`Menampilkan panduan command help untuk ${ctx.senderJid}`, {
      targetCommand: targetCommand || 'all',
      isGroup: ctx.isGroup,
    });

    const helpText = formatHelpMessage({
      commandName: targetCommand,
      role: ctx.user?.role,
      userName: ctx.user?.nama,
    });

    // 1. Berikan reaksi emoji sukses (✅) pada pesan pemohon
    await dispatchSuccess(sock, ctx.messageKey);

    // 2. Kirim pesan panduan ke chat tempat perintah dipanggil (grup maupun pesan pribadi)
    await sock.sendMessage(ctx.chatJid, {
      text: helpText,
    });
  };
}
