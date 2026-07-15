import { describe, expect, it } from 'vitest';
import { MAX_BASE64_LENGTH, sanitizeResult, validateRequest } from './_validate';

describe('validateRequest', () => {
  const good = { image: 'aGVsbG8=', mediaType: 'image/jpeg' };

  it('accepts a valid base64 payload', () => {
    expect(validateRequest(good)).toEqual(good);
    expect(validateRequest({ ...good, mediaType: 'image/png' })).not.toBeNull();
    expect(validateRequest({ ...good, mediaType: 'image/webp' })).not.toBeNull();
  });

  it('rejects malformed bodies', () => {
    expect(validateRequest(null)).toBeNull();
    expect(validateRequest('x')).toBeNull();
    expect(validateRequest({})).toBeNull();
    expect(validateRequest({ image: 42, mediaType: 'image/jpeg' })).toBeNull();
    expect(validateRequest({ ...good, mediaType: 'image/gif' })).toBeNull();
    expect(validateRequest({ ...good, image: '' })).toBeNull();
    expect(validateRequest({ ...good, image: 'not base64!!' })).toBeNull();
  });

  it('flags oversized images as too_large', () => {
    expect(validateRequest({ ...good, image: 'A'.repeat(MAX_BASE64_LENGTH + 1) })).toBe(
      'too_large',
    );
  });
});

describe('sanitizeResult', () => {
  it('passes through clean items and total', () => {
    expect(
      sanitizeResult({
        items: [{ label: 'Pica', quantity: 2, totalCents: 1900 }],
        totalCents: 2500,
      }),
    ).toEqual({
      items: [{ label: 'Pica', quantity: 2, totalCents: 1900 }],
      totalCents: 2500,
    });
  });

  it('drops invalid entries and clamps fields', () => {
    const result = sanitizeResult({
      items: [
        { label: '  Pivo  ', quantity: 500, totalCents: 320 },
        { label: '', quantity: 1, totalCents: 100 },
        { label: 'Float', quantity: 1, totalCents: 12.5 },
        { label: 'Negative', quantity: 1, totalCents: -5 },
        { label: 'NoQuantity', totalCents: 800 },
        { label: 'X'.repeat(200), quantity: 1, totalCents: 100 },
        'garbage',
      ],
      totalCents: 'x',
    });
    expect(result).not.toBeNull();
    expect(result!.items).toEqual([
      { label: 'Pivo', quantity: 99, totalCents: 320 },
      { label: 'NoQuantity', quantity: 1, totalCents: 800 },
      { label: 'X'.repeat(80), quantity: 1, totalCents: 100 },
    ]);
    expect(result!.totalCents).toBeNull();
  });

  it('caps the item count at 100', () => {
    const items = Array.from({ length: 150 }, (_, i) => ({
      label: `i${i}`,
      quantity: 1,
      totalCents: 100,
    }));
    expect(sanitizeResult({ items, totalCents: null })!.items).toHaveLength(100);
  });

  it('returns null for unusable shapes, empty items for non-receipts', () => {
    expect(sanitizeResult(null)).toBeNull();
    expect(sanitizeResult({ totalCents: 100 })).toBeNull();
    expect(sanitizeResult({ items: [], totalCents: null })).toEqual({
      items: [],
      totalCents: null,
    });
  });
});
