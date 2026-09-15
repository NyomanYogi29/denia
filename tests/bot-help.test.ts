import { describe, expect, it } from 'bun:test';
import type { proto, WAMessage, WASocket } from '@whiskeysockets/baileys';
import {
  createHelpCommandHandler,
  createMessageRouter,
  registerDefaultBotCommands,
  type MessageContext,
} from '@/bot';
import { formatHelpMessage } from '@/core/templates';

// Helper mock untuk membuat objek WAMessage Baileys
function createMockMessage(options: {
  text?: string;
  senderJid?: string;
  chatJid?: string;
  isGroup?: boolean;
}): WAMessage {
  const isGroup = options.isGroup ?? false;
  const senderJid = options.senderJid ?? '628123456789@s.whatsapp.net';
  const chatJid = options.chatJid ?? (isGroup ? '120363028123456789@g.us' : senderJid);
  const text = options.text ?? '';

  return {
    key: {
      remoteJid: chatJid,
      fromMe: false,
      id: 'MSG_' + Math.random().toString(36).substring(2, 9),
      participant: isGroup ? senderJid : undefined,
    },
    message: { conversation: text },
    messageTimestamp: Math.floor(Date.now() / 1000),
  } as unknown as WAMessage;
}

// Helper mock untuk Baileys WASocket
function createMockSocket(): WASocket & {
  sentMessages: Array<{ jid: string; content: any }>;
} {
  const sentMessages: Array<{ jid: string; content: any }> = [];

  const mockSock = {
    sentMessages,
    sendMessage: async (jid: string, content: any) => {
      sentMessages.push({ jid, content });
      return { key: { id: 'SENT_' + Math.random() } } as any;
    },
  } as unknown as WASocket & { sentMessages: Array<{ jid: string; content: any }> };

  return mockSock;
}

describe('WhatsApp Bot Help Command & Template', () => {
  describe('formatHelpMessage', () => {
    it('should generate complete general help menu when called without specific command', () => {
      const output = formatHelpMessage();

      expect(output).toContain('PANDUAN PERINTAH BOT WHATSAPP DENIA');
      expect(output).toContain('!pinjam');
      expect(output).toContain('!batal');
      expect(output).toContain('!info');
      expect(output).toContain('!force');
      expect(output).toContain('!forceevent');
      expect(output).toContain('!abort');
      expect(output).toContain('Kamus Slot Perkuliahan');
      expect(output).toContain('denia help');
    });

    it('should include user name in greeting if provided', () => {
      const output = formatHelpMessage({ userName: 'Gede Pramana' });
      expect(output).toContain('Halo *Gede Pramana*!');
    });

    it('should provide targeted help for specific commands', () => {
      const pinjamHelp = formatHelpMessage({ commandName: 'pinjam' });
      expect(pinjamHelp).toContain('Panduan Perintah: !pinjam');
      expect(pinjamHelp).toContain('H-1');
      expect(pinjamHelp).toContain('1 sampai 4 SKS');

      const infoHelp = formatHelpMessage({ commandName: 'info' });
      expect(infoHelp).toContain('Panduan Perintah: !info');

      const forceHelp = formatHelpMessage({ commandName: 'force' });
      expect(forceHelp).toContain('Panduan Perintah: !force');

      const forceEventHelp = formatHelpMessage({ commandName: 'forceevent' });
      expect(forceEventHelp).toContain('Panduan Perintah: !forceevent');

      const abortHelp = formatHelpMessage({ commandName: 'abort' });
      expect(abortHelp).toContain('Panduan Perintah: !abort');
    });

    it('should return friendly fallback for unknown command help target', () => {
      const unknownHelp = formatHelpMessage({ commandName: 'unknownxyz' });
      expect(unknownHelp).toContain('tidak dikenali');
    });
  });

  describe('createHelpCommandHandler & MessageRouter Integration', () => {
    it('should reply with full help text and success reaction when !help is called in group', async () => {
      const router = createMessageRouter({ autoReact: false });
      const helpHandler = createHelpCommandHandler();
      router.register('help', helpHandler);

      const sock = createMockSocket();
      const msg = createMockMessage({
        text: '!help',
        isGroup: true,
        chatJid: '120363028123456789@g.us',
        senderJid: '628123456789@s.whatsapp.net',
      });

      const result = await router.handleMessage(msg, sock);
      expect(result.success).toBe(true);

      // Reaksi ✅ dan pesan teks terkirim
      expect(sock.sentMessages.length).toBe(2);

      const reactMsg = sock.sentMessages.find((m) => m.content.react);
      expect(reactMsg).toBeDefined();
      expect(reactMsg?.content.react.text).toBe('✅');

      const textMsg = sock.sentMessages.find((m) => m.content.text);
      expect(textMsg).toBeDefined();
      expect(textMsg?.jid).toBe('120363028123456789@g.us');
      expect(textMsg?.content.text).toContain('PANDUAN PERINTAH BOT WHATSAPP DENIA');
    });

    it('should reply with specific command help when !help pinjam is called', async () => {
      const router = createMessageRouter({ autoReact: false });
      const helpHandler = createHelpCommandHandler();
      router.register('help', helpHandler);

      const sock = createMockSocket();
      const msg = createMockMessage({
        text: '!help pinjam',
        isGroup: false,
        senderJid: '628123456789@s.whatsapp.net',
      });

      const result = await router.handleMessage(msg, sock);
      expect(result.success).toBe(true);

      const textMsg = sock.sentMessages.find((m) => m.content.text);
      expect(textMsg).toBeDefined();
      expect(textMsg?.content.text).toContain('Panduan Perintah: !pinjam');
      expect(textMsg?.content.text).toContain('H-1');
    });

    it('should be registered with aliases (help, panduan, bantuan, menu) in default bot commands', () => {
      const router = createMessageRouter();
      registerDefaultBotCommands(router);

      expect(router.has('help')).toBe(true);
      expect(router.has('panduan')).toBe(true);
      expect(router.has('bantuan')).toBe(true);
      expect(router.has('menu')).toBe(true);
    });
  });
});
