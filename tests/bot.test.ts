import { describe, expect, it } from 'bun:test';
import type { proto, WAMessage, WASocket } from '@whiskeysockets/baileys';
import {
  createBotClient,
  createMessageRouter,
  createResponseDispatcher,
  dispatchDirectError,
  dispatchReaction,
  dispatchRejection,
  dispatchSuccess,
  extractMessageText,
  sendReaction,
  type MessageContext,
} from '@/bot';
import { config } from '@/core/config';
import { upsertUser } from '@/core/db/repositories';
import { ErrorCode, UnauthorizedError, ValidationError } from '@/core/errors';
import { ReactionEmoji } from '@/core/templates';
import { extractSenderJid } from '@/core/utils';

// Helper mock untuk membuat objek WAMessage Baileys
function createMockMessage(options: {
  text?: string;
  senderJid?: string;
  chatJid?: string;
  isGroup?: boolean;
  fromMe?: boolean;
  messageType?: 'conversation' | 'extendedText' | 'imageCaption' | 'ephemeral';
}): WAMessage {
  const isGroup = options.isGroup ?? false;
  const senderJid = options.senderJid ?? '628123456789@s.whatsapp.net';
  const chatJid = options.chatJid ?? (isGroup ? '120363028123456789@g.us' : senderJid);
  const fromMe = options.fromMe ?? false;
  const text = options.text ?? '';
  const messageType = options.messageType ?? 'conversation';

  let messagePayload: proto.IMessage = {};

  if (messageType === 'conversation') {
    messagePayload = { conversation: text };
  } else if (messageType === 'extendedText') {
    messagePayload = { extendedTextMessage: { text } };
  } else if (messageType === 'imageCaption') {
    messagePayload = { imageMessage: { caption: text } };
  } else if (messageType === 'ephemeral') {
    messagePayload = {
      ephemeralMessage: {
        message: {
          conversation: text,
        },
      },
    };
  }

  return {
    key: {
      remoteJid: chatJid,
      fromMe,
      id: 'MSG_' + Math.random().toString(36).substring(2, 9),
      participant: isGroup ? senderJid : undefined,
    },
    message: messagePayload,
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

describe('WhatsApp Bot Client Module', () => {
  it('should initialize bot client with default options (qr code mode) and idle status', () => {
    const client = createBotClient();

    expect(client).toBeDefined();
    expect(client.getStatus()).toBe('idle');
    expect(client.getSocket()).toBeNull();

    const options = client.getOptions();
    expect(options.authDir).toBe(config.whatsapp.authDir);
    expect(options.phoneNumber).toBe(config.whatsapp.botPhoneNumber);
    expect(options.authMode).toBe('qr'); // Default adalah qr code
    expect(options.autoReconnect).toBe(true);
    expect(options.reconnectIntervalMs).toBe(3000);
  });

  it('should accept custom configuration options and allow overriding to pairing mode', () => {
    const client = createBotClient({
      authDir: './test_auth_dir',
      phoneNumber: '628999888777',
      authMode: 'pairing',
      autoReconnect: false,
      maxReconnectAttempts: 5,
      reconnectIntervalMs: 5000,
    });

    const options = client.getOptions();
    expect(options.authDir).toBe('./test_auth_dir');
    expect(options.phoneNumber).toBe('628999888777');
    expect(options.authMode).toBe('pairing');
    expect(options.autoReconnect).toBe(false);
    expect(options.maxReconnectAttempts).toBe(5);
    expect(options.reconnectIntervalMs).toBe(5000);
  });

  it('should allow registering event listeners via on() method', () => {
    const client = createBotClient();
    let handled = false;

    expect(() => {
      client.on('messages.upsert', () => {
        handled = true;
      });
    }).not.toThrow();

    expect(handled).toBe(false);
  });

  it('should handle manual disconnect gracefully and return Result<void, AppError>', async () => {
    let statusReceived = '';
    const client = createBotClient({
      onStatusChange: (status) => {
        statusReceived = status;
      },
    });

    expect(client.getStatus()).toBe('idle');

    const result = await client.disconnect();

    // Result pattern validation
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBeUndefined();
    }

    expect(client.getStatus()).toBe('disconnected');
    expect(client.getSocket()).toBeNull();
    expect(statusReceived).toBe('disconnected');
  });

  it('should return Err with Result pattern when requestPairingCode is called without connected socket', async () => {
    const client = createBotClient({
      phoneNumber: '628123456789',
    });

    const result = await client.requestPairingCode();

    // Validasi Result pattern kegagalan
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ErrorCode.INTERNAL_ERROR);
    }
  });

  it('should return Err with ValidationError when requesting pairing code with empty phone number', async () => {
    const client = createBotClient({
      phoneNumber: '',
    });

    const result = await client.requestPairingCode('');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBeDefined();
      expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
    }
  });

  it('should return frozen BotClient and options objects for immutability', () => {
    const client = createBotClient();

    expect(Object.isFrozen(client)).toBe(true);
    expect(Object.isFrozen(client.getOptions())).toBe(true);
  });
});

