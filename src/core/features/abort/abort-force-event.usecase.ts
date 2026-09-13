import {
  abortForceEventImmediate,
  findUserByJid,
} from '@/core/db/repositories/index.ts';
import { invalidateScheduleCache } from '@/core/db/redis.ts';
import {
  AppError,
  ErrorCode,
  UnauthorizedError,
  ValidationError,
} from '@/core/errors/index.ts';
import { logger } from '@/core/logger/index.ts';
import { err, ok, type Result } from '@/core/types/index.ts';
import { abortForceEventInputSchema } from '@/core/validators/index.ts';
import type {
  AbortForceEventDetails,
  AbortForceEventUseCaseInput,
} from './types.ts';

const log = logger.child({ module: 'ABORT_FORCE_EVENT_USECASE' });

/**
 * Use case murni untuk membatalkan agenda pemblokiran ruangan kampus (abort force event) (Fase 5.6).
 */
export async function abortForceEventUseCase(
  input: AbortForceEventUseCaseInput
): Promise<Result<AbortForceEventDetails, AppError>> {
  // 1. Validasi skema input dari user menggunakan Zod
  const parsed = abortForceEventInputSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const errorMessage = firstIssue?.message ?? 'Validasi input abort force event gagal.';
    log.warn('Validasi input abort force event gagal (Zod schema)', {
      input,
      issues: parsed.error.issues,
    });
    return err(
      new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, errorMessage, {
        issues: parsed.error.issues,
        hint: 'Gunakan format: !abort forceevent [id_event]\nContoh: !abort forceevent 5',
      })
    );
  }

  const validated = parsed.data;

  // 2. Auto-resolution dan verifikasi pengguna dari basis data
  const userResult = await findUserByJid(validated.userJid);
  if (!userResult.success) {
    log.error('Gagal mencari identitas pengguna di basis data', userResult.error);
    return userResult;
  }

  const user = userResult.data;
  if (!user) {
    log.warn(`Abort force event ditolak: JID "${validated.userJid}" belum terdaftar di whitelist.`);
    return err(
      new UnauthorizedError(
        'Nomor WhatsApp Anda belum terdaftar pada sistem whitelist SDP Undiksha. Harap hubungi staf/admin kampus.',
        { userJid: validated.userJid }
      )
    );
  }

  // 3. Otorisasi Peran: Hanya Staf atau Admin yang diizinkan
  const isStaffOrAdmin = user.role === 'staff' || user.role === 'admin';
  if (!isStaffOrAdmin) {
    log.warn(
      `Abort force event ditolak: Pengguna ${user.nama} (${user.jid}) bukan staf/admin [role: ${user.role}]`
    );
    return err(
      new AppError({
        code: ErrorCode.FORBIDDEN_ROLE,
        userMessage:
          'Perintah pembatalan agenda force event (!abort forceevent) hanya dapat dieksekusi oleh Staf atau Admin kampus.',
        metadata: { userJid: user.jid, role: user.role },
      })
    );
  }

  // 4. Eksekusi pembatalan secara atomik di database
  const abortResult = await abortForceEventImmediate({
    eventId: validated.eventId,
    userJid: user.jid,
    userName: user.nama,
    isStaffOrAdmin,
  });

  if (!abortResult.success) {
    return abortResult;
  }

  const aborted = abortResult.data;

  // 5. Invalidasi cache jadwal untuk seluruh ruangan terkait
  if (!aborted.isDuplicate) {
    for (const roomCode of aborted.roomCodes) {
      try {
        await invalidateScheduleCache(aborted.startDate, roomCode);
      } catch (cacheErr) {
        log.debug('Gagal melakukan invalidasi cache jadwal (non-fatal)', {
          error: String(cacheErr),
        });
      }
    }
  }

  const details: AbortForceEventDetails = Object.freeze({
    events: aborted.events,
    eventName: aborted.eventName,
    roomCodes: aborted.roomCodes,
    startDate: aborted.startDate,
    endDate: aborted.endDate,
    user,
    displacedKorti: aborted.displacedKorti,
    isDuplicate: aborted.isDuplicate,
  });

  log.info(
    `Berhasil mengeksekusi abort force event "${aborted.eventName}" untuk ruangan ${aborted.roomCodes.join(', ')} oleh ${user.nama}`
  );

  return ok(details);
}
