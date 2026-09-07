import { Boom } from '@hapi/boom';
import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
  type BaileysEventMap,
  type WASocket,
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { config } from '@/core/config';
import { AppError, ErrorCode, ValidationError } from '@/core/errors';
import { logger } from '@/core/logger';
import { baseLogger } from '@/core/logger/init.ts';
import { err, ok, type Result } from '@/core/types';
import type {
  AuthMode,
  BotClient,
  BotClientOptions,
  ConnectionStatus,
  EventHandler,
} from './types.ts';

const log = logger.child({ module: 'WHATSAPP_CLIENT' });

/**
 * Factory untuk membuat instance client WhatsApp Bot berbasis Baileys dengan Result Pattern
 */
export const createBotClient = (options: BotClientOptions = {}): BotClient => {
  const resolvedAuthDir = options.authDir ?? config.whatsapp.authDir ?? './auth_info';
  const resolvedPhoneNumber = options.phoneNumber ?? config.whatsapp.botPhoneNumber;

  // Default mode autentikasi adalah 'qr' (Terminal QR Code)
  const envAuthMode: AuthMode =
    Bun.env.WA_AUTH_MODE?.toLowerCase() === 'pairing' ? 'pairing' : 'qr';
  const resolvedAuthMode: AuthMode = options.authMode ?? envAuthMode;

  const autoReconnect = options.autoReconnect ?? true;
  const maxReconnectAttempts = options.maxReconnectAttempts ?? 0;
  const reconnectIntervalMs = options.reconnectIntervalMs ?? 3000;

  let currentStatus: ConnectionStatus = 'idle';
  let currentSocket: WASocket | null = null;
  let reconnectAttempts = 0;
  let isExplicitDisconnect = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Map untuk menyimpan listener persisten (tetap aktif melintasi auto-reconnect)
  const persistentListeners = new Map<
    keyof BaileysEventMap,
    Set<EventHandler<any>>
  >();

  const updateStatus = (newStatus: ConnectionStatus): void => {
    currentStatus = newStatus;
    options.onStatusChange?.(newStatus);
  };

  const attachListenersToSocket = (sock: WASocket): void => {
    for (const [event, handlers] of persistentListeners.entries()) {
      for (const handler of handlers) {
        sock.ev.on(event, handler as any);
      }
    }
  };

  const requestPairingCode = async (
    customPhone?: string
  ): Promise<Result<string, AppError>> => {
    try {
      const phoneToUse = customPhone ?? resolvedPhoneNumber ?? config.whatsapp.botPhoneNumber;
      const cleanPhone = (phoneToUse || '').replace(/\D/g, '');

      if (!cleanPhone) {
        const validationError = new ValidationError(
          ErrorCode.INVALID_COMMAND_SYNTAX,
          'Nomor telepon bot belum terkonfigurasi atau tidak valid untuk meminta pairing code.'
        );
        log.error(validationError.userMessage);
        return err(validationError);
      }

      if (!currentSocket) {
        const socketError = new AppError({
          code: ErrorCode.INTERNAL_ERROR,
          userMessage: 'Socket WhatsApp belum diinisialisasi. Panggil connect() terlebih dahulu.',
        });
        log.error(socketError.userMessage);
        return err(socketError);
      }

      const code = await currentSocket.requestPairingCode(cleanPhone);
      const formattedCode = code?.match(/.{1,4}/g)?.join('-') ?? code;

      log.info(
        `\n======================================================\n` +
        `🔑 KODE PAIRING WHATSAPP: ${formattedCode}\n` +
        `Buka WhatsApp > Perangkat Tertaut > Tautkan dengan nomor telepon\n` +
        `======================================================\n`
      );

      options.onPairingCode?.(code);
      return ok(code);
    } catch (error) {
      log.error('Gagal meminta kode pairing dari WhatsApp', error);
      const appErr =
        error instanceof AppError
          ? error
          : new AppError({
              code: ErrorCode.INTERNAL_ERROR,
              userMessage: 'Gagal meminta pairing code dari server WhatsApp',
              cause: error,
            });
      return err(appErr);
    }
  };

  const connect = async (): Promise<Result<WASocket, AppError>> => {
    try {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      isExplicitDisconnect = false;
      updateStatus('connecting');
      log.info('Memulai inisialisasi koneksi WhatsApp Baileys...', {
        authDir: resolvedAuthDir,
        authMode: resolvedAuthMode,
      });

      const { state, saveCreds } = await useMultiFileAuthState(resolvedAuthDir);
      const { version, isLatest } = await fetchLatestBaileysVersion();

      log.info(`Menggunakan Baileys v${version.join('.')}${isLatest ? ' (versi terbaru)' : ''}`);

      const baileysPinoLogger = baseLogger.child(
        { module: 'BAILEYS_SOCKET' },
        { level: 'warn' }
      );

      const sock = makeWASocket({
        version,
        logger: baileysPinoLogger,
        auth: {
          creds: state.creds,
          keys: makeCacheableSignalKeyStore(state.keys, baileysPinoLogger),
        },
        printQRInTerminal: false,
        markOnlineOnConnect: true,
        generateHighQualityLinkPreview: false,
      });

      currentSocket = sock;

      // Attach seluruh registered event listeners ke socket baru
      attachListenersToSocket(sock);

      // Credential update listener
      sock.ev.on('creds.update', saveCreds);

      // Connection update listener
      sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        // Handle QR Code jika mode qr dipilih
        if (qr && resolvedAuthMode === 'qr') {
          log.info('Menerima QR Code baru, menampilkan pada terminal...');
          qrcode.generate(qr, { small: true });
          log.info('Pindai (scan) QR Code di atas menggunakan menu "Perangkat Tertaut" di aplikasi WhatsApp.');
          options.onQrCode?.(qr);
        }

        // Handle Connection Opened
        if (connection === 'open') {
          reconnectAttempts = 0;
          updateStatus('connected');
          log.success('Bot WhatsApp Denia berhasil terhubung ke jaringan WhatsApp!');
        }

        // Handle Connection Closed
        if (connection === 'close') {
          if (isExplicitDisconnect) {
            updateStatus('disconnected');
            log.info('Koneksi WhatsApp ditutup secara manual.');
            return;
          }

          const error = lastDisconnect?.error;
          const statusCode = (error as Boom)?.output?.statusCode;
          const isLoggedOut = statusCode === DisconnectReason.loggedOut;

          if (isLoggedOut) {
            updateStatus('logged_out');
            log.error('Sesi WhatsApp telah logout dari perangkat. Bersihkan sesi auth_info untuk login ulang.', error);
            return;
          }

          if (autoReconnect) {
            if (maxReconnectAttempts === 0 || reconnectAttempts < maxReconnectAttempts) {
              reconnectAttempts++;
              updateStatus('reconnecting');
              log.warn(
                `Koneksi WhatsApp terputus (status: ${statusCode ?? 'unknown'}). Melakukan rekoneksi ke-${reconnectAttempts} dalam ${reconnectIntervalMs}ms...`
              );

              reconnectTimer = setTimeout(() => {
                if (!isExplicitDisconnect) {
                  connect().catch((err) => {
                    log.error('Gagal saat mencoba rekoneksi otomatis', err);
                  });
                }
              }, reconnectIntervalMs);
            } else {
              updateStatus('disconnected');
              log.error(`Batas maksimal rekoneksi (${maxReconnectAttempts}) telah tercapai. Bot berhenti.`);
            }
          } else {
            updateStatus('disconnected');
            log.info('Koneksi WhatsApp ditutup (auto-reconnect dimatikan).', { statusCode });
          }
        }
      });

      // Handle Pairing Code secara otomatis jika default mode 'pairing' dan belum terdaftar
      if (resolvedAuthMode === 'pairing' && !state.creds.registered) {
        const attemptPairingCode = async (attempt = 1, maxAttempts = 3): Promise<void> => {
          if (!currentSocket || state.creds.registered || isExplicitDisconnect) return;

          const result = await requestPairingCode();
          if (!result.success && attempt < maxAttempts && !state.creds.registered && !isExplicitDisconnect) {
            log.warn(`Percobaan ke-${attempt} meminta pairing code belum berhasil. Mencoba lagi dalam 3 detik...`);
            setTimeout(() => attemptPairingCode(attempt + 1, maxAttempts), 3000);
          }
        };

        setTimeout(() => attemptPairingCode(), 3000);
      }

      return ok(sock);
    } catch (error) {
      updateStatus('disconnected');
      log.error('Gagal menginisialisasi socket WhatsApp Baileys', error);
      const appErr =
        error instanceof AppError
          ? error
          : new AppError({
              code: ErrorCode.INTERNAL_ERROR,
              userMessage: 'Gagal menginisialisasi koneksi WhatsApp',
              cause: error,
            });
      return err(appErr);
    }
  };

  const disconnect = async (): Promise<Result<void, AppError>> => {
    try {
      isExplicitDisconnect = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }

      if (currentSocket) {
        try {
          currentSocket.end(undefined);
        } catch (err) {
          log.warn('Peringatan saat menutup socket Baileys', { err });
        }
        currentSocket = null;
      }

      updateStatus('disconnected');
      log.info('Client WhatsApp berhasil di-disconnect.');
      return ok(undefined);
    } catch (error) {
      log.error('Gagal memutuskan koneksi WhatsApp', error);
      const appErr =
        error instanceof AppError
          ? error
          : new AppError({
              code: ErrorCode.INTERNAL_ERROR,
              userMessage: 'Gagal memutuskan koneksi WhatsApp',
              cause: error,
            });
      return err(appErr);
    }
  };

  const on = <T extends keyof BaileysEventMap>(
    event: T,
    handler: EventHandler<T>
  ): void => {
    let handlers = persistentListeners.get(event);
    if (!handlers) {
      handlers = new Set();
      persistentListeners.set(event, handlers);
    }
    handlers.add(handler);

    // Jika socket sedang aktif, langsung attach
    if (currentSocket) {
      currentSocket.ev.on(event, handler as any);
    }
  };

  return Object.freeze({
    connect,
    disconnect,
    requestPairingCode,
    getSocket: () => currentSocket,
    getStatus: () => currentStatus,
    getOptions: () =>
      Object.freeze({
        authDir: resolvedAuthDir,
        phoneNumber: resolvedPhoneNumber,
        authMode: resolvedAuthMode,
        autoReconnect,
        maxReconnectAttempts,
        reconnectIntervalMs,
      }),
    on,
  });
};