describe('WhatsApp Events & Message Router Module (src/bot/events.ts)', () => {
  describe('extractMessageText', () => {
    it('should extract text from conversation message', () => {
      const msg = createMockMessage({ text: '!pinjam RAK_2.1', messageType: 'conversation' });
      expect(extractMessageText(msg)).toBe('!pinjam RAK_2.1');
    });

    it('should extract text from extendedTextMessage', () => {
      const msg = createMockMessage({ text: '!info 10/09/2026', messageType: 'extendedText' });
      expect(extractMessageText(msg)).toBe('!info 10/09/2026');
    });

    it('should extract text from image caption', () => {
      const msg = createMockMessage({ text: '!batal RAK_1.1', messageType: 'imageCaption' });
      expect(extractMessageText(msg)).toBe('!batal RAK_1.1');
    });

    it('should extract text from ephemeral message', () => {
      const msg = createMockMessage({ text: '!force RAK_2.1', messageType: 'ephemeral' });
      expect(extractMessageText(msg)).toBe('!force RAK_2.1');
    });

    it('should return null when message payload is empty or undefined', () => {
      const emptyMsg = { key: { remoteJid: '123@s.whatsapp.net' } } as unknown as WAMessage;
      expect(extractMessageText(emptyMsg)).toBeNull();
    });
  });

  describe('extractSenderJid', () => {
    it('should extract sender from group message participant', () => {
      const jid = extractSenderJid({
        remoteJid: '120363028123456789@g.us',
        participant: '628123456789@s.whatsapp.net',
        fromMe: false,
      });
      expect(jid).toBe('628123456789@s.whatsapp.net');
    });

    it('should strip device ID from participant JID', () => {
      const jid = extractSenderJid({
        remoteJid: '120363028123456789@g.us',
        participant: '628123456789:2@s.whatsapp.net',
        fromMe: false,
      });
      expect(jid).toBe('628123456789@s.whatsapp.net');
    });

    it('should extract sender from direct message remoteJid', () => {
      const jid = extractSenderJid({
        remoteJid: '628987654321@s.whatsapp.net',
        participant: undefined,
        fromMe: false,
      });
      expect(jid).toBe('628987654321@s.whatsapp.net');
    });

    it('should extract phone number JID from remoteJidAlt when remoteJid is a WhatsApp LID', () => {
      const jid = extractSenderJid({
        remoteJid: '255976091455538@lid',
        remoteJidAlt: '6285157580906@s.whatsapp.net',
        fromMe: false,
      });
      expect(jid).toBe('6285157580906@s.whatsapp.net');
    });

    it('should extract phone number JID from participantAlt when participant is a WhatsApp LID in a group', () => {
      const jid = extractSenderJid({
        remoteJid: '120363028123456789@g.us',
        participant: '255976091455538@lid',
        participantAlt: '6285157580906@s.whatsapp.net',
        fromMe: false,
      });
      expect(jid).toBe('6285157580906@s.whatsapp.net');
    });

    it('should return raw @lid string when no alternate PN is available for async Baileys resolution', () => {
      const jid = extractSenderJid({
        remoteJid: '255976091455538@lid',
        fromMe: false,
      });
      expect(jid).toBe('255976091455538@lid');
    });

    it('should return null when message is from bot itself (fromMe: true)', () => {
      const jid = extractSenderJid({
        remoteJid: '628123456789@s.whatsapp.net',
        fromMe: true,
      });
      expect(jid).toBeNull();
    });

    it('should return null when key is null or missing sender', () => {
      expect(extractSenderJid(null)).toBeNull();
      expect(extractSenderJid({})).toBeNull();
    });
  });

  describe('sendReaction', () => {
    it('should send reaction emoji successfully with socket', async () => {
      const sock = createMockSocket();
      const key: proto.IMessageKey = {
        remoteJid: '120363028123456789@g.us',
        id: 'MSG_123',
      };

      const result = await sendReaction(sock, key, ReactionEmoji.PROCESSING);

      expect(result.success).toBe(true);
      expect(sock.sentMessages.length).toBe(1);
      expect(sock.sentMessages[0]?.jid).toBe('120363028123456789@g.us');
      expect(sock.sentMessages[0]?.content.react.text).toBe(ReactionEmoji.PROCESSING);
      expect(sock.sentMessages[0]?.content.react.key).toBe(key);
    });

    it('should return error when key has no remoteJid', async () => {
      const sock = createMockSocket();
      const key: proto.IMessageKey = { id: 'MSG_123' };

      const result = await sendReaction(sock, key, ReactionEmoji.PROCESSING);

      expect(result.success).toBe(false);
      expect(sock.sentMessages.length).toBe(0);
    });
  });

  describe('createMessageRouter (Integrated Workflow)', () => {
    it('should filter out non-command messages and return ok(null)', async () => {
      const router = createMessageRouter();
      const sock = createMockSocket();
      const msg = createMockMessage({ text: 'Selamat pagi kawan-kawan' });

      const result = await router.handleMessage(msg, sock);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
      // Reaksi tidak boleh dikirim untuk non-command
      expect(sock.sentMessages.length).toBe(0);
    });

    it('should filter out messages sent by bot itself (fromMe: true)', async () => {
      const router = createMessageRouter();
      const sock = createMockSocket();
      const msg = createMockMessage({ text: '!pinjam RAK_2.1 10/09/2026 DEF', fromMe: true });

      const result = await router.handleMessage(msg, sock);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBeNull();
      }
      expect(sock.sentMessages.length).toBe(0);
    });

    it('should process command with prefix "!", send instant reaction ⏳, and auto-resolve user', async () => {
      // Daftarkan pengguna test ke database untuk auto-resolusi
      const testUserJid = '628111222333@s.whatsapp.net';
      await upsertUser({
        jid: testUserJid,
        nama: 'Korti PTI Test',
        fakultas: 'FTK',
        prodi: 'PTI',
        semester: 3,
        kelas: '3A',
        noTelp: '08111222333',
        role: 'korti',
      });

      let handledContext: MessageContext | null = null;
      const router = createMessageRouter();
      router.register('pinjam', (ctx) => {
        handledContext = ctx;
      });

      const sock = createMockSocket();
      const msg = createMockMessage({
        text: '!pinjam RAK_2.1 10/09/2026 DEF',
        senderJid: testUserJid,
        isGroup: true,
      });

      const result = await router.handleMessage(msg, sock);

      expect(result.success).toBe(true);
      if (result.success) {
        const ctx = result.data;
        expect(ctx).not.toBeNull();
        expect(ctx?.chatJid).toBe('120363028123456789@g.us');
        expect(ctx?.isGroup).toBe(true);
        expect(ctx?.senderJid).toBe(testUserJid);
        expect(ctx?.parsedCommand.command).toBe('pinjam');
        expect(ctx?.parsedCommand.args).toEqual(['RAK_2.1', '10/09/2026', 'DEF']);

        // Verifikasi auto-resolution pengguna dari tabel users
        expect(ctx?.user).not.toBeNull();
        expect(ctx?.user?.nama).toBe('Korti PTI Test');
        expect(ctx?.user?.role).toBe('korti');
        expect(ctx?.user?.kelas).toBe('3A');
      }

      // Verifikasi reaksi emoji ⏳ instan dikirim
      expect(sock.sentMessages.length).toBe(1);
      expect(sock.sentMessages[0]?.content.react.text).toBe(ReactionEmoji.PROCESSING);

      // Verifikasi handler dieksekusi
      expect(handledContext).not.toBeNull();
    });

    it('should handle unregistered user with user: null and trigger onUnauthorizedUser callback', async () => {
      const unregisteredJid = '628999000111@s.whatsapp.net';
      let unauthorizedCalled = false;

      const router = createMessageRouter({
        onUnauthorizedUser: (ctx) => {
          unauthorizedCalled = true;
          expect(ctx.user).toBeNull();
          expect(ctx.senderJid).toBe(unregisteredJid);
        },
      });

      const sock = createMockSocket();
      const msg = createMockMessage({
        text: '!info',
        senderJid: unregisteredJid,
        isGroup: false,
      });

      const result = await router.handleMessage(msg, sock);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data?.user).toBeNull();
      }
      expect(unauthorizedCalled).toBe(true);
      // Reaksi ⏳ tetap dikirim saat pesan diterima
      expect(sock.sentMessages.length).toBe(1);
      expect(sock.sentMessages[0]?.content.react.text).toBe(ReactionEmoji.PROCESSING);
    });

    it('should trigger onUnknownCommand callback when command is not registered in router', async () => {
      let unknownCommandReceived = '';

      const router = createMessageRouter({
        onUnknownCommand: (ctx) => {
          unknownCommandReceived = ctx.parsedCommand.command;
        },
      });

      const sock = createMockSocket();
      const msg = createMockMessage({ text: '!perintahacak arg1 arg2' });

      const result = await router.handleMessage(msg, sock);

      expect(result.success).toBe(true);
      expect(unknownCommandReceived).toBe('perintahacak');
    });

    it('should catch handler exceptions, call onError, and return Err result', async () => {
      let errorCaptured = false;

      const router = createMessageRouter({
        onError: (_err, ctx) => {
          errorCaptured = true;
          expect(ctx.parsedCommand.command).toBe('errorcmd');
        },
      });

      router.register('errorcmd', () => {
        throw new Error('Simulated handler failure');
      });

      const sock = createMockSocket();
      const msg = createMockMessage({ text: '!errorcmd' });

      const result = await router.handleMessage(msg, sock);

      expect(result.success).toBe(false);
      expect(errorCaptured).toBe(true);
    });

    it('should attach successfully to BotClient and process incoming messages.upsert events', async () => {
      const mockSock = createMockSocket();
      const listeners = new Map<string, Function>();

      const mockClient = {
        on: (event: string, handler: Function) => {
          listeners.set(event, handler);
        },
        getSocket: () => mockSock,
      } as unknown as ReturnType<typeof createBotClient>;

      const router = createMessageRouter();
      let handled = false;

      router.register('testcmd', () => {
        handled = true;
      });

      router.attachToClient(mockClient);

      expect(listeners.has('messages.upsert')).toBe(true);

      const msg = createMockMessage({ text: '!testcmd' });

      // Trigger event listener messages.upsert
      const upsertHandler = listeners.get('messages.upsert')!;
      await upsertHandler({ messages: [msg], type: 'notify' });

      expect(handled).toBe(true);
      expect(mockSock.sentMessages.length).toBe(1);
      expect(mockSock.sentMessages[0]?.content.react.text).toBe(ReactionEmoji.PROCESSING);
    });
  });
});

