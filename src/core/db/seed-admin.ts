import { config } from '@/core/config/index.ts';
import { db } from '@/core/db/index.ts';
import { users, type User } from '@/core/db/schema.ts';
import { logger } from '@/core/logger/index.ts';

const log = logger.child({ module: 'SEED_ADMIN' });

/**
 * Memastikan seluruh nomor admin dari konfigurasi environment (ADMIN_JID_LIST) terdaftar secara permanen
 * di database dengan role 'admin'.
 */
export async function ensureAdminUsers(): Promise<readonly User[]> {
  const adminJids = config.whatsapp.adminJids;
  if (adminJids.length === 0) {
    return [];
  }

  const seeded: User[] = [];

  for (const jid of adminJids) {
    const rawNumber = jid.split('@')[0]?.replace(/\D/g, '') ?? '';
    const phone = rawNumber.startsWith('62') ? '0' + rawNumber.slice(2) : rawNumber;

    const [user] = await db
      .insert(users)
      .values({
        jid,
        nama: 'Admin SDP Undiksha',
        fakultas: 'FTK',
        prodi: 'SDP',
        semester: null,
        kelas: 'Admin SDP',
        noTelp: phone,
        role: 'admin',
      })
      .onConflictDoUpdate({
        target: users.jid,
        set: {
          role: 'admin',
          nama: 'Admin SDP Undiksha',
          kelas: 'Admin SDP',
        },
      })
      .returning();

    if (user) {
      seeded.push(user);
    }
  }

  log.info(`Berhasil memastikan ${seeded.length} akun admin terdaftar permanen di database.`);
  return Object.freeze(seeded);
}
