import { afterEach, describe, expect, it } from 'vitest';
import {
  currencySymbol,
  formatEur,
  formatEurPlain,
  formatPhone,
  normalizePhone,
  parseEur,
  setActiveCurrency,
} from './format';

describe('formatEur', () => {
  it('formats cents with a decimal comma and trailing €', () => {
    expect(formatEur(1215)).toBe('12,15 €');
    expect(formatEur(0)).toBe('0,00 €');
    expect(formatEur(5)).toBe('0,05 €');
  });

  it('groups thousands with dots', () => {
    expect(formatEur(123456)).toBe('1.234,56 €');
    expect(formatEur(123456789)).toBe('1.234.567,89 €');
  });

  it('formats negative amounts', () => {
    expect(formatEur(-1215)).toBe('-12,15 €');
  });

  it('rejects non-integer cents', () => {
    expect(() => formatEur(12.5)).toThrow();
  });
});

describe('formatEurPlain', () => {
  it('omits the currency symbol (clipboard form)', () => {
    expect(formatEurPlain(1215)).toBe('12,15');
    expect(formatEurPlain(100000)).toBe('1.000,00');
  });
});

describe('parseEur', () => {
  it('parses comma and dot decimals', () => {
    expect(parseEur('12,15')).toBe(1215);
    expect(parseEur('12.15')).toBe(1215);
    expect(parseEur('12')).toBe(1200);
    expect(parseEur('12,1')).toBe(1210);
    expect(parseEur('0,05')).toBe(5);
  });

  it('tolerates spaces and the € symbol', () => {
    expect(parseEur(' 12,15 € ')).toBe(1215);
    expect(parseEur('12,15 €')).toBe(1215);
  });

  it('round-trips formatted plain amounts up to 999,99 €', () => {
    for (const cents of [1, 99, 100, 1215, 99999]) {
      expect(parseEur(formatEurPlain(cents))).toBe(cents);
    }
  });

  it('rejects invalid input', () => {
    for (const bad of ['', 'abc', '12,155', '12,', ',15', '12,1,5', '-5', '1.234,56']) {
      expect(parseEur(bad)).toBeNull();
    }
  });
});

describe('normalizePhone', () => {
  it('accepts local and international Slovenian mobile numbers', () => {
    expect(normalizePhone('031 123 456')).toBe('031123456');
    expect(normalizePhone('031-123-456')).toBe('031123456');
    expect(normalizePhone('+386 31 123 456')).toBe('031123456');
    expect(normalizePhone('0038631123456')).toBe('031123456');
  });

  it('rejects invalid numbers', () => {
    for (const bad of ['', '12345', '031 123 45', '1311234567', '+386 01 123 45']) {
      expect(normalizePhone(bad)).toBeNull();
    }
  });
});

describe('formatPhone', () => {
  it('formats a normalized number in 3-3-3 groups', () => {
    expect(formatPhone('031123456')).toBe('031 123 456');
  });
});

describe('currency', () => {
  afterEach(() => setActiveCurrency('EUR')); // never leak into other suites

  it('defaults to EUR', () => {
    expect(currencySymbol()).toBe('€');
    expect(formatEur(1215)).toMatch(/^12,15\s€$/);
  });

  it('swaps only the symbol when the active currency changes (amount stays sl-SI)', () => {
    setActiveCurrency('USD');
    expect(currencySymbol()).toBe('$');
    expect(formatEur(123456)).toMatch(/^1\.234,56\s\$$/);
    setActiveCurrency('GBP');
    expect(formatEur(500)).toMatch(/^5,00\s£$/);
  });

  it('falls back to EUR for unknown/empty codes', () => {
    setActiveCurrency('XyZ');
    expect(formatEur(100)).toMatch(/^1,00\s€$/);
    setActiveCurrency(null);
    expect(formatEur(100)).toMatch(/^1,00\s€$/);
  });
});