describe('Response Dispatcher Module (src/bot/responder.ts)', () => {
  describe('dispatchReaction', () => {
    it('should send reaction emoji to the remoteJid with Result pattern', async () => {
      const sock = createMockSocket();
      const key: proto.IMessageKey = {
        remoteJid: '120363028123456789@g.us',
        id: 'MSG_TEST_REACT',
      };

      const result = await dispatchReaction(sock, key, ReactionEmoji.PROCESSING);

      expect(result.success).toBe(true);
      expect(sock.sentMessages.length).toBe(1);
      expect(sock.sentMessages[0]?.jid).toBe('120363028123456789@g.us');
      expect(sock.sentMessages[0]?.content.react.text).toBe(ReactionEmoji.PROCESSING);
      expect(sock.sentMessages[0]?.content.react.key).toBe(key);
    });

    it('should return error when message key has no remoteJid', async () => {
      const sock = createMockSocket();
      const key: proto.IMessageKey = { id: 'MSG_NO_JID' };

      const result = await dispatchReaction(sock, key, ReactionEmoji.SUCCESS);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
      }
      expect(sock.sentMessages.length).toBe(0);
    });
  });

  describe('dispatchSuccess', () => {
    it('should update reaction emoji to SUCCESS (✅)', async () => {
      const sock = createMockSocket();
      const key: proto.IMessageKey = {
        remoteJid: '628123456789@s.whatsapp.net',
        id: 'MSG_SUCCESS',
      };

      const result = await dispatchSuccess(sock, key);

      expect(result.success).toBe(true);
      expect(sock.sentMessages.length).toBe(1);
      expect(sock.sentMessages[0]?.content.react.text).toBe(ReactionEmoji.SUCCESS);
      expect(sock.sentMessages[0]?.content.react.key).toBe(key);
    });
  });

  describe('dispatchDirectError', () => {
    it('should send formatted error notification directly to recipient via DM / Japri', async () => {
      const sock = createMockSocket();
      const recipientJid = '08123456789'; // Perlu dinormalisasi

      const error = new UnauthorizedError(
        'Nomor WhatsApp Anda belum terdaftar pada sistem SDP Undiksha.'
      );

      const result = await dispatchDirectError(sock, recipientJid, {
        error,
        command: '!pinjam RAK_2.1 10/09/2026 DEF',
        recipientName: 'Budi Santoso',
      });

      expect(result.success).toBe(true);
      expect(sock.sentMessages.length).toBe(1);
      expect(sock.sentMessages[0]?.jid).toBe('628123456789@s.whatsapp.net');

      const text = sock.sentMessages[0]?.content.text;
      expect(text).toContain('Halo *Budi Santoso*');
      expect(text).toContain('!pinjam RAK_2.1 10/09/2026 DEF');
      expect(text).toContain('Nomor WhatsApp Anda belum terdaftar');
      expect(text).toContain('Japri (DM)');
    });

    it('should handle generic / unknown errors gracefully with fallback resolution', async () => {
      const sock = createMockSocket();
      const recipientJid = '628999888777@s.whatsapp.net';

      const result = await dispatchDirectError(sock, recipientJid, {
        error: new Error('Unexpected database failure'),
      });

      expect(result.success).toBe(true);
      expect(sock.sentMessages.length).toBe(1);
      expect(sock.sentMessages[0]?.jid).toBe(recipientJid);
      expect(sock.sentMessages[0]?.content.text).toContain('Terjadi kendala internal pada sistem bot');
    });
  });

  describe('dispatchRejection', () => {
    it('should update reaction to FAILED (❌) and send Japri DM to sender', async () => {
      const sock = createMockSocket();

      const ctx: MessageContext = Object.freeze({
        rawMessage: {} as any,
        messageKey: {
          remoteJid: '120363028123456789@g.us', // pesan di grup
          id: 'MSG_REJECT_TEST',
        },
        chatJid: '120363028123456789@g.us',
        isGroup: true,
        senderJid: '628111222333@s.whatsapp.net', // pengirim pribadi
        rawText: '!pinjam RAK_1.1 09/09/2026 ABC',
        parsedCommand: {
          prefix: '!',
          command: 'pinjam',
          args: ['RAK_1.1', '09/09/2026', 'ABC'],
          rawArgs: 'RAK_1.1 09/09/2026 ABC',
          rawText: '!pinjam RAK_1.1 09/09/2026 ABC',
        },
        user: {
          jid: '628111222333@s.whatsapp.net',
          nama: 'Gede Pramana',
          fakultas: 'FTK',
          prodi: 'PTI',
          semester: 5,
          kelas: '5B',
          noTelp: '08111222333',
          role: 'korti' as const,
          createdAt: new Date().toISOString(),
        },
      });

      const validationErr = new ValidationError(
        ErrorCode.INVALID_BOOKING_LEAD_TIME,
        'Peminjaman reguler oleh Korti wajib minimal H-1 sebelum hari pemakaian.'
      );

      const result = await dispatchRejection(sock, ctx, validationErr);

      expect(result.success).toBe(true);
      // Harus ada 2 pesan keluar:
      // 1. Reaksi emoji ❌ ke grup (chatJid)
      // 2. Notifikasi error ke Japri pengirim (senderJid)
      expect(sock.sentMessages.length).toBe(2);

      const reactMessage = sock.sentMessages.find((m) => m.content.react);
      expect(reactMessage).toBeDefined();
      expect(reactMessage?.jid).toBe('120363028123456789@g.us');
      expect(reactMessage?.content.react.text).toBe(ReactionEmoji.FAILED);

      const dmMessage = sock.sentMessages.find((m) => m.content.text);
      expect(dmMessage).toBeDefined();
      expect(dmMessage?.jid).toBe('628111222333@s.whatsapp.net');
      expect(dmMessage?.content.text).toContain('Halo *Gede Pramana*');
      expect(dmMessage?.content.text).toContain('minimal H-1');
      expect(dmMessage?.content.text).toContain('!pinjam RAK_1.1 09/09/2026 ABC');
    });
  });

  describe('createResponseDispatcher', () => {
    it('should create frozen ResponseDispatcher instance with all required methods', () => {
      const dispatcher = createResponseDispatcher();

      expect(dispatcher).toBeDefined();
      expect(Object.isFrozen(dispatcher)).toBe(true);
      expect(typeof dispatcher.dispatchReaction).toBe('function');
      expect(typeof dispatcher.dispatchSuccess).toBe('function');
      expect(typeof dispatcher.dispatchRejection).toBe('function');
      expect(typeof dispatcher.dispatchDirectError).toBe('function');
    });
  });
});
