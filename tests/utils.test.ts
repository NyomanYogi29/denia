import { describe, expect, it } from 'bun:test';
import {
  parseSlotString,
  validateSlotCharacters,
  validateSlotContinuity,
  validateSlotLimit,
  formatSlotTimeRange,
  parseDateString,
  isoToDateString,
  formatIndonesianDate,
  calculateLeadTimeDays,
  validateBookingLeadTime,
  parseRoomCode,
  DEFAULT_COMMAND_PREFIX,
  extractCommand,
  hasCommandPrefix,
  isCommandMessage,
  parseCommand,
} from '@/core/utils';
import { ErrorCode } from '@/core/errors';

describe('Utils Module', () => {
  describe('validateSlotCharacters', () => {
    it('should validate valid slot characters and normalize to uppercase', () => {
      const res1 = validateSlotCharacters('DEF');
      expect(res1.success).toBe(true);
      if (res1.success) {
        expect(res1.data).toEqual(['D', 'E', 'F']);
      }

      const res2 = validateSlotCharacters('abc');
      expect(res2.success).toBe(true);
      if (res2.success) {
        expect(res2.data).toEqual(['A', 'B', 'C']);
      }
    });

    it('should reject empty or whitespace strings with INVALID_SLOT_FORMAT', () => {
      const empty = validateSlotCharacters('');
      expect(empty.success).toBe(false);
      if (!empty.success) {
        expect(empty.error.code).toBe(ErrorCode.INVALID_SLOT_FORMAT);
      }

      const spaces = validateSlotCharacters('   ');
      expect(spaces.success).toBe(false);
      if (!spaces.success) {
        expect(spaces.error.code).toBe(ErrorCode.INVALID_SLOT_FORMAT);
      }
    });

    it('should reject invalid characters beyond A-O or non-alphabetics', () => {
      const invalidChars = ['P', 'Z', 'DEF1', 'AB-C', 'A B C'];
      for (const raw of invalidChars) {
        const res = validateSlotCharacters(raw);
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error.code).toBe(ErrorCode.INVALID_SLOT_FORMAT);
        }
      }
    });
  });

  describe('validateSlotContinuity', () => {
    it('should accept single slot or contiguous sequences', () => {
      expect(validateSlotContinuity(['D']).success).toBe(true);
      expect(validateSlotContinuity(['D', 'E', 'F']).success).toBe(true);
      expect(validateSlotContinuity(['A', 'B']).success).toBe(true);
      expect(validateSlotContinuity(['L', 'M', 'N', 'O']).success).toBe(true);
    });

    it('should reject non-contiguous or jumping slot sequences with INVALID_SLOT_SEQUENCE', () => {
      const nonContiguous = [
        ['A', 'D', 'F'],
        ['A', 'C'],
        ['D', 'F'],
      ] as const;

      for (const slots of nonContiguous) {
        const res = validateSlotContinuity(slots);
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error.code).toBe(ErrorCode.INVALID_SLOT_SEQUENCE);
        }
      }
    });

    it('should reject reversed order or duplicated slots', () => {
      const invalidOrder = [
        ['F', 'E', 'D'],
        ['B', 'A'],
        ['D', 'D'],
      ] as const;

      for (const slots of invalidOrder) {
        const res = validateSlotContinuity(slots);
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error.code).toBe(ErrorCode.INVALID_SLOT_SEQUENCE);
        }
      }
    });
  });

  describe('validateSlotLimit', () => {
    it('should accept slot counts within min and max limits', () => {
      expect(validateSlotLimit(['A']).success).toBe(true);
      expect(validateSlotLimit(['A', 'B', 'C']).success).toBe(true);
      expect(validateSlotLimit(['A', 'B', 'C', 'D']).success).toBe(true);
    });

    it('should reject counts exceeding max limit with SLOT_LIMIT_EXCEEDED', () => {
      const fiveSlots = ['A', 'B', 'C', 'D', 'E'] as const;
      const res = validateSlotLimit(fiveSlots);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe(ErrorCode.SLOT_LIMIT_EXCEEDED);
      }
    });

    it('should respect custom min and max options', () => {
      const twoSlots = ['A', 'B'] as const;
      const res = validateSlotLimit(twoSlots, 3, 4);
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe(ErrorCode.INVALID_SLOT_FORMAT);
      }
    });
  });

  describe('formatSlotTimeRange', () => {
    it('should format single slot and multi-slot time ranges correctly', () => {
      expect(formatSlotTimeRange(['A'])).toBe('07:30 - 08:20');
      expect(formatSlotTimeRange(['D', 'E', 'F'])).toBe('10:30 - 13:20');
      expect(formatSlotTimeRange(['M', 'N', 'O'])).toBe('19:30 - 22:00');
      expect(formatSlotTimeRange([])).toBe('');
    });
  });

  describe('parseSlotString (Integrated)', () => {
    it('should parse valid slot string successfully with frozen parsed object', () => {
      const res = parseSlotString('DEF');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.raw).toBe('DEF');
        expect(res.data.slots).toEqual(['D', 'E', 'F']);
        expect(res.data.totalSks).toBe(3);
        expect(res.data.startTime).toBe('10:30');
        expect(res.data.endTime).toBe('13:20');
        expect(res.data.timeRange).toBe('10:30 - 13:20');

        expect(Object.isFrozen(res.data)).toBe(true);
        expect(Object.isFrozen(res.data.slots)).toBe(true);
      }
    });

    it('should handle case-insensitivity seamlessly (e.g. "def" -> DEF)', () => {
      const res = parseSlotString('def');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.raw).toBe('DEF');
        expect(res.data.slots).toEqual(['D', 'E', 'F']);
      }
    });

    it('should reject invalid characters with INVALID_SLOT_FORMAT', () => {
      const res = parseSlotString('D1F');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe(ErrorCode.INVALID_SLOT_FORMAT);
      }
    });

    it('should reject non-contiguous slot strings with INVALID_SLOT_SEQUENCE', () => {
      const res = parseSlotString('ADF');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe(ErrorCode.INVALID_SLOT_SEQUENCE);
      }
    });

    it('should reject bookings exceeding max duration limit with SLOT_LIMIT_EXCEEDED', () => {
      const res = parseSlotString('ABCDE'); // 5 SKS (> 4)
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe(ErrorCode.SLOT_LIMIT_EXCEEDED);
      }
    });
  });

  describe('Date Parser & Validator', () => {
    // Fixed reference date: 2026-09-03 (08:00 WITA)
    const fixedReferenceDate = new Date('2026-09-03T00:00:00.000Z');

    it('should parse valid DD/MM/YYYY date string to ISO YYYY-MM-DD', () => {
      const res = parseDateString('10/09/2026', { referenceDate: fixedReferenceDate });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.raw).toBe('10/09/2026');
        expect(res.data.iso).toBe('2026-09-10');
        expect(res.data.day).toBe(10);
        expect(res.data.month).toBe(9);
        expect(res.data.year).toBe(2026);
        expect(Object.isFrozen(res.data)).toBe(true);
      }
    });

    it('should accept current date (same day booking)', () => {
      const res = parseDateString('03/09/2026', { referenceDate: fixedReferenceDate });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.iso).toBe('2026-09-03');
      }
    });

    it('should reject past dates with PAST_DATE_NOT_ALLOWED by default', () => {
      const res = parseDateString('01/09/2026', { referenceDate: fixedReferenceDate });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe(ErrorCode.PAST_DATE_NOT_ALLOWED);
      }
    });

    it('should allow past dates when allowPast is set to true', () => {
      const res = parseDateString('01/09/2026', { allowPast: true, referenceDate: fixedReferenceDate });
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data.iso).toBe('2026-09-01');
      }
    });

    it('should validate calendar constraints correctly (leap year and month days)', () => {
      // 2024 is a leap year -> 29/02/2024 is valid
      const leapValid = parseDateString('29/02/2024', { allowPast: true });
      expect(leapValid.success).toBe(true);

      // 2025 is NOT a leap year -> 29/02/2025 is invalid
      const leapInvalid = parseDateString('29/02/2025', { allowPast: true });
      expect(leapInvalid.success).toBe(false);
      if (!leapInvalid.success) {
        expect(leapInvalid.error.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      }

      // 31st of April does not exist (April has 30 days)
      const april31 = parseDateString('31/04/2026', { allowPast: true });
      expect(april31.success).toBe(false);
      if (!april31.success) {
        expect(april31.error.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      }
    });

    it('should reject malformed date strings with INVALID_DATE_FORMAT', () => {
      const malformed = ['', '10-09-2026', '2026/09/10', 'not-a-date', '32/01/2026', '10/13/2026'];
      for (const input of malformed) {
        const res = parseDateString(input);
        expect(res.success).toBe(false);
        if (!res.success) {
          expect(res.error.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
        }
      }
    });

    it('should convert ISO date to DD/MM/YYYY with isoToDateString', () => {
      const res = isoToDateString('2026-09-10');
      expect(res.success).toBe(true);
      if (res.success) {
        expect(res.data).toBe('10/09/2026');
      }

      const invalidIso = isoToDateString('invalid-iso');
      expect(invalidIso.success).toBe(false);
    });

    it('should format ISO date to Indonesian readable format', () => {
      const formatted = formatIndonesianDate('2026-09-10');
      expect(formatted).toContain('September');
      expect(formatted).toContain('2026');
    });
  });

  describe('Lead Time & H-1 Booking Rule Validator (Spesifikasi V2)', () => {
    const fixedToday = new Date('2026-09-07T08:00:00+08:00'); // WITA: 2026-09-07

    it('should calculate calendar lead time days accurately', () => {
      // Same day (hari H)
      expect(calculateLeadTimeDays('2026-09-07', { referenceDate: fixedToday })).toBe(0);

      // Tomorrow (H-1)
      expect(calculateLeadTimeDays('2026-09-08', { referenceDate: fixedToday })).toBe(1);

      // 5 days ahead
      expect(calculateLeadTimeDays('2026-09-12', { referenceDate: fixedToday })).toBe(5);

      // Past day
      expect(calculateLeadTimeDays('2026-09-06', { referenceDate: fixedToday })).toBe(-1);
    });

    it('should allow Korti to book rooms with minimum H-1 lead time (tomorrow or future dates)', () => {
      // Besok (H-1)
      const resTomorrow = validateBookingLeadTime('2026-09-08', 'korti', { referenceDate: fixedToday });
      expect(resTomorrow.success).toBe(true);
      if (resTomorrow.success) {
        expect(resTomorrow.data.leadTimeDays).toBe(1);
        expect(resTomorrow.data.isAllowed).toBe(true);
        expect(resTomorrow.data.bookingIso).toBe('2026-09-08');
      }

      // DD/MM/YYYY format 1 bulan mendatang (edge case kuliah pengganti/ujian)
      const resNextMonth = validateBookingLeadTime('07/10/2026', 'korti', { referenceDate: fixedToday });
      expect(resNextMonth.success).toBe(true);
      if (resNextMonth.success) {
        expect(resNextMonth.data.leadTimeDays).toBe(30);
        expect(resNextMonth.data.isAllowed).toBe(true);
        expect(resNextMonth.data.bookingIso).toBe('2026-10-07');
      }
    });

    it('should reject Korti booking on the same day (hari H) with INVALID_BOOKING_LEAD_TIME', () => {
      const resSameDayIso = validateBookingLeadTime('2026-09-07', 'korti', { referenceDate: fixedToday });
      expect(resSameDayIso.success).toBe(false);
      if (!resSameDayIso.success) {
        expect(resSameDayIso.error.code).toBe(ErrorCode.INVALID_BOOKING_LEAD_TIME);
        expect(resSameDayIso.error.userMessage).toContain('minimal H-1');
      }

      const resSameDayDd = validateBookingLeadTime('07/09/2026', 'korti', { referenceDate: fixedToday });
      expect(resSameDayDd.success).toBe(false);
      if (!resSameDayDd.success) {
        expect(resSameDayDd.error.code).toBe(ErrorCode.INVALID_BOOKING_LEAD_TIME);
      }
    });

    it('should allow Staff and Admin to book on the same day (hari H)', () => {
      const resStaff = validateBookingLeadTime('2026-09-07', 'staff', { referenceDate: fixedToday });
      expect(resStaff.success).toBe(true);
      if (resStaff.success) {
        expect(resStaff.data.leadTimeDays).toBe(0);
        expect(resStaff.data.isAllowed).toBe(true);
      }

      const resAdmin = validateBookingLeadTime('07/09/2026', 'admin', { referenceDate: fixedToday });
      expect(resAdmin.success).toBe(true);
      if (resAdmin.success) {
        expect(resAdmin.data.leadTimeDays).toBe(0);
        expect(resAdmin.data.isAllowed).toBe(true);
      }
    });

    it('should reject booking for past dates with PAST_DATE_NOT_ALLOWED for all roles', () => {
      const resPastKorti = validateBookingLeadTime('2026-09-06', 'korti', { referenceDate: fixedToday });
      expect(resPastKorti.success).toBe(false);
      if (!resPastKorti.success) {
        expect(resPastKorti.error.code).toBe(ErrorCode.PAST_DATE_NOT_ALLOWED);
      }

      const resPastStaff = validateBookingLeadTime('05/09/2026', 'staff', { referenceDate: fixedToday });
      expect(resPastStaff.success).toBe(false);
      if (!resPastStaff.success) {
        expect(resPastStaff.error.code).toBe(ErrorCode.PAST_DATE_NOT_ALLOWED);
      }
    });

    it('should reject invalid date format with INVALID_DATE_FORMAT', () => {
      const resInvalid = validateBookingLeadTime('not-a-date', 'korti', { referenceDate: fixedToday });
      expect(resInvalid.success).toBe(false);
      if (!resInvalid.success) {
        expect(resInvalid.error.code).toBe(ErrorCode.INVALID_DATE_FORMAT);
      }
    });
  });

  describe('Room Parser & Validator', () => {
    it('should parse valid registered room code case-insensitively', () => {
      const res1 = parseRoomCode('rak_4.1');
      expect(res1.success).toBe(true);
      if (res1.success) {
        expect(res1.data.raw).toBe('rak_4.1');
        expect(res1.data.room.code).toBe('RAK_4.1');
        expect(res1.data.room.building).toBe('Gedung R.A. Kartini');
        expect(res1.data.room.floor).toBe(4);
        expect(res1.data.room.capacity).toBe(40);
        expect(Object.isFrozen(res1.data)).toBe(true);
      }

      const resKhd = parseRoomCode('khd_2.4');
      expect(resKhd.success).toBe(true);
      if (resKhd.success) {
        expect(resKhd.data.room.code).toBe('KHD_2.4');
        expect(resKhd.data.room.capacity).toBe(17);
      }

      const resHybrid = parseRoomCode('HYBRID');
      expect(resHybrid.success).toBe(true);
      if (resHybrid.success) {
        expect(resHybrid.data.room.code).toBe('HYBRID');
        expect(resHybrid.data.room.capacity).toBe(25);
      }
    });

    it('should reject non-existent rooms with ROOM_NOT_FOUND', () => {
      const res = parseRoomCode('ROOM_XYZ');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe(ErrorCode.ROOM_NOT_FOUND);
      }
    });

    it('should reject empty room input with INVALID_COMMAND_SYNTAX', () => {
      const res = parseRoomCode('   ');
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
      }
    });
  });

  describe('Command Prefix Filter & Parser (src/core/utils/prefix.ts)', () => {
    describe('hasCommandPrefix', () => {
      it('should return true when text starts with default prefix "!"', () => {
        expect(hasCommandPrefix('!pinjam RAK_2.1 10/09/2026 DEF')).toBe(true);
        expect(hasCommandPrefix('!info')).toBe(true);
        expect(hasCommandPrefix('!batal RAK_1.1 11/09/2026 AB')).toBe(true);
        expect(hasCommandPrefix('!force RAK_2.1 10/09/2026 DEF Kuliah Pengganti')).toBe(true);
      });

      it('should handle leading whitespace correctly before prefix', () => {
        expect(hasCommandPrefix('   !pinjam RAK_2.1')).toBe(true);
        expect(hasCommandPrefix('\n\t!info')).toBe(true);
      });

      it('should return false when text does not start with prefix', () => {
        expect(hasCommandPrefix('Halo bot')).toBe(false);
        expect(hasCommandPrefix('pinjam RAK_2.1')).toBe(false);
        expect(hasCommandPrefix('/pinjam')).toBe(false);
        expect(hasCommandPrefix('.info')).toBe(false);
      });

      it('should return false for empty or non-string inputs', () => {
        expect(hasCommandPrefix('')).toBe(false);
        expect(hasCommandPrefix('   ')).toBe(false);
        expect(hasCommandPrefix(null)).toBe(false);
        expect(hasCommandPrefix(undefined)).toBe(false);
      });

      it('should support custom prefix when provided', () => {
        expect(hasCommandPrefix('#pinjam', '#')).toBe(true);
        expect(hasCommandPrefix('!pinjam', '#')).toBe(false);
      });
    });

    describe('isCommandMessage', () => {
      it('should return true for valid command strings with prefix and command name', () => {
        expect(isCommandMessage('!pinjam RAK_2.1 10/09/2026 DEF')).toBe(true);
        expect(isCommandMessage('!info')).toBe(true);
        expect(isCommandMessage('!batal')).toBe(true);
        expect(isCommandMessage('!force')).toBe(true);
      });

      it('should return false for isolated prefix character without command name', () => {
        expect(isCommandMessage('!')).toBe(false);
        expect(isCommandMessage('!   ')).toBe(false);
        expect(isCommandMessage('  !  ')).toBe(false);
      });

      it('should return false for regular messages or empty inputs', () => {
        expect(isCommandMessage('Halo Denia')).toBe(false);
        expect(isCommandMessage('')).toBe(false);
        expect(isCommandMessage(null)).toBe(false);
        expect(isCommandMessage(undefined)).toBe(false);
      });
    });

    describe('extractCommand', () => {
      it('should extract command name and arguments into ParsedCommand object', () => {
        const parsed = extractCommand('!pinjam RAK_2.1 10/09/2026 DEF');

        expect(parsed).not.toBeNull();
        expect(parsed?.prefix).toBe('!');
        expect(parsed?.command).toBe('pinjam');
        expect(parsed?.args).toEqual(['RAK_2.1', '10/09/2026', 'DEF']);
        expect(parsed?.rawArgs).toBe('RAK_2.1 10/09/2026 DEF');
        expect(parsed?.rawText).toBe('!pinjam RAK_2.1 10/09/2026 DEF');
      });

      it('should normalize command name to lowercase while preserving rawArgs case', () => {
        const parsed = extractCommand('!PINJAM Rak_2.1 10/09/2026 def');

        expect(parsed).not.toBeNull();
        expect(parsed?.command).toBe('pinjam');
        expect(parsed?.args[0]).toBe('Rak_2.1');
        expect(parsed?.rawArgs).toBe('Rak_2.1 10/09/2026 def');
      });

      it('should handle commands without arguments (e.g. !info)', () => {
        const parsed = extractCommand('!info');

        expect(parsed).not.toBeNull();
        expect(parsed?.command).toBe('info');
        expect(parsed?.args).toEqual([]);
        expect(parsed?.rawArgs).toBe('');
      });

      it('should handle multiple consecutive whitespace characters properly', () => {
        const parsed = extractCommand('   !force   RAK_1.1    15/09/2026   DEF   Acara Kampus   ');

        expect(parsed).not.toBeNull();
        expect(parsed?.command).toBe('force');
        expect(parsed?.args).toEqual(['RAK_1.1', '15/09/2026', 'DEF', 'Acara', 'Kampus']);
        expect(parsed?.rawArgs).toBe('RAK_1.1    15/09/2026   DEF   Acara Kampus');
      });

      it('should return null for non-command strings', () => {
        expect(extractCommand('Halo min')).toBeNull();
        expect(extractCommand('!')).toBeNull();
        expect(extractCommand('')).toBeNull();
        expect(extractCommand(null)).toBeNull();
      });

      it('should return frozen immutable ParsedCommand object', () => {
        const parsed = extractCommand('!pinjam RAK_2.1');
        expect(parsed).not.toBeNull();
        expect(Object.isFrozen(parsed)).toBe(true);
        expect(Object.isFrozen(parsed?.args)).toBe(true);
      });
    });

    describe('parseCommand (Result Pattern)', () => {
      it('should return ok result for valid command string', () => {
        const result = parseCommand('!pinjam RAK_2.1 10/09/2026 DEF');

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.prefix).toBe(DEFAULT_COMMAND_PREFIX);
          expect(result.data.command).toBe('pinjam');
          expect(result.data.args).toEqual(['RAK_2.1', '10/09/2026', 'DEF']);
        }
      });

      it('should return Err with ValidationError when text is empty or whitespace', () => {
        const result = parseCommand('');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
          expect(result.error.userMessage).toContain('tidak boleh kosong');
        }

        const whitespaceResult = parseCommand('   ');
        expect(whitespaceResult.success).toBe(false);
      });

      it('should return Err with ValidationError when prefix is missing', () => {
        const result = parseCommand('pinjam RAK_2.1');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
          expect(result.error.userMessage).toContain('harus diawali dengan prefix perintah "!"');
        }
      });

      it('should return Err with ValidationError when text only contains prefix', () => {
        const result = parseCommand('!');
        expect(result.success).toBe(false);
        if (!result.success) {
          expect(result.error.code).toBe(ErrorCode.INVALID_COMMAND_SYNTAX);
          expect(result.error.userMessage).toContain('Nama perintah tidak boleh kosong setelah prefix');
        }
      });

      it('should support custom prefix in parseCommand', () => {
        const result = parseCommand('#batal RAK_1.1', '#');
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.prefix).toBe('#');
          expect(result.data.command).toBe('batal');
        }
      });
    });
  });
});
