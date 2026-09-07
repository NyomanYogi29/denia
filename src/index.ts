import { createBotClient, createMessageRouter } from '@/bot';
import { logger } from '@/core/logger';

export * from './core';
export * from './bot';

const log = logger.child({ module: 'APP_ENTRYPOINT' });

async function bootstrap(): Promise<void> {
  log.info('Memulai runtime Bot WhatsApp Denia...');

  const client = createBotClient();
  const router = createMessageRouter();
  router.attachToClient(client);

  // Daftarkan handler shutdown graceful
  const shutdown = async (signal: string) => {
    log.info(`Menerima sinyal ${signal}. Menutup koneksi WhatsApp dengan aman...`);
    const disconnectResult = await client.disconnect();
    if (!disconnectResult.success) {
      log.error('Gagal saat memutus koneksi WhatsApp', disconnectResult.error);
    }
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Memulai koneksi WhatsApp
  const connectResult = await client.connect();
  if (!connectResult.success) {
    log.error('Gagal menginisialisasi koneksi bot WhatsApp', connectResult.error);
    process.exit(1);
  }

  log.success('Inisialisasi koneksi bot WhatsApp selesai. Menunggu status sinkronisasi...');
}

bootstrap().catch((err) => {
  log.error('Terjadi uncaught error pada proses bootstrap aplikasi', err);
  process.exit(1);
});