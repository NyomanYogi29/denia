import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { eq } from 'drizzle-orm';
import {
  createMessageRouter,
  registerDefaultBotCommands,
} from '@/bot/index.ts';
import { db, bookings, forceEvents, users } from '@/core/db/index.ts';
import { createBookingUseCase } from '@/core/features/booking/index.ts';
import { resetRateLimit } from '@/core/middleware/index.ts';
import { ReactionEmoji } from '@/core/templates/index.ts';
import { getTomorrowIso, isoToDateString } from '@/core/utils/index.ts';

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

describe('WhatsApp Bot Force Command Consumer (Fase 5.4 - !force)', () => {
  const testStaffJid = '628999000111@s.whatsapp.net';
  const testKortiJid = '628111999888@s.whatsapp.net';
  const testGroupJid = '120363028123456789@g.us';
  const testRoomCode = 'RAK_2.1';

  const tomorrowIso = getTomorrowIso();
  const tomorrowFormatted = (isoToDateString(tomorrowIso) as any).data ?? '14/09/2026';

  beforeEach(async () => {
    // Reset rate limit
    await resetRateLimit(testStaffJid);
    await resetRateLimit(testKortiJid);

    // Bersihkan data
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, testKortiJid));

    // Tambah Staf
    await db.insert(users).values({
      jid: testStaffJid,
      nama: 'Ketua Jurusan TI',
      fakultas: 'FTK',
      prodi: 'TI',
      semester: null,
      kelas: 'Staf Pengelola',
      noTelp: '08999000111',
      role: 'staff',
    });

    // Tambah Korti
    await db.insert(users).values({
      jid: testKortiJid,
      nama: 'Gede Mahasiswa Korti',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 3,
      kelas: '3A',
      noTelp: '08111999888',
      role: 'korti',
    });
  });

  afterEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, testKortiJid));
  });

  it('should reject !force when arguments are insufficient (< 4 args)', async () => {
    const router = createMessageRouter();
    registerDefaultBotCommands(router);
    const sock = createMockSocket();

    const msg = createMockMessage({
      text: `!force ${testRoomCode} ${tomorrowFormatted}`,
      senderJid: testStaffJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, sock);

    // Verifikasi reaksi FAILED (❌)
    const reactions = sock.sentMessages.filter((m) => m.content.react);
    const lastReaction = reactions[reactions.length - 1];
    expect(lastReaction?.content.react.text).toBe(ReactionEmoji.FAILED);

    // Verifikasi pengiriman DM penolakan ke staf
    const dmMessage = sock.sentMessages.find(
      (m) => m.jid === testStaffJid && m.content.text?.includes('Format perintah')
    );
    expect(dmMessage).toBeDefined();
    expect(dmMessage?.content.text).toContain('Format perintah pengambilalihan ruangan tidak lengkap');
  });

  it('should reject !force from a Korti (non-staff/admin) with ❌ and DM', async () => {
    const router = createMessageRouter();
    registerDefaultBotCommands(router);
    const sock = createMockSocket();

    const msg = createMockMessage({
      text: `!force ${testRoomCode} ${tomorrowFormatted} DEF Rebut Ruangan`,
      senderJid: testKortiJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, sock);

    // Verifikasi reaksi FAILED (❌)
    const reactions = sock.sentMessages.filter((m) => m.content.react);
    const lastReaction = reactions[reactions.length - 1];
    expect(lastReaction?.content.react.text).toBe(ReactionEmoji.FAILED);

    // Verifikasi DM kesalahan peran ke Korti
    const dmMessage = sock.sentMessages.find((m) => m.jid === testKortiJid);
    expect(dmMessage).toBeDefined();
    expect(dmMessage?.content.text).toContain('Staf atau Admin');
  });

  it('should process valid !force on Korti booking, react ✅, send DM to displaced Korti, and announce in group', async () => {
    // 1. Korti meminjam slot DEF
    const kortiBook = await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testKortiJid,
      notes: 'Mata Kuliah PTI',
    });
    expect(kortiBook.success).toBe(true);

    const router = createMessageRouter();
    registerDefaultBotCommands(router);
    const sock = createMockSocket();

    // 2. Staf mengeksekusi !force di grup
    const msg = createMockMessage({
      text: `!force ${testRoomCode} ${tomorrowFormatted} DEF Sidang Tugas Akhir Bersama Penguji Tamu`,
      senderJid: testStaffJid,
      chatJid: testGroupJid,
      isGroup: true,
    });

    await router.handleMessage(msg, sock);

    // 3. Verifikasi reaksi SUCCESS (✅)
    const reactions = sock.sentMessages.filter((m) => m.content.react);
    const lastReaction = reactions[reactions.length - 1];
    expect(lastReaction?.content.react.text).toBe(ReactionEmoji.SUCCESS);

    // 4. Verifikasi notifikasi DM dikirim ke Korti yang tergeser
    const kortiDm = sock.sentMessages.find(
      (m) => m.jid === testKortiJid && m.content.text?.includes('PENGAMBILALIHAN RUANGAN')
    );
    expect(kortiDm).toBeDefined();
    expect(kortiDm?.content.text).toContain('dibatalkan secara resmi');
    expect(kortiDm?.content.text).toContain('Sidang Tugas Akhir Bersama Penguji Tamu');
    expect(kortiDm?.content.text).toContain('!info');

    // 5. Verifikasi pesan pengumuman dikirim di grup WhatsApp
    const groupAnnouncement = sock.sentMessages.find(
      (m) => m.jid === testGroupJid && m.content.text?.includes('PENGAMBILALIHAN RUANGAN INSTITUSI')
    );
    expect(groupAnnouncement).toBeDefined();
    expect(groupAnnouncement?.content.text).toContain(testRoomCode);
    expect(groupAnnouncement?.content.text).toContain('Ketua Jurusan TI');
    expect(groupAnnouncement?.content.text).toContain('3 peminjaman sebelumnya telah digeser');
  });
});

