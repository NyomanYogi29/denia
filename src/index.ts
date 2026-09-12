import { createBotClient, createMessageRouter, registerDefaultBotCommands } from '@/bot';
import { ensureAdminUsers, verifyRedisConnection, redisClose, backupDatabase } from '@/core/db';
import { createBufferService } from '@/core/services/buffer';
import { logger } from '@/core/logger';

export * from './core';
export * from './bot';

const log = logger.child({ module: 'APP_ENTRYPOINT' });

async function bootstrap(): Promise<void> {
  log.info('Memulai runtime Bot WhatsApp Denia...');

  // 1. Snapshot backup otomatis database SQLite (point-in-time recovery & retensi 5 file)
  const backupResult = await backupDatabase();
  if (!backupResult.success) {
    log.warn('Peringatan: Gagal membuat snapshot backup database SQLite saat startup', {
      error: backupResult.error.message,
    });
  }

  // 2. Verifikasi konektivitas Redis client untuk modul rate limiting (fail-safe / non-blocking)
  await verifyRedisConnection();

  // 3. Pastikan akun admin terdaftar permanen di database
  await ensureAdminUsers();

  const client = createBotClient();
  const bufferService = createBufferService({
    getSocket: () => client.getSocket(),
  });

  const router = createMessageRouter();
  registerDefaultBotCommands(router, { bufferService });
  router.attachToClient(client);

  // Daftarkan handler shutdown graceful
  const shutdown = async (signal: string) => {
    log.info(`Menerima sinyal ${signal}. Menutup koneksi WhatsApp dan Redis dengan aman...`);
    await bufferService.destroy();
    await redisClose();
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