import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { createMessageRouter, registerDefaultBotCommands } from '@/bot';
import { config } from '@/core/config';
import { ReactionEmoji } from '@/core/templates';
import * as rateLimiterModule from '@/core/middleware/rate-limiter.middleware.ts';

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

describe('WhatsApp Bot Rate Limiting Guard (Topik E.2)', () => {
  const kortiJid = '628123456789@s.whatsapp.net';
  const groupJid = '120363028123456789@g.us';
  let checkRateLimitSpy: any;

  afterEach(() => {
    if (checkRateLimitSpy) {
      checkRateLimitSpy.mockRestore();
      checkRateLimitSpy = null;
    }
  });

  it('should throttle commands exceeding limit with WARNING reaction and DM warning', async () => {
    let callCount = 0;
    checkRateLimitSpy = spyOn(rateLimiterModule, 'checkRateLimit').mockImplementation(async () => {
      callCount++;
      if (callCount <= 10) {
        return {
          allowed: true,
          currentCount: callCount,
          limit: 10,
          remaining: 10 - callCount,
          resetInSeconds: 0,
        };
      }
      return {
        allowed: false,
        currentCount: callCount,
        limit: 10,
        remaining: 0,
        resetInSeconds: 45,
      };
    });

    const router = createMessageRouter();
    let handlerExecutedCount = 0;
    router.register('info', async () => {
      handlerExecutedCount++;
    });

    const mockSock = createMockSocket();

    // Kirim 10 perintah berturut-turut
    for (let i = 1; i <= 10; i++) {
      const msg = createMockMessage({
        text: '!info',
        senderJid: kortiJid,
        chatJid: groupJid,
        isGroup: true,
      });
      await router.handleMessage(msg, mockSock);
    }

    expect(handlerExecutedCount).toBe(10);

    // Kirim perintah ke-11 (melebihi batas)
    const msg11 = createMockMessage({
      text: '!info',
      senderJid: kortiJid,
      chatJid: groupJid,
      isGroup: true,
    });
    await router.handleMessage(msg11, mockSock);

    // Handler ke-11 tidak boleh dieksekusi
    expect(handlerExecutedCount).toBe(10);

    // Reaksi WARNING (⚠️) dikirimkan pada pesan sumber
    const warningReaction = mockSock.sentMessages.find(
      (m) => m.content.react?.text === ReactionEmoji.WARNING
    );
    expect(warningReaction).toBeDefined();

    // Peringatan DM dikirimkan ke pengirim
    const dmMessages = mockSock.sentMessages.filter(
      (m) => m.jid === kortiJid && typeof m.content.text === 'string' && m.content.text.includes('Batas Pengiriman Perintah')
    );
    expect(dmMessages.length).toBe(1);
    expect(dmMessages[0]!.content.text).toContain('10 perintah per menit');
    expect(dmMessages[0]!.content.text).toContain('45 detik');

    // Kirim perintah ke-12 (masih terblokir), DM peringatan TIDAK boleh dikirim ulang (anti-spam throttled)
    const msg12 = createMockMessage({
      text: '!info',
      senderJid: kortiJid,
      chatJid: groupJid,
      isGroup: true,
    });
    await router.handleMessage(msg12, mockSock);

    const dmMessagesAfterSecondRejection = mockSock.sentMessages.filter(
      (m) => m.jid === kortiJid && typeof m.content.text === 'string' && m.content.text.includes('Batas Pengiriman Perintah')
    );
    expect(dmMessagesAfterSecondRejection.length).toBe(1);
  });

  it('should enforce action category rate limit (1 req / 5s) for booking commands', async () => {
    let callCount = 0;
    checkRateLimitSpy = spyOn(rateLimiterModule, 'checkRateLimit').mockImplementation(async (_jid, options) => {
      expect(options?.category).toBe('action');
      callCount++;
      if (callCount === 1) {
        return {
          allowed: true,
          currentCount: 1,
          limit: 1,
          remaining: 0,
          resetInSeconds: 0,
        };
      }
      return {
        allowed: false,
        currentCount: callCount,
        limit: 1,
        remaining: 0,
        resetInSeconds: 5,
      };
    });

    const router = createMessageRouter();
    let handlerExecutedCount = 0;
    router.register('pinjam', async () => {
      handlerExecutedCount++;
    });

    const mockSock = createMockSocket();

    // Perintah 1 lolos
    const msg1 = createMockMessage({
      text: '!pinjam RAK_2.1 14/09/2026 DEF',
      senderJid: kortiJid,
      chatJid: groupJid,
      isGroup: true,
    });
    await router.handleMessage(msg1, mockSock);
    expect(handlerExecutedCount).toBe(1);

    // Perintah 2 dalam 5 detik ditolak
    const msg2 = createMockMessage({
      text: '!pinjam RAK_2.1 14/09/2026 DEF',
      senderJid: kortiJid,
      chatJid: groupJid,
      isGroup: true,
    });
    await router.handleMessage(msg2, mockSock);
    expect(handlerExecutedCount).toBe(1);
  });

  it('should respect RATE_LIMIT_BYPASS_ADMIN setting for admin role', async () => {
    checkRateLimitSpy = spyOn(rateLimiterModule, 'checkRateLimit');

    const router = createMessageRouter();
    let handlerCount = 0;
    router.register('admincmd', async () => {
      handlerCount++;
    });

    const mockSock = createMockSocket();

    // Kirim pesan dari context yang memiliki user admin
    const msg = createMockMessage({
      text: '!admincmd',
      senderJid: '6285157580906@s.whatsapp.net', // admin JID
      chatJid: groupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, mockSock);
    expect(handlerCount).toBe(1);

    if (config.redis.rateLimitBypassAdmin) {
      expect(checkRateLimitSpy).not.toHaveBeenCalled();
    } else {
      expect(checkRateLimitSpy).toHaveBeenCalled();
    }
  });
});
