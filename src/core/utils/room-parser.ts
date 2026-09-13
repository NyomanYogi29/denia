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

/**
 * Melakukan parsing dan validasi sekumpulan kode ruangan SDP Undiksha (bisa berupa string dipisahkan koma atau array).
 * Mengembalikan array RoomInfo jika seluruh ruangan terdaftar, atau error jika ada yang tidak terdaftar / kosong.
 */
export function parseRoomCodes(
  raw: string | readonly string[]
): Result<readonly RoomInfo[]> {
  const codes = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? raw.split(/[,+]/)
      : [];

  const cleanedCodes = [
    ...new Set(
      codes
        .map((c) => (typeof c === 'string' ? c.trim().toUpperCase() : ''))
        .filter(Boolean)
    ),
  ];

  if (cleanedCodes.length === 0) {
    return err(
      new ValidationError(
        ErrorCode.INVALID_COMMAND_SYNTAX,
        'Daftar kode ruangan tidak boleh kosong.',
        { raw }
      )
    );
  }

  const invalidRooms: string[] = [];
  const validRooms: RoomInfo[] = [];

  for (const code of cleanedCodes) {
    if (!isValidRoomCode(code)) {
      invalidRooms.push(code);
    } else {
      validRooms.push(ROOM_MAP[code]!);
    }
  }

  if (invalidRooms.length > 0) {
    log.warn('Terdapat kode ruangan tidak valid pada daftar', { invalidRooms });
    return err(
      new NotFoundError(
        ErrorCode.ROOM_NOT_FOUND,
        `Ruangan berikut tidak terdaftar di sistem SDP Undiksha: ${invalidRooms.join(', ')}.`,
        { invalidRooms, raw }
      )
    );
  }

  return ok(Object.freeze(validRooms));
}

