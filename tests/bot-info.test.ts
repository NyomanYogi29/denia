import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import {
  createMessageRouter,
  registerDefaultBotCommands,
} from '@/bot';
import { ReactionEmoji } from '@/core/templates';

function createMockMessage(options: {
  text?: string;
  senderJid?: string;
  chatJid?: string;
  isGroup?: boolean;
}): WAMessage {
  const isGroup = options.isGroup ?? true;
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
    message: {
      conversation: text,
    },
    messageTimestamp: Math.floor(Date.now() / 1000),
  } as unknown as WAMessage;
}

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

describe('WhatsApp Bot Info Command Consumer (Fase 5.3 - !info)', () => {
  const testSenderJid = '628123456789@s.whatsapp.net';
  const testGroupJid = '120363028123456789@g.us';

  it('should process !info with no arguments and send availability message', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info',
      senderJid: testSenderJid,
      chatJid: testGroupJid,
    });

    await router.handleMessage(msg, mockSock);

    // Reaksi awal '⏳' lalu '✅'
    const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
    expect(reactions.length).toBeGreaterThanOrEqual(2);
    expect(reactions[0]!.content.react.text).toBe(ReactionEmoji.PROCESSING);
    expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.SUCCESS);

    // Pesan matriks dikirimkan ke grup chat
    const chatMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testGroupJid && typeof m.content.text === 'string'
    );
    expect(chatMessages.length).toBe(1);
    expect(chatMessages[0]!.content.text).toContain('MATRIKS KETERSEDIAAN RUANGAN SDP UNDIKSHA');
  });

  it('should process !info with specific date parameter', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info 25/11/2026',
      senderJid: testSenderJid,
      chatJid: testGroupJid,
    });

    await router.handleMessage(msg, mockSock);

    const chatMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testGroupJid && typeof m.content.text === 'string'
    );
    expect(chatMessages.length).toBe(1);
    expect(chatMessages[0]!.content.text).toContain('25/11/2026');
  });

  it('should process !info with specific room code and date', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info RAK_2.1 25/11/2026',
      senderJid: testSenderJid,
      chatJid: testGroupJid,
    });

    await router.handleMessage(msg, mockSock);

    const chatMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testGroupJid && typeof m.content.text === 'string'
    );
    expect(chatMessages.length).toBe(1);
    expect(chatMessages[0]!.content.text).toContain('RAK_2.1');
    expect(chatMessages[0]!.content.text).not.toContain('KHD_2.2');
  });

  it('should reject invalid date format with error reaction and DM', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info 2026-11-25', // format salah
      senderJid: testSenderJid,
      chatJid: testGroupJid,
    });

    await router.handleMessage(msg, mockSock);

    // Reaksi akhir adalah '❌'
    const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
    const lastReaction = reactions[reactions.length - 1];
    expect(lastReaction?.content.react.text).toBe(ReactionEmoji.FAILED);

    // Notifikasi error dikirimkan lewat DM (japri) ke pengirim
    const dmMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testSenderJid && typeof m.content.text === 'string'
    );
    expect(dmMessages.length).toBe(1);
    expect(dmMessages[0]!.content.text).toContain('Format tanggal');
  });
});
