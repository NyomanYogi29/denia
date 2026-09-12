import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { proto, WAMessage, WASocket } from '@whiskeysockets/baileys';
import { eq } from 'drizzle-orm';
import {
  createMessageRouter,
  createPinjamCommandHandler,
  registerDefaultBotCommands,
  type MessageContext,
} from '@/bot';
import { db, bookings, forceEvents, users } from '@/core/db';
import { createBufferService } from '@/core/services/buffer.service.ts';
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

describe('WhatsApp Bot Booking Command Consumer (Fase 5.1 - !pinjam)', () => {
  const testKortiJid = '628111222333@s.whatsapp.net';
  const testGroupJid = '120363028123456789@g.us';
  const testRoomCode = 'RAK_2.1';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowFormatted = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(
    tomorrow.getMonth() + 1
  ).padStart(2, '0')}/${tomorrow.getFullYear()}`;

  const today = new Date();
  const todayFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(
    today.getMonth() + 1
  ).padStart(2, '0')}/${today.getFullYear()}`;

  beforeEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));

    await db.insert(users).values({
      jid: testKortiJid,
      nama: 'I Made Korti Bot Test',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 3,
      kelas: '3DPS',
      noTelp: '08111222333',
      role: 'korti',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));
  });

  it('should process valid !pinjam, react with SUCCESS (✅), and push into BufferService', async () => {
    const mockSock = createMockSocket();
    const bufferService = createBufferService({
      getSocket: () => mockSock,
      windowMs: 30000,
    });

    const router = createMessageRouter();
    registerDefaultBotCommands(router, { bufferService });

    const msg = createMockMessage({
      text: `!pinjam RAK_2.1 ${tomorrowFormatted} DEF`,
      senderJid: testKortiJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    const result = await router.handleMessage(msg, mockSock);
    expect(result.success).toBe(true);

    // Reaksi: 1x ⏳ (instan processing) lalu 1x ✅ (success)
    const successReaction = mockSock.sentMessages.find(
      (m) => m.content.react?.text === ReactionEmoji.SUCCESS
    );
    expect(successReaction).toBeDefined();
    expect(successReaction?.jid).toBe(testGroupJid);

    // Buffer service harus memiliki 1 item tertampung untuk grup ini
    expect(bufferService.getPendingCount(testGroupJid)).toBe(1);

    await bufferService.destroy();
  });

  it('should reject incomplete syntax, react with FAILED (❌), and dispatch Japri DM', async () => {
    const mockSock = createMockSocket();
    const router = createMessageRouter();
    registerDefaultBotCommands(router);

    const msg = createMockMessage({
      text: '!pinjam RAK_2.1', // hanya 1 argumen (kurang tanggal dan slot)
      senderJid: testKortiJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    const result = await router.handleMessage(msg, mockSock);
    expect(result.success).toBe(true);

    // Reaksi FAILED (❌) di grup
    const failReaction = mockSock.sentMessages.find(
      (m) => m.content.react?.text === ReactionEmoji.FAILED
    );
    expect(failReaction).toBeDefined();
    expect(failReaction?.jid).toBe(testGroupJid);

    // Pesan Japri (DM) dikirim ke senderJid
    const dmMessage = mockSock.sentMessages.find(
      (m) => m.jid === testKortiJid && typeof m.content.text === 'string'
    );
    expect(dmMessage).toBeDefined();
    expect(dmMessage?.content.text).toContain('Format perintah peminjaman ruangan tidak lengkap');
  });

  it('should reject unregistered user, react with FAILED (❌), and dispatch Japri DM', async () => {
    const unregisteredJid = '628999777888@s.whatsapp.net';
    const mockSock = createMockSocket();
    const router = createMessageRouter();
    registerDefaultBotCommands(router);

    const msg = createMockMessage({
      text: `!pinjam RAK_2.1 ${tomorrowFormatted} DEF`,
      senderJid: unregisteredJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    const result = await router.handleMessage(msg, mockSock);
    expect(result.success).toBe(true);

    const failReaction = mockSock.sentMessages.find(
      (m) => m.content.react?.text === ReactionEmoji.FAILED
    );
    expect(failReaction).toBeDefined();

    const dmMessage = mockSock.sentMessages.find(
      (m) => m.jid === unregisteredJid && typeof m.content.text === 'string'
    );
    expect(dmMessage).toBeDefined();
    expect(dmMessage?.content.text).toContain('whitelist');
  });

  it('should reject booking on hari H for Korti (H-1 violation), react ❌, and send DM', async () => {
    const mockSock = createMockSocket();
    const router = createMessageRouter();
    registerDefaultBotCommands(router);

    const msg = createMockMessage({
      text: `!pinjam RAK_2.1 ${todayFormatted} DEF`,
      senderJid: testKortiJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    const result = await router.handleMessage(msg, mockSock);
    expect(result.success).toBe(true);

    const failReaction = mockSock.sentMessages.find(
      (m) => m.content.react?.text === ReactionEmoji.FAILED
    );
    expect(failReaction).toBeDefined();

    const dmMessage = mockSock.sentMessages.find(
      (m) => m.jid === testKortiJid && typeof m.content.text === 'string'
    );
    expect(dmMessage).toBeDefined();
    expect(dmMessage?.content.text).toContain('minimal H-1');
  });
});
