/**
 * Kamus Ruangan Kampus SDP Undiksha
 */

export interface RoomInfo {
  readonly code: string;
  readonly name: string;
  readonly building: string;
  readonly floor: number;
  readonly capacity?: number;
  readonly description?: string;
}

/**
 * Daftar seluruh ruangan yang terdaftar di SDP Undiksha
 */
export const ROOM_LIST: readonly RoomInfo[] = Object.freeze([
  // Lantai 1 Gedung R.A. Kartini
  Object.freeze({ code: 'RAK_1.1', name: 'Ruang 1.1', building: 'Gedung R.A. Kartini', floor: 1, capacity: 40 }),
  Object.freeze({ code: 'RAK_1.2', name: 'Ruang 1.2', building: 'Gedung R.A. Kartini', floor: 1, capacity: 40 }),
  Object.freeze({ code: 'RAK_1.3', name: 'Ruang 1.3', building: 'Gedung R.A. Kartini', floor: 1, capacity: 40 }),
  Object.freeze({ code: 'RAK_1.4', name: 'Ruang 1.4', building: 'Gedung R.A. Kartini', floor: 1, capacity: 17 }),

  // Lantai 2 Gedung R.A. Kartini
  Object.freeze({ code: 'RAK_2.1', name: 'Ruang 2.1', building: 'Gedung R.A. Kartini', floor: 2, capacity: 40 }),
  Object.freeze({ code: 'RAK_2.2', name: 'Ruang 2.2', building: 'Gedung R.A. Kartini', floor: 2, capacity: 40 }),
  Object.freeze({ code: 'RAK_2.3', name: 'Ruang 2.3', building: 'Gedung R.A. Kartini', floor: 2, capacity: 40 }),
  Object.freeze({ code: 'RAK_2.4', name: 'Ruang 2.4', building: 'Gedung R.A. Kartini', floor: 2, capacity: 17 }),

  // Lantai 3 Gedung R.A. Kartini
  Object.freeze({ code: 'RAK_3.1', name: 'Ruang 3.1', building: 'Gedung R.A. Kartini', floor: 3, capacity: 40 }),
  Object.freeze({ code: 'RAK_3.2', name: 'Ruang 3.2', building: 'Gedung R.A. Kartini', floor: 3, capacity: 40 }),
  Object.freeze({ code: 'RAK_3.3', name: 'Ruang 3.3', building: 'Gedung R.A. Kartini', floor: 3, capacity: 40 }),
  Object.freeze({ code: 'RAK_3.4', name: 'Ruang 3.4', building: 'Gedung R.A. Kartini', floor: 3, capacity: 17 }),

  // Lantai 4 Gedung R.A. Kartini
  Object.freeze({ code: 'RAK_4.1', name: 'Ruang 4.1', building: 'Gedung R.A. Kartini', floor: 4, capacity: 40 }),
  Object.freeze({ code: 'RAK_4.2', name: 'Ruang 4.2', building: 'Gedung R.A. Kartini', floor: 4, capacity: 40 }),
  Object.freeze({ code: 'RAK_4.3', name: 'Ruang 4.3', building: 'Gedung R.A. Kartini', floor: 4, capacity: 40 }),
  Object.freeze({ code: 'RAK_4.4', name: 'Ruang 4.4', building: 'Gedung R.A. Kartini', floor: 4, capacity: 17 }),

  // Lantai 2 Gedung Ki Hadjar Dewantara
  Object.freeze({ code: 'KHD_2.2', name: 'Ruang 2.2', building: 'Gedung Ki Hadjar Dewantara', floor: 2, capacity: 40 }),
  Object.freeze({ code: 'KHD_2.3', name: 'Ruang 2.3', building: 'Gedung Ki Hadjar Dewantara', floor: 2, capacity: 40 }),
  Object.freeze({ code: 'KHD_2.4', name: 'Ruang 2.4', building: 'Gedung Ki Hadjar Dewantara', floor: 2, capacity: 17 }),

  // Lantai 3 Gedung Ki Hadjar Dewantara
  Object.freeze({ code: 'KHD_3.2', name: 'Ruang 3.2', building: 'Gedung Ki Hadjar Dewantara', floor: 3, capacity: 40 }),
  Object.freeze({ code: 'KHD_3.3', name: 'Ruang 3.3', building: 'Gedung Ki Hadjar Dewantara', floor: 3, capacity: 40 }),
  Object.freeze({ code: 'KHD_3.4', name: 'Ruang 3.4', building: 'Gedung Ki Hadjar Dewantara', floor: 3, capacity: 17 }),

  // Lantai 4 Gedung Ki Hadjar Dewantara
  Object.freeze({ code: 'KHD_4.2', name: 'Ruang 4.2', building: 'Gedung Ki Hadjar Dewantara', floor: 4, capacity: 40 }),
  Object.freeze({ code: 'KHD_4.3', name: 'Ruang 4.3', building: 'Gedung Ki Hadjar Dewantara', floor: 4, capacity: 40 }),
  Object.freeze({ code: 'KHD_4.4', name: 'Ruang 4.4', building: 'Gedung Ki Hadjar Dewantara', floor: 4, capacity: 17 }),

  // Fasilitas Utama / Serbaguna
  Object.freeze({
    code: 'AUDITORIUM',
    name: 'Auditorium SDP',
    building: 'Gedung Utama',
    floor: 1,
    capacity: 200,
    description: 'Aula serbaguna kegiatan dan seminar kampus',
  }),
  Object.freeze({
    code: 'HYBRID',
    name: 'Ruang Hybrid 1.2',
    building: 'Gedung Ki Hadjar Dewantara',
    floor: 1,
    capacity: 25,
    description: 'Perkuliahan hybrid atau ruang meeting direksi',
  }),
]);

/**
 * Array daftar kode ruangan yang terdaftar
 */
export const ROOM_CODES = Object.freeze(ROOM_LIST.map((room) => room.code));

export type RoomCode = (typeof ROOM_CODES)[number];

/**
 * Peta kamus kode ruangan ke objek RoomInfo untuk akses cepat O(1)
 */
export const ROOM_MAP: Readonly<Record<string, RoomInfo>> = Object.freeze(
  ROOM_LIST.reduce<Record<string, RoomInfo>>((acc, room) => {
    acc[room.code] = room;
    return acc;
  }, {})
);

/**
 * Type guard untuk memeriksa apakah sebuah string adalah kode ruangan valid.
 */
export function isValidRoomCode(code: string): code is RoomCode {
  if (typeof code !== 'string') return false;
  return Object.hasOwn(ROOM_MAP, code.toUpperCase());
}

/**
 * Mengambil informasi ruangan berdasarkan kode (case-insensitive).
 */
export function getRoomInfo(code: string): RoomInfo | undefined {
  if (typeof code !== 'string') return undefined;
  const normalized = code.toUpperCase();
  return ROOM_MAP[normalized];
}
