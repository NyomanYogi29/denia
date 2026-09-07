import type { BaileysEventMap, proto, WAMessage, WASocket } from '@whiskeysockets/baileys';
import type { User } from '@/core/db/schema.ts';
import type { AppError } from '@/core/errors';
import type { ReactionEmojiType } from '@/core/templates';
import type { Result } from '@/core/types';
import type { ParsedCommand } from '@/core/utils';

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'logged_out';

export type AuthMode = 'qr' | 'pairing';

export interface BotClientOptions {
  /**
   * Path folder penyimpanan sesi Baileys (default: config.whatsapp.authDir atau './auth_info')
   */
  readonly authDir?: string;

  /**
   * Nomor telepon bot untuk keperluan pairing code (default: config.whatsapp.botPhoneNumber)
   */
  readonly phoneNumber?: string;

  /**
   * Metode autentikasi: 'qr' untuk terminal QR code atau 'pairing' untuk pairing code 8 digit (default: 'qr')
   */
  readonly authMode?: AuthMode;

  /**
   * Apakah bot melakukan rekoneksi otomatis saat koneksi terputus (default: true)
   */
  readonly autoReconnect?: boolean;

  /**
   * Batas maksimal percobaan rekoneksi sebelum berhenti (default: unlimited / 0)
   */
  readonly maxReconnectAttempts?: number;

  /**
   * Jeda waktu (ms) sebelum mencoba rekoneksi kembali (default: 3000ms)
   */
  readonly reconnectIntervalMs?: number;

  /**
   * Callback ketika status koneksi berubah
   */
  readonly onStatusChange?: (status: ConnectionStatus) => void;

  /**
   * Callback ketika string QR code diterima dari Baileys
   */
  readonly onQrCode?: (qr: string) => void;

  /**
   * Callback ketika pairing code diterima dari Baileys
   */
  readonly onPairingCode?: (code: string) => void;
}

export type EventHandler<T extends keyof BaileysEventMap> = (arg: BaileysEventMap[T]) => void | Promise<void>;

export interface BotClient {
  /**
   * Memulai koneksi socket WhatsApp ke Baileys dengan Result Pattern
   */
  readonly connect: () => Promise<Result<WASocket, AppError>>;

  /**
   * Memutuskan koneksi WhatsApp dan membersihkan resources dengan Result Pattern
   */
  readonly disconnect: () => Promise<Result<void, AppError>>;

  /**
   * Meminta kode pairing secara eksplisit dengan Result Pattern
   */
  readonly requestPairingCode: (phoneNumber?: string) => Promise<Result<string, AppError>>;

  /**
   * Mendapatkan instance active socket saat ini (null jika belum connect / closed)
   */
  readonly getSocket: () => WASocket | null;

  /**
   * Mendapatkan status koneksi saat ini
   */
  readonly getStatus: () => ConnectionStatus;

  /**
   * Mendapatkan opsi konfigurasi yang aktif
   */
  readonly getOptions: () => BotClientOptions;

  /**
   * Mendaftarkan event listener Baileys yang akan selalu dipertahankan dan di-attach ulang saat auto-reconnect
   */
  readonly on: <T extends keyof BaileysEventMap>(event: T, handler: EventHandler<T>) => void;
}

/**
 * Konteks pesan perintah masuk yang telah ter-parsing dan ter-resolusi identitas pengirimnya
 */
export interface MessageContext {
  /**
   * Raw WAMessage dari Baileys
   */
  readonly rawMessage: WAMessage;
  /**
   * Message key untuk keperluan balasan atau reaksi
   */
  readonly messageKey: proto.IMessageKey;
  /**
   * Chat JID tempat pesan diterima (grup @g.us atau DM @s.whatsapp.net)
   */
  readonly chatJid: string;
  /**
   * Menandakan apakah pesan berasal dari grup WhatsApp
   */
  readonly isGroup: boolean;
  /**
   * JID pengirim yang telah dinormalisasi (format: 628xxx@s.whatsapp.net)
   */
  readonly senderJid: string;
  /**
   * Teks asli pesan yang dikirimkan pengirim
   */
  readonly rawText: string;
  /**
   * Objek perintah yang telah di-parsing dari teks
   */
  readonly parsedCommand: ParsedCommand;
  /**
   * Data identitas pengguna terdaftar dari tabel users (null jika belum terdaftar/unauthorized)
   */
  readonly user: User | null;
}

