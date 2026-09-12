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

import { resetRateLimit } from '@/core/middleware/rate-limiter.middleware.ts';

describe('WhatsApp Bot Info Command Consumer (Fase 5.3 & Evaluasi E.4 - !info Routing to DM)', () => {
  const testSenderJid = '628123456789@s.whatsapp.net';
  const testGroupJid = '120363028123456789@g.us';

  beforeEach(async () => {
    await resetRateLimit(testSenderJid);
  });

  it('should process !info in group, react with 📩, send matrix to DM, and keep group clean', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info',
      senderJid: testSenderJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, mockSock);

    // Reaksi awal '⏳' lalu '📩' (DM_SENT)
    const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
    expect(reactions.length).toBeGreaterThanOrEqual(2);
    expect(reactions[0]!.content.react.text).toBe(ReactionEmoji.PROCESSING);
    expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.DM_SENT);

    // Grup TIDAK menerima pesan teks balasan sama sekali (bersih)
    const groupMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testGroupJid && typeof m.content.text === 'string'
    );
    expect(groupMessages.length).toBe(0);

    // Pesan matriks dikirimkan langsung ke DM pribadi pengirim
    const dmMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testSenderJid && typeof m.content.text === 'string'
    );
    expect(dmMessages.length).toBe(1);
    expect(dmMessages[0]!.content.text).toContain('MATRIKS KETERSEDIAAN RUANGAN SDP UNDIKSHA');
  });

  it('should process !info with specific date parameter in group and route to DM', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info 25/11/2026',
      senderJid: testSenderJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, mockSock);

    // Reaksi 📩
    const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
    expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.DM_SENT);

    // Tidak ada pesan di grup
    const groupMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testGroupJid && typeof m.content.text === 'string'
    );
    expect(groupMessages.length).toBe(0);

    // Pesan di DM
    const dmMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testSenderJid && typeof m.content.text === 'string'
    );
    expect(dmMessages.length).toBe(1);
    expect(dmMessages[0]!.content.text).toContain('25/11/2026');
  });

  it('should process !info with specific room code in group and route to DM', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info RAK_2.1 25/11/2026',
      senderJid: testSenderJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, mockSock);

    // Reaksi 📩
    const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
    expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.DM_SENT);

    // DM menerima info ruangan spesifik
    const dmMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testSenderJid && typeof m.content.text === 'string'
    );
    expect(dmMessages.length).toBe(1);
    expect(dmMessages[0]!.content.text).toContain('RAK_2.1');
    expect(dmMessages[0]!.content.text).not.toContain('KHD_2.2');
  });

  it('should process !info in direct chat (DM), react with ✅, and send matrix directly in DM', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info',
      senderJid: testSenderJid,
      chatJid: testSenderJid,
      isGroup: false,
    });

    await router.handleMessage(msg, mockSock);

    // Reaksi akhir di chat pribadi adalah '✅' (SUCCESS)
    const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
    expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.SUCCESS);

    // Pesan matriks dikirim langsung ke chat pribadi tersebut
    const dmMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testSenderJid && typeof m.content.text === 'string'
    );
    expect(dmMessages.length).toBe(1);
    expect(dmMessages[0]!.content.text).toContain('MATRIKS KETERSEDIAAN RUANGAN SDP UNDIKSHA');
  });

  it('should handle DM failure when called in group by reacting with ❌ and sending fallback to group', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    // Mock sendMessage agar melempar error saat mengirim ke DM testSenderJid
    const originalSendMessage = mockSock.sendMessage;
    mockSock.sendMessage = async (jid: string, content: any) => {
      if (jid === testSenderJid && content.text?.includes('MATRIKS')) {
        throw new Error('DM blocked by privacy settings');
      }
      return originalSendMessage(jid, content);
    };

    const msg = createMockMessage({
      text: '!info',
      senderJid: testSenderJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, mockSock);

    // Reaksi akhir di pesan grup adalah '❌'
    const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
    expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.FAILED);

    // Grup menerima fallback notifikasi 1 baris
    const fallbackMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testGroupJid && typeof m.content.text === 'string' && m.content.text.includes('Gagal mengirim matriks')
    );
    expect(fallbackMessages.length).toBe(1);
    expect(fallbackMessages[0]!.content.mentions).toContain(testSenderJid);
  });

  it('should reject invalid date format with error reaction and DM', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info 2026-11-25', // format salah
      senderJid: testSenderJid,
      chatJid: testGroupJid,
      isGroup: true,
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

  it('should process !info besok in group, react with 📩, and send tomorrow matrix to DM', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info besok',
      senderJid: testSenderJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, mockSock);

    // Reaksi 📩
    const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
    expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.DM_SENT);

    // DM menerima pesan berlabel 'Besok'
    const dmMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testSenderJid && typeof m.content.text === 'string'
    );
    expect(dmMessages.length).toBe(1);
    expect(dmMessages[0]!.content.text).toContain('Besok');
  });

  it('should process !info RAK_2.1 besok in group and send specific room for tomorrow to DM', async () => {
    const router = registerDefaultBotCommands(createMessageRouter());
    const mockSock = createMockSocket();

    const msg = createMockMessage({
      text: '!info RAK_2.1 besok',
      senderJid: testSenderJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, mockSock);

    const dmMessages = mockSock.sentMessages.filter(
      (m) => m.jid === testSenderJid && typeof m.content.text === 'string'
    );
    expect(dmMessages.length).toBe(1);
    expect(dmMessages[0]!.content.text).toContain('Besok');
    expect(dmMessages[0]!.content.text).toContain('RAK_2.1');
  });
});
