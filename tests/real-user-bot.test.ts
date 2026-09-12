import { describe, expect, it, beforeEach, afterEach, afterAll } from 'bun:test';
import type { WAMessage, WASocket } from '@whiskeysockets/baileys';
import { eq } from 'drizzle-orm';
import {
  createMessageRouter,
  registerDefaultBotCommands,
} from '@/bot';
import {
  db,
  bookings,
  forceEvents,
  users,
  ensureAdminUsers,
  type User,
} from '@/core/db';
import { createBufferService } from '@/core/services/buffer.service.ts';
import { ReactionEmoji } from '@/core/templates';
import { resetRateLimit } from '@/core/middleware/rate-limiter.middleware.ts';

function createMockMessage(options: {
  text?: string;
  senderJid?: string;
  chatJid?: string;
  isGroup?: boolean;
}): WAMessage {
  const isGroup = options.isGroup ?? true;
  const senderJid = options.senderJid ?? '6285157580906@s.whatsapp.net';
  const chatJid = options.chatJid ?? (isGroup ? '120363330872032502@g.us' : senderJid);
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

describe('Real User WhatsApp Bot Test Cases (Admin, Korti & Unregistered)', () => {
  const adminJid = '6285157580906@s.whatsapp.net';
  const kortiJidA = '628123456789@s.whatsapp.net';
  const kortiJidB = '628777888999@s.whatsapp.net';
  const strangerJid = '628999111222@s.whatsapp.net';

  const groupJid = '120363330872032502@g.us';
  const testRoomCode = 'RAK_2.1';

  // Format tanggal hari ini (Hari H)
  const today = new Date();
  const todayFormatted = `${String(today.getDate()).padStart(2, '0')}/${String(
    today.getMonth() + 1
  ).padStart(2, '0')}/${today.getFullYear()}`;

  // Format tanggal besok (H-1)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowFormatted = `${String(tomorrow.getDate()).padStart(2, '0')}/${String(
    tomorrow.getMonth() + 1
  ).padStart(2, '0')}/${tomorrow.getFullYear()}`;

  let bufferService: ReturnType<typeof createBufferService>;
  let mockSock: ReturnType<typeof createMockSocket>;
  let router: ReturnType<typeof createMessageRouter>;

  beforeEach(async () => {
    // Bersihkan transaksi tes
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, kortiJidA));
    await db.delete(users).where(eq(users.jid, kortiJidB));
    await db.delete(users).where(eq(users.jid, strangerJid));

    // Reset rate limit untuk JID pengujian agar terisolasi antar pengujian
    await resetRateLimit(kortiJidA);
    await resetRateLimit(kortiJidB);
    await resetRateLimit(strangerJid);
    await resetRateLimit('628123456789@s.whatsapp.net');

    // Pastikan admin utama terdaftar di whitelist database
    await ensureAdminUsers();

    // Daftarkan Korti A
    await db.insert(users).values({
      jid: kortiJidA,
      nama: 'Wayan Korti 3A',
      fakultas: 'FTK',
      prodi: 'PTI',
      semester: 3,
      kelas: 'PTI 3A',
      noTelp: '08123456789',
      role: 'korti',
    });

    // Daftarkan Korti B
    await db.insert(users).values({
      jid: kortiJidB,
      nama: 'Ketut Korti 3B',
      fakultas: 'FTK',
      prodi: 'SI',
      semester: 3,
      kelas: 'SI 3B',
      noTelp: '08777888999',
      role: 'korti',
    });

    mockSock = createMockSocket();
    bufferService = createBufferService({
      getSocket: () => mockSock,
      windowMs: 30000,
    });

    router = createMessageRouter();
    registerDefaultBotCommands(router, { bufferService });
  });

  afterEach(async () => {
    await bufferService.destroy();
    await db.delete(bookings).where(eq(bookings.roomCode, testRoomCode));
    await db.delete(forceEvents).where(eq(forceEvents.roomCode, testRoomCode));
    await db.delete(users).where(eq(users.jid, kortiJidA));
    await db.delete(users).where(eq(users.jid, kortiJidB));
    await db.delete(users).where(eq(users.jid, strangerJid));
  });

  afterAll(async () => {
    // Pastikan admin tetap ada selamanya setelah rangkaian tes selesai
    await ensureAdminUsers();
  });

  describe('1. Verifikasi Status Admin Permanen', () => {
    it('should verify admin 6285157580906@s.whatsapp.net is permanently registered with admin role', async () => {
      const adminInDb = await db.select().from(users).where(eq(users.jid, adminJid)).get();

      expect(adminInDb).toBeDefined();
      expect(adminInDb!.jid).toBe(adminJid);
      expect(adminInDb!.role).toBe('admin');
      expect(adminInDb!.nama).toContain('Admin');
    });
  });

  describe('2. Skenario Pengguna Admin (6285157580906@s.whatsapp.net)', () => {
    it('should allow Admin to view room availability matrix via !info', async () => {
      const msg = createMockMessage({
        text: '!info',
        senderJid: adminJid,
        chatJid: groupJid,
      });

      await router.handleMessage(msg, mockSock);

      // Emoji DM_SENT (📩) di grup
      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.DM_SENT);

      // Grup bersih tanpa pesan matriks
      const groupMessages = mockSock.sentMessages.filter(
        (m) => m.jid === groupJid && typeof m.content.text === 'string'
      );
      expect(groupMessages.length).toBe(0);

      // Pesan matriks terkirim langsung ke DM admin
      const dmMessages = mockSock.sentMessages.filter(
        (m) => m.jid === adminJid && typeof m.content.text === 'string'
      );
      expect(dmMessages.length).toBe(1);
      expect(dmMessages[0]!.content.text).toContain('MATRIKS KETERSEDIAAN RUANGAN SDP UNDIKSHA');
    });

    it('should allow Admin to book on the same day (Hari H) using Staff/Admin privilege', async () => {
      const msg = createMockMessage({
        text: `!pinjam ${testRoomCode} ${todayFormatted} DEF`,
        senderJid: adminJid,
        chatJid: groupJid,
      });

      await router.handleMessage(msg, mockSock);

      // Reaksi berhasil ✅
      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.SUCCESS);

      // Pastikan booking tersimpan di database
      const savedBookings = await db
        .select()
        .from(bookings)
        .where(eq(bookings.roomCode, testRoomCode))
        .all();
      expect(savedBookings.length).toBe(3);
      expect(savedBookings.every((b) => b.userJid === adminJid)).toBe(true);
    });

    it('should allow Admin to cancel anyone\'s booking (Korti A\'s booking)', async () => {
      // 1. Korti A memesan untuk besok
      const bookMsg = createMockMessage({
        text: `!pinjam ${testRoomCode} ${tomorrowFormatted} DEF`,
        senderJid: kortiJidA,
        chatJid: groupJid,
      });
      await router.handleMessage(bookMsg, mockSock);

      // 2. Admin membatalkan pemesanan Korti A
      const cancelMsg = createMockMessage({
        text: `!batal ${testRoomCode} ${tomorrowFormatted} DEF`,
        senderJid: adminJid,
        chatJid: groupJid,
      });
      await router.handleMessage(cancelMsg, mockSock);

      // Reaksi pembatalan sukses ✅
      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.SUCCESS);

      // Status di DB menjadi 'cancelled'
      const updatedBookings = await db
        .select()
        .from(bookings)
        .where(eq(bookings.roomCode, testRoomCode))
        .all();
      expect(updatedBookings.length).toBe(3);
      expect(updatedBookings.every((b) => b.status === 'cancelled')).toBe(true);

      // Pesan konfirmasi mencatat pembatalan oleh admin
      const cancelNotifs = mockSock.sentMessages.filter(
        (m) => m.jid === groupJid && m.content.text?.includes('Peminjaman Ruangan Berhasil Dibatalkan')
      );
      expect(cancelNotifs.length).toBe(1);
      expect(cancelNotifs[0]!.content.text).toContain('dibatalkan oleh admin');
    });
  });

  describe('3. Skenario Pengguna Mahasiswa / Korti', () => {
    it('should reject Korti booking on the same day (Hari H) due to H-1 lead time rule', async () => {
      const msg = createMockMessage({
        text: `!pinjam ${testRoomCode} ${todayFormatted} DEF`,
        senderJid: kortiJidA,
        chatJid: groupJid,
      });

      await router.handleMessage(msg, mockSock);

      // Reaksi ditolak ❌
      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.FAILED);

      // Pesan edukasi dikirim via DM (japri) ke korti
      const dmMessages = mockSock.sentMessages.filter(
        (m) => m.jid === kortiJidA && typeof m.content.text === 'string'
      );
      expect(dmMessages.length).toBe(1);
      expect(dmMessages[0]!.content.text).toContain('H-1');
    });

    it('should allow Korti to book for tomorrow (H-1) successfully', async () => {
      const msg = createMockMessage({
        text: `!pinjam ${testRoomCode} ${tomorrowFormatted} DEF`,
        senderJid: kortiJidA,
        chatJid: groupJid,
      });

      await router.handleMessage(msg, mockSock);

      // Reaksi berhasil ✅
      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.SUCCESS);

      // Masuk ke buffer
      expect(bufferService.getPendingCount(groupJid)).toBe(1);
    });

    it('should reject Korti B trying to book the already taken slot by Korti A', async () => {
      // 1. Korti A memesan slot DEF
      const msgA = createMockMessage({
        text: `!pinjam ${testRoomCode} ${tomorrowFormatted} DEF`,
        senderJid: kortiJidA,
        chatJid: groupJid,
      });
      await router.handleMessage(msgA, mockSock);

      // 2. Korti B mencoba memesan slot yang sama
      const msgB = createMockMessage({
        text: `!pinjam ${testRoomCode} ${tomorrowFormatted} DEF`,
        senderJid: kortiJidB,
        chatJid: groupJid,
      });
      await router.handleMessage(msgB, mockSock);

      // Reaksi untuk Korti B adalah ❌
      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.FAILED);

      // DM ke Korti B memberitahukan konflik slot
      const dmToB = mockSock.sentMessages.filter(
        (m) => m.jid === kortiJidB && typeof m.content.text === 'string'
      );
      expect(dmToB.length).toBe(1);
      expect(dmToB[0]!.content.text).toContain('baru saja dipesan');
    });

    it('should prevent Korti B from cancelling Korti A\'s booking', async () => {
      // 1. Korti A memesan
      const bookMsg = createMockMessage({
        text: `!pinjam ${testRoomCode} ${tomorrowFormatted} DEF`,
        senderJid: kortiJidA,
        chatJid: groupJid,
      });
      await router.handleMessage(bookMsg, mockSock);

      // 2. Korti B mencoba membatalkan milik Korti A
      const cancelMsg = createMockMessage({
        text: `!batal ${testRoomCode} ${tomorrowFormatted} DEF`,
        senderJid: kortiJidB,
        chatJid: groupJid,
      });
      await router.handleMessage(cancelMsg, mockSock);

      // Reaksi ditolak ❌
      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.FAILED);

      // DM ke Korti B menjelaskan tidak memiliki wewenang
      const dmToB = mockSock.sentMessages.filter(
        (m) => m.jid === kortiJidB && typeof m.content.text === 'string'
      );
      expect(dmToB.length).toBe(1);
      expect(dmToB[0]!.content.text).toContain('tidak memiliki izin');
    });
  });

  describe('4. Skenario Pengguna Belum Terdaftar (Stranger / Unwhitelisted)', () => {
    it('should reject booking from unregistered user and send informative DM', async () => {
      const msg = createMockMessage({
        text: `!pinjam ${testRoomCode} ${tomorrowFormatted} DEF`,
        senderJid: strangerJid,
        chatJid: groupJid,
      });

      await router.handleMessage(msg, mockSock);

      // Reaksi ❌
      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.FAILED);

      // DM edukasi whitelist
      const dmMessages = mockSock.sentMessages.filter(
        (m) => m.jid === strangerJid && typeof m.content.text === 'string'
      );
      expect(dmMessages.length).toBe(1);
      expect(dmMessages[0]!.content.text).toContain('belum terdaftar');
    });

    it('should allow unregistered user to view room info freely for schedule transparency', async () => {
      const msg = createMockMessage({
        text: '!info',
        senderJid: strangerJid,
        chatJid: groupJid,
      });

      await router.handleMessage(msg, mockSock);

      // Reaksi DM_SENT 📩
      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.DM_SENT);

      // Grup bersih
      const groupMessages = mockSock.sentMessages.filter(
        (m) => m.jid === groupJid && typeof m.content.text === 'string'
      );
      expect(groupMessages.length).toBe(0);

      // Jadwal terkirim ke DM
      const dmMessages = mockSock.sentMessages.filter(
        (m) => m.jid === strangerJid && typeof m.content.text === 'string'
      );
      expect(dmMessages.length).toBe(1);
      expect(dmMessages[0]!.content.text).toContain('MATRIKS KETERSEDIAAN RUANGAN SDP UNDIKSHA');
    });
  });

  describe('5. Validasi Aturan Domain WhatsApp Bot', () => {
    it('should reject non-contiguous slot combinations (e.g. ADF)', async () => {
      const msg = createMockMessage({
        text: `!pinjam ${testRoomCode} ${tomorrowFormatted} ADF`,
        senderJid: kortiJidA,
        chatJid: groupJid,
      });

      await router.handleMessage(msg, mockSock);

      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.FAILED);

      const dmMessages = mockSock.sentMessages.filter(
        (m) => m.jid === kortiJidA && typeof m.content.text === 'string'
      );
      expect(dmMessages.length).toBe(1);
      expect(dmMessages[0]!.content.text).toContain('kontigu');
    });

    it('should reject slot booking exceeding 4 SKS per transaction (e.g. ABCDE)', async () => {
      const msg = createMockMessage({
        text: `!pinjam ${testRoomCode} ${tomorrowFormatted} ABCDE`,
        senderJid: kortiJidA,
        chatJid: groupJid,
      });

      await router.handleMessage(msg, mockSock);

      const reactions = mockSock.sentMessages.filter((m) => m.content.react?.text);
      expect(reactions[reactions.length - 1]!.content.react.text).toBe(ReactionEmoji.FAILED);

      const dmMessages = mockSock.sentMessages.filter(
        (m) => m.jid === kortiJidA && typeof m.content.text === 'string'
      );
      expect(dmMessages.length).toBe(1);
      expect(dmMessages[0]!.content.text).toContain('4 SKS');
    });
  });
});