/**
 * Tipe fungsi handler pemroses perintah
 */
export type CommandHandler = (
  ctx: MessageContext,
  sock: WASocket
) => Promise<void> | void;

/**
 * Opsi konfigurasi Message Router
 */
export interface MessageRouterOptions {
  /**
   * Prefix perintah yang digunakan (default: '!')
   */
  readonly prefix?: string;
  /**
   * Apakah otomatis mengirim reaksi emoji ⏳ saat pesan perintah mulai diproses (default: true)
   */
  readonly autoReact?: boolean;
  /**
   * Hook callback ketika pengirim belum terdaftar pada whitelist database users
   */
  readonly onUnauthorizedUser?: (
    ctx: MessageContext,
    sock: WASocket
  ) => Promise<void> | void;
  /**
   * Hook callback ketika perintah tidak dikenali / belum terdaftar di router
   */
  readonly onUnknownCommand?: (
    ctx: MessageContext,
    sock: WASocket
  ) => Promise<void> | void;
  /**
   * Hook callback ketika terjadi error saat mengeksekusi command handler
   */
  readonly onError?: (
    error: AppError,
    ctx: MessageContext,
    sock: WASocket
  ) => Promise<void> | void;
}

/**
 * Kontrak Message Router untuk registrasi dan dispatching perintah WhatsApp
 */
export interface MessageRouter {
  /**
   * Mendaftarkan handler untuk perintah tertentu (case-insensitive)
   */
  readonly register: (command: string, handler: CommandHandler) => MessageRouter;
  /**
   * Mengecek apakah sebuah perintah telah terdaftar di router
   */
  readonly has: (command: string) => boolean;
  /**
   * Mendapatkan handler yang terdaftar untuk suatu perintah
   */
  readonly get: (command: string) => CommandHandler | undefined;
  /**
   * Memproses pesan masuk tunggal (filter prefix, ekstraksi JID, reaksi ⏳, auto-resolusi user)
   */
  readonly handleMessage: (
    msg: WAMessage,
    sock: WASocket
  ) => Promise<Result<MessageContext | null, AppError>>;
  /**
   * Menghubungkan router ke event 'messages.upsert' pada BotClient
   */
  readonly attachToClient: (client: BotClient) => void;
}

/**
 * Parameter untuk pengiriman pesan error Japri / DM
 */
export interface DirectErrorDispatchOptions {
  /**
   * Error mentah atau AppError yang terjadi
   */
  readonly error: unknown;
  /**
   * Perintah yang gagal dijalankan (opsional)
   */
  readonly command?: string;
  /**
   * Nama penerima pesan jika diketahui (opsional)
   */
  readonly recipientName?: string;
}

/**
 * Kontrak Response Dispatcher untuk update reaksi emoji dan pengiriman DM error
 */
export interface ResponseDispatcher {
  /**
   * Mengirim atau memperbarui reaksi emoji pada pesan WhatsApp
   */
  readonly dispatchReaction: (
    sock: WASocket,
    key: proto.IMessageKey,
    emoji: ReactionEmojiType
  ) => Promise<Result<void, AppError>>;

  /**
   * Memperbarui reaksi emoji menjadi sukses (✅) pada pesan yang berhasil diproses/masuk buffer
   */
  readonly dispatchSuccess: (
    sock: WASocket,
    key: proto.IMessageKey
  ) => Promise<Result<void, AppError>>;

  /**
   * Menangani penolakan perintah secara terpadu:
   * 1. Mengubah reaksi emoji pesan menjadi ❌
   * 2. Mengirimkan notifikasi Japri/DM edukatif ke nomor pribadi pengirim
   */
  readonly dispatchRejection: (
    sock: WASocket,
    ctx: MessageContext,
    error: unknown
  ) => Promise<Result<void, AppError>>;

  /**
   * Mengirim pesan kesalahan / penolakan langsung ke nomor pribadi pengirim (DM / Japri)
   */
  readonly dispatchDirectError: (
    sock: WASocket,
    recipientJid: string,
    options: DirectErrorDispatchOptions
  ) => Promise<Result<void, AppError>>;
}
