import { cleanRut, formatRut, getFirstSixDigits, validateRut } from './rut.utils';

describe('RUT utilities', () => {
  describe('cleanRut', () => {
    it('removes dots and dashes', () => {
      expect(cleanRut('12.345.678-9')).toBe('123456789');
      expect(cleanRut('12345678-9')).toBe('123456789');
    });

    it('returns lowercase k as uppercase', () => {
      expect(cleanRut('12.345.678-k')).toBe('12345678K');
    });
  });

  describe('formatRut', () => {
    it('formats as 12345678-9', () => {
      expect(formatRut('123456789')).toBe('12345678-9');
      expect(formatRut('12.345.678-9')).toBe('12345678-9');
    });

    it('returns single char unchanged', () => {
      expect(formatRut('1')).toBe('1');
    });
  });

  describe('getFirstSixDigits', () => {
    it('extracts first six digits', () => {
      expect(getFirstSixDigits('12.345.678-9')).toBe('123456');
      expect(getFirstSixDigits('1234567-8')).toBe('123456');
    });
  });

  describe('validateRut', () => {
    it('validates correct RUTs', () => {
      expect(validateRut('12.345.678-5')).toBe(true);
      expect(validateRut('1.234.567-4')).toBe(true);
      expect(validateRut('6-K')).toBe(true);
      expect(validateRut('76.543.21-6')).toBe(true);
    });

    it('rejects invalid RUTs', () => {
      expect(validateRut('12.345.678-9')).toBe(false);
      expect(validateRut('76543210-K')).toBe(false);
      expect(validateRut('123')).toBe(false);
      expect(validateRut('')).toBe(false);
    });
  });
});
