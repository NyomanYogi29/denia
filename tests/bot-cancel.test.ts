import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { eq } from 'drizzle-orm';
import {
  createMessageRouter,
  registerDefaultBotCommands,
} from '@/bot';
import { db, bookings, forceEvents, users } from '@/core/db';
import { createBookingUseCase } from '@/core/features/booking';
import { resetRateLimit } from '@/core/middleware';
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

describe('WhatsApp Bot Cancel Command Consumer (Fase 5.2 - !batal)', () => {
  const testKortiJid = '628111999888@s.whatsapp.net';
  const otherKortiJid = '628222888777@s.whatsapp.net';
  const testGroupJid = '120363028123456789@g.us';
  const testRoomCode = 'RAK_2.1';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowFormatted = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(
    tomorrow.getMonth() + 1
  ).padStart(2, '0')}/${tomorrow.getFullYear()}`;

  beforeEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));
    await db.delete(users).where(eq(users.jid, otherKortiJid));
    await resetRateLimit(testKortiJid);
    await resetRateLimit(otherKortiJid);

    await db.insert(users).values({
      jid: testKortiJid,
      nama: 'Wayan Pemilik Bot Test',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 3,
      kelas: '3A',
      noTelp: '08111999888',
      role: 'korti',
    });

    await db.insert(users).values({
      jid: otherKortiJid,
      nama: 'Made Orang Lain Test',
      fakultas: 'FTK',
      prodi: 'SI',
      semester: 3,
      kelas: '3B',
      noTelp: '08222888777',
      role: 'korti',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testKortiJid));
    await db.delete(users).where(eq(users.jid, otherKortiJid));
  });

  it('should process valid !batal from booking owner, react with ✅, and send confirmation message', async () => {
    // 1. Pesan ruangan
    await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
    });

    // 2. Kirim pesan !batal
    const mockSock = createMockSocket();
    const router = createMessageRouter();
    registerDefaultBotCommands(router);

    const msg = createMockMessage({
      text: `!batal RAK_2.1 ${tomorrowFormatted} DEF`,
      senderJid: testKortiJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    const result = await router.handleMessage(msg, mockSock);
    expect(result.success).toBe(true);

    // Reaksi SUCCESS (✅)
    const successReaction = mockSock.sentMessages.find(
      (m) => m.content.react?.text === ReactionEmoji.SUCCESS
    );
    expect(successReaction).toBeDefined();

    // Pesan konfirmasi pembatalan terkirim
    const confirmMessage = mockSock.sentMessages.find(
      (m) => m.jid === testGroupJid && typeof m.content.text === 'string' && m.content.text.includes('Dibatalkan')
    );
    expect(confirmMessage).toBeDefined();
    expect(confirmMessage?.content.text).toContain('RAK_2.1');
    expect(confirmMessage?.content.text).toContain('DEF');
  });

  it('should reject !batal when user is not the booking owner, react with ❌, and send DM', async () => {
    // 1. Pesan ruangan oleh testKortiJid
    await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
    });

    // 2. otherKortiJid mencoba membatalkan
    const mockSock = createMockSocket();
    const router = createMessageRouter();
    registerDefaultBotCommands(router);

    const msg = createMockMessage({
      text: `!batal RAK_2.1 ${tomorrowFormatted} DEF`,
      senderJid: otherKortiJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    const result = await router.handleMessage(msg, mockSock);
    expect(result.success).toBe(true);

    // Reaksi FAILED (❌)
    const failReaction = mockSock.sentMessages.find(
      (m) => m.content.react?.text === ReactionEmoji.FAILED
    );
    expect(failReaction).toBeDefined();

    // Notifikasi Japri DM ke otherKortiJid
    const dmMessage = mockSock.sentMessages.find(
      (m) => m.jid === otherKortiJid && typeof m.content.text === 'string'
    );
    expect(dmMessage).toBeDefined();
    expect(dmMessage?.content.text).toContain('pengguna lain');
  });

  it('should reject !batal when syntax is incomplete, react with ❌, and send DM', async () => {
    const mockSock = createMockSocket();
    const router = createMessageRouter();
    registerDefaultBotCommands(router);

    const msg = createMockMessage({
      text: '!batal RAK_2.1',
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
    expect(dmMessage?.content.text).toContain('tidak lengkap');
  });

  it('should handle duplicate cancellation idempotently by reacting ✅ without sending duplicate chat', async () => {
    const mockSock = createMockSocket();
    const router = createMessageRouter();
    registerDefaultBotCommands(router);

    // Buat booking awal
    await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
    });

    const msg1 = createMockMessage({
      text: `!batal RAK_2.1 ${tomorrowFormatted} DEF`,
      senderJid: testKortiJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    // Pembatalan 1: Berhasil
    await router.handleMessage(msg1, mockSock);

    const chatCountAfterFirstCancel = mockSock.sentMessages.filter(
      (m) => m.jid === testGroupJid && typeof m.content.text === 'string' && m.content.text.includes('Peminjaman Ruangan Berhasil Dibatalkan')
    ).length;
    expect(chatCountAfterFirstCancel).toBe(1);

    // Reset rate limit agar request 2 bisa diproses
    await resetRateLimit(testKortiJid);

    const msg2 = createMockMessage({
      text: `!batal RAK_2.1 ${tomorrowFormatted} DEF`,
      senderJid: testKortiJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    // Pembatalan 2: Idempoten oleh user yang sama
    await router.handleMessage(msg2, mockSock);

    // Reaksi sukses (✅) pada msg2
    const successReaction = mockSock.sentMessages.find(
      (m) => m.content.react?.text === ReactionEmoji.SUCCESS && m.content.react.key.id === msg2.key.id
    );
    expect(successReaction).toBeDefined();

    // Jumlah pesan chat pembatalan TIDAK bertambah (tetap 1)
    const chatCountAfterSecondCancel = mockSock.sentMessages.filter(
      (m) => m.jid === testGroupJid && typeof m.content.text === 'string' && m.content.text.includes('Peminjaman Ruangan Berhasil Dibatalkan')
    ).length;
    expect(chatCountAfterSecondCancel).toBe(1);
  });
});
