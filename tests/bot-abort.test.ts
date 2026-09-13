import { describe, expect, it, beforeEach, afterEach } from 'bun:test';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { eq } from 'drizzle-orm';
import {
  createMessageRouter,
  registerDefaultBotCommands,
} from '@/bot/index.ts';
import { db, bookings, forceEvents, users } from '@/core/db/index.ts';
import { forceBookingUseCase } from '@/core/features/force/index.ts';
import { createBookingUseCase } from '@/core/features/booking/index.ts';
import { createForceEventUseCase } from '@/core/features/force-event/index.ts';
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

describe('WhatsApp Bot Abort Command Consumer (Fase 5.6 - !abort force & !abort forceevent)', () => {
  const testStaffJid = '628999000111@s.whatsapp.net';
  const testKortiJid = '628111999888@s.whatsapp.net';
  const testGroupJid = '120363028123456789@g.us';
  const testRoomCode = 'RAK_2.1';

  const tomorrowIso = getTomorrowIso();
  const tomorrowFormatted = isoToDateString(tomorrowIso).success
    ? (isoToDateString(tomorrowIso) as any).data
    : '14/09/2026';

  beforeEach(async () => {
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, testStaffJid));
    await db.delete(users).where(eq(users.jid, testKortiJid));

    await resetRateLimit(testStaffJid);
    await resetRateLimit(testKortiJid);

    // Staf terdaftar
    await db.insert(users).values({
      jid: testStaffJid,
      nama: 'Staf SDP Kampus',
      fakultas: null,
      prodi: null,
      semester: null,
      kelas: 'Staf SDP',
      noTelp: '08999000111',
      role: 'staff',
    });

    // Korti terdaftar
    await db.insert(users).values({
      jid: testKortiJid,
      nama: 'Wayan Korti',
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

  it('harus menolak perintah !abort jika tanpa argumen dan mengirim pesan DM edukatif', async () => {
    const router = createMessageRouter();
    registerDefaultBotCommands(router);
    const sock = createMockSocket();

    const msg = createMockMessage({
      text: '!abort',
      senderJid: testStaffJid,
      chatJid: testGroupJid,
    });

    await router.handleMessage(msg, sock);

    // Harus mengirim reaksi ❌ pada pesan di grup
    const reactionCalls = sock.sentMessages.filter((m) => m.content?.react);
    const lastReaction = reactionCalls[reactionCalls.length - 1];
    expect(lastReaction?.content?.react?.text).toBe(ReactionEmoji.REJECTED);

    // Notifikasi penolakan dikirim via DM
    const dmRejections = sock.sentMessages.filter(
      (m) => m.jid === testStaffJid && m.content?.text && !m.content.react
    );
    expect(dmRejections.length).toBeGreaterThan(0);
    expect(dmRejections[0]?.content?.text).toContain('Format perintah pembatalan tidak lengkap');
  });

  it('harus menolak jika Korti mencoba mengeksekusi !abort force', async () => {
    const router = createMessageRouter();
    registerDefaultBotCommands(router);
    const sock = createMockSocket();

    const msg = createMockMessage({
      text: '!abort force 15',
      senderJid: testKortiJid,
      chatJid: testGroupJid,
    });

    await router.handleMessage(msg, sock);

    const reactionCalls = sock.sentMessages.filter((m) => m.content?.react);
    const lastReaction = reactionCalls[reactionCalls.length - 1];
    expect(lastReaction?.content?.react?.text).toBe(ReactionEmoji.REJECTED);

    const dmRejections = sock.sentMessages.filter(
      (m) => m.jid === testKortiJid && m.content?.text && !m.content.react
    );
    expect(dmRejections.length).toBeGreaterThan(0);
    expect(dmRejections[0]?.content?.text).toContain('hanya dapat dieksekusi oleh Staf atau Admin');
  });

  it('harus berhasil memproses !abort force [id_booking], mengirim reaksi ✅, pengumuman di grup, dan DM pemulihan ke korti terdampak', async () => {
    // 1. Korti booking slot D
    await createBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'D',
      userJid: testKortiJid,
    });

    // 2. Staf melakukan force booking slot DEF
    const forceRes = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'DEF',
      userJid: testStaffJid,
      reason: 'Ujian Sidang Sarjana',
    });
    expect(forceRes.success).toBe(true);
    if (!forceRes.success) return;

    const forceBookingId = forceRes.data.bookings[0]!.id;

    // 3. Staf mengeksekusi !abort force <id> di grup WhatsApp
    const router = createMessageRouter();
    registerDefaultBotCommands(router);
    const sock = createMockSocket();

    const msg = createMockMessage({
      text: `!abort force ${forceBookingId}`,
      senderJid: testStaffJid,
      chatJid: testGroupJid,
    });

    await router.handleMessage(msg, sock);

    // Cek reaksi sukses ✅ pada pesan grup
    const reactionCalls = sock.sentMessages.filter((m) => m.content?.react);
    const lastReaction = reactionCalls[reactionCalls.length - 1];
    expect(lastReaction?.content?.react?.text).toBe(ReactionEmoji.SUCCESS);

    // Cek pengumuman publik di grup
    const groupAnnouncements = sock.sentMessages.filter(
      (m) => m.jid === testGroupJid && m.content?.text && !m.content.react
    );
    expect(groupAnnouncements.length).toBe(1);
    expect(groupAnnouncements[0]!.content.text).toContain('PEMBATALAN PENGAMBILALIHAN RUANGAN');
    expect(groupAnnouncements[0]!.content.text).toContain(testRoomCode);
    expect(groupAnnouncements[0]!.content.text).toContain('KOSONG KEMBALI');

    // Cek DM Japri pemulihan dikirim ke Korti terdampak
    const kortiDm = sock.sentMessages.filter(
      (m) => m.jid === testKortiJid && m.content?.text && !m.content.react
    );
    expect(kortiDm.length).toBe(1);
    expect(kortiDm[0]!.content.text).toContain('KABAR BAIK: RUANGAN KEMBALI TERSEDIA');
    expect(kortiDm[0]!.content.text).toContain(`!pinjam ${testRoomCode}`);
  });

  it('harus mendukung delegasi otomatis dari perintah !batal force [id_booking]', async () => {
    const forceRes = await forceBookingUseCase({
      roomCode: testRoomCode,
      date: tomorrowFormatted,
      slotCode: 'B',
      userJid: testStaffJid,
      reason: 'Rapat Staf',
    });
    expect(forceRes.success).toBe(true);
    if (!forceRes.success) return;

    const forceBookingId = forceRes.data.bookings[0]!.id;

    const router = createMessageRouter();
    registerDefaultBotCommands(router);
    const sock = createMockSocket();

    // Pengguna memanggil !batal force <id>
    const msg = createMockMessage({
      text: `!batal force ${forceBookingId}`,
      senderJid: testStaffJid,
      chatJid: testGroupJid,
    });

    await router.handleMessage(msg, sock);

    const reactionCalls = sock.sentMessages.filter((m) => m.content?.react);
    const lastReaction = reactionCalls[reactionCalls.length - 1];
    expect(lastReaction?.content?.react?.text).toBe(ReactionEmoji.SUCCESS);

    const groupAnnouncements = sock.sentMessages.filter(
      (m) => m.jid === testGroupJid && m.content?.text && !m.content.react
    );
    expect(groupAnnouncements.length).toBe(1);
    expect(groupAnnouncements[0]!.content.text).toContain('PEMBATALAN PENGAMBILALIHAN RUANGAN');
  });

  it('harus berhasil memproses pembatalan agenda force event kampus via !abort forceevent', async () => {
    const eventRes = await createForceEventUseCase({
      roomCodes: [testRoomCode],
      startDate: tomorrowFormatted,
      endDate: tomorrowFormatted,
      eventName: 'Workshop Akreditasi',
      userJid: testStaffJid,
    });
    expect(eventRes.success).toBe(true);
    if (!eventRes.success) return;

    const eventId = eventRes.data.events[0]!.id;

    const router = createMessageRouter();
    registerDefaultBotCommands(router);
    const sock = createMockSocket();

    const msg = createMockMessage({
      text: `!abort forceevent ${eventId}`,
      senderJid: testStaffJid,
      chatJid: testGroupJid,
    });

    await router.handleMessage(msg, sock);

    const reactionCalls = sock.sentMessages.filter((m) => m.content?.react);
    const lastReaction = reactionCalls[reactionCalls.length - 1];
    expect(lastReaction?.content?.react?.text).toBe(ReactionEmoji.SUCCESS);

    const groupAnnouncements = sock.sentMessages.filter(
      (m) => m.jid === testGroupJid && m.content?.text && !m.content.react
    );
    expect(groupAnnouncements.length).toBe(1);
    expect(groupAnnouncements[0]!.content.text).toContain('PEMBATALAN AGENDA PEMBLOKIRAN RUANGAN');
    expect(groupAnnouncements[0]!.content.text).toContain('Workshop Akreditasi');
  });
});
