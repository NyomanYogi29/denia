import {
  ROOM_MAP,
  isValidRoomCode,
  type RoomInfo,
} from '@/core/constants';
import { ok, err, type Result } from '@/core/types';
import { ValidationError, NotFoundError, ErrorCode } from '@/core/errors';
import { logger } from '@/core/logger';

const log = logger.child({ module: 'ROOM_PARSER' });

export interface ParsedRoom {
  readonly raw: string;
  readonly room: RoomInfo;
}

/**
 * Melakukan parsing dan validasi kode ruangan SDP Undiksha.
 * Mengembalikan objek ParsedRoom jika kode terdaftar, atau error jika tidak terdaftar / kosong.
 *
 * Contoh:
 * parseRoomCode('rak_4.1') -> ok({ raw: 'rak_4.1', room: { code: 'RAK_4.1', ... } })
 * parseRoomCode('INVALID') -> err(NotFoundError(ROOM_NOT_FOUND))
 */
export function parseRoomCode(raw: string): Result<ParsedRoom> {
  if (!raw || typeof raw !== 'string' || !raw.trim()) {
    return err(
      new ValidationError(ErrorCode.INVALID_COMMAND_SYNTAX, 'Kode ruangan tidak boleh kosong.', {
        raw,
      })
    );
  }

  const trimmed = raw.trim();
  const normalized = trimmed.toUpperCase();

  if (!isValidRoomCode(normalized)) {
    log.warn('Kode ruangan tidak ditemukan dalam daftar SDP', { raw: trimmed, normalized });
    return err(
      new NotFoundError(
        ErrorCode.ROOM_NOT_FOUND,
        `Ruangan "${trimmed}" tidak terdaftar di sistem SDP Undiksha.`,
        { raw: trimmed, normalized }
      )
    );
  }

  const roomInfo = ROOM_MAP[normalized]!;
  const parsedRoom: ParsedRoom = Object.freeze({
    raw: trimmed,
    room: roomInfo,
  });

  log.debug('Berhasil mem-parsing kode ruangan', { roomCode: roomInfo.code });
  return ok(parsedRoom);
}
