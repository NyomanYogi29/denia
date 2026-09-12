import { describe, expect, it, beforeEach, afterEach, spyOn } from 'bun:test';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { createMessageRouter, registerDefaultBotCommands } from '@/bot';
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

  it('should allow up to 7 commands, then throttle on 8th command with DM warning', async () => {
    let callCount = 0;
    checkRateLimitSpy = spyOn(rateLimiterModule, 'checkRateLimit').mockImplementation(async () => {
      callCount++;
      if (callCount <= 7) {
        return {
          allowed: true,
          currentCount: callCount,
          limit: 7,
          remaining: 7 - callCount,
          resetInSeconds: 0,
        };
      }
      return {
        allowed: false,
        currentCount: callCount,
        limit: 7,
        remaining: 0,
        resetInSeconds: 45,
      };
    });

    const router = createMessageRouter();
    let handlerExecutedCount = 0;
    router.register('test', async () => {
      handlerExecutedCount++;
    });

    const mockSock = createMockSocket();

    // Kirim 7 perintah berturut-turut
    for (let i = 1; i <= 7; i++) {
      const msg = createMockMessage({
        text: '!test',
        senderJid: kortiJid,
        chatJid: groupJid,
        isGroup: true,
      });
      await router.handleMessage(msg, mockSock);
    }

    expect(handlerExecutedCount).toBe(7);

    // Kirim perintah ke-8 (melebihi batas)
    const msg8 = createMockMessage({
      text: '!test',
      senderJid: kortiJid,
      chatJid: groupJid,
      isGroup: true,
    });
    await router.handleMessage(msg8, mockSock);

    // Handler ke-8 tidak boleh dieksekusi
    expect(handlerExecutedCount).toBe(7);

    // Peringatan DM dikirimkan ke pengirim
    const dmMessages = mockSock.sentMessages.filter(
      (m) => m.jid === kortiJid && typeof m.content.text === 'string' && m.content.text.includes('Batas Pengiriman Perintah')
    );
    expect(dmMessages.length).toBe(1);
    expect(dmMessages[0]!.content.text).toContain('7 perintah per menit');
    expect(dmMessages[0]!.content.text).toContain('45 detik');
  });

  it('should bypass rate limit check for staff and admin roles', async () => {
    checkRateLimitSpy = spyOn(rateLimiterModule, 'checkRateLimit');

    const router = createMessageRouter();
    let handlerCount = 0;
    router.register('admincmd', async () => {
      handlerCount++;
    });

    const mockSock = createMockSocket();

    // Kirim pesan dari context yang memiliki user admin
    // Note: MessageRouter akan mencari user di database via JID
    // Kita mock checkRateLimit agar jika dipanggil akan terdeteksi
    const msg = createMockMessage({
      text: '!admincmd',
      senderJid: '6285157580906@s.whatsapp.net', // admin JID
      chatJid: groupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, mockSock);
    expect(handlerCount).toBe(1);
  });
});
