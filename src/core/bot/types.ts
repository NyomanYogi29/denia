import type { BaileysEventMap, WASocket } from '@whiskeysockets/baileys';
import type { AppError } from '@/core/errors';
import type { Result } from '@/core/types';

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
   * Metode autentikasi: 'pairing' untuk pairing code 8 digit atau 'qr' untuk terminal QR code (default: 'pairing')
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
