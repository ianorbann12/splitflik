import { describe, expect, it } from 'vitest';
import type { Expense, SplitSpec } from '../types';
import { computeShares } from './shares';

function mkExpense(amountCents: number, split: SplitSpec): Expense {
  return {
    id: 'e1',
    outingId: 'o1',
    groupId: 'g1',
    description: 'test',
    amountCents,
    payerId: 'a',
    split,
    cycle: 1,
    createdAt: 0,
  };
}

function sum(shares: Map<string, number>): number {
  return [...shares.values()].reduce((s, v) => s + v, 0);
}

// Deterministic PRNG so property tests are reproducible.
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('equal split', () => {
  it('splits 10,00 € among 3 as 334/333/333 with the extra cent to the lowest id', () => {
    const shares = computeShares(
      mkExpense(1000, { mode: 'equal', participantIds: ['c', 'a', 'b'] }),
    );
    expect(shares.get('a')).toBe(334);
    expect(shares.get('b')).toBe(333);
    expect(shares.get('c')).toBe(333);
  });

  it('distributes remainder cents by id order regardless of input order', () => {
    const shares = computeShares(
      mkExpense(1001, { mode: 'equal', participantIds: ['d', 'b', 'a', 'c'] }),
    );
    expect(shares.get('a')).toBe(251);
    expect(shares.get('b')).toBe(250);
    expect(shares.get('c')).toBe(250);
    expect(shares.get('d')).toBe(250);
  });

  it('handles a single participant', () => {
    const shares = computeShares(mkExpense(999, { mode: 'equal', participantIds: ['a'] }));
    expect(shares.get('a')).toBe(999);
  });

  it('rejects empty and duplicate participants', () => {
    expect(() =>
      computeShares(mkExpense(100, { mode: 'equal', participantIds: [] })),
    ).toThrow();
    expect(() =>
      computeShares(mkExpense(100, { mode: 'equal', participantIds: ['a', 'a'] })),
    ).toThrow();
  });

  it('property: shares always sum to the amount', () => {
    const rnd = lcg(42);
    for (let i = 0; i < 300; i++) {
      const amount = 1 + Math.floor(rnd() * 100000);
      const n = 1 + Math.floor(rnd() * 8);
      const ids = Array.from({ length: n }, (_, k) => `p${k}`);
      const shares = computeShares(mkExpense(amount, { mode: 'equal', participantIds: ids }));
      expect(sum(shares)).toBe(amount);
      expect(shares.size).toBe(n);
    }
  });
});

describe('exact split', () => {
  it('returns the entries as given when they sum to the amount', () => {
    const shares = computeShares(
      mkExpense(1000, {
        mode: 'exact',
        entries: [
          { personId: 'a', amountCents: 700 },
          { personId: 'b', amountCents: 300 },
        ],
      }),
    );
    expect(shares.get('a')).toBe(700);
    expect(shares.get('b')).toBe(300);
  });

  it('allows a zero entry', () => {
    const shares = computeShares(
      mkExpense(500, {
        mode: 'exact',
        entries: [
          { personId: 'a', amountCents: 500 },
          { personId: 'b', amountCents: 0 },
        ],
      }),
    );
    expect(shares.get('b')).toBe(0);
  });

  it('rejects a sum mismatch, negative entries, and duplicates', () => {
    expect(() =>
      computeShares(
        mkExpense(1000, { mode: 'exact', entries: [{ personId: 'a', amountCents: 999 }] }),
      ),
    ).toThrow();
    expect(() =>
      computeShares(
        mkExpense(100, {
          mode: 'exact',
          entries: [
            { personId: 'a', amountCents: 200 },
            { personId: 'b', amountCents: -100 },
          ],
        }),
      ),
    ).toThrow();
    expect(() =>
      computeShares(
        mkExpense(200, {
          mode: 'exact',
          entries: [
            { personId: 'a', amountCents: 100 },
            { personId: 'a', amountCents: 100 },
          ],
        }),
      ),
    ).toThrow();
  });
});

describe('weights split', () => {
  it('splits 10,00 € with weights 2:1 as 667/333 (largest remainder)', () => {
    const shares = computeShares(
      mkExpense(1000, {
        mode: 'weights',
        entries: [
          { personId: 'a', weight: 2 },
          { personId: 'b', weight: 1 },
        ],
      }),
    );
    expect(shares.get('a')).toBe(667);
    expect(shares.get('b')).toBe(333);
  });

  it('breaks remainder ties by id ascending', () => {
    // 1,01 € with equal weights: both remainders tie, lower id gets the cent.
    const shares = computeShares(
      mkExpense(101, {
        mode: 'weights',
        entries: [
          { personId: 'b', weight: 1 },
          { personId: 'a', weight: 1 },
        ],
      }),
    );
    expect(shares.get('a')).toBe(51);
    expect(shares.get('b')).toBe(50);
  });

  it('rejects non-positive and non-integer weights', () => {
    expect(() =>
      computeShares(
        mkExpense(100, { mode: 'weights', entries: [{ personId: 'a', weight: 0 }] }),
      ),
    ).toThrow();
    expect(() =>
      computeShares(
        mkExpense(100, { mode: 'weights', entries: [{ personId: 'a', weight: 1.5 }] }),
      ),
    ).toThrow();
  });

  it('property: shares always sum to the amount', () => {
    const rnd = lcg(7);
    for (let i = 0; i < 300; i++) {
      const amount = 1 + Math.floor(rnd() * 100000);
      const n = 1 + Math.floor(rnd() * 8);
      const entries = Array.from({ length: n }, (_, k) => ({
        personId: `p${k}`,
        weight: 1 + Math.floor(rnd() * 5),
      }));
      const shares = computeShares(mkExpense(amount, { mode: 'weights', entries }));
      expect(sum(shares)).toBe(amount);
    }
  });

  it('property: all-ones weights agree with equal split', () => {
    const rnd = lcg(99);
    for (let i = 0; i < 200; i++) {
      const amount = 1 + Math.floor(rnd() * 100000);
      const n = 1 + Math.floor(rnd() * 8);
      const ids = Array.from({ length: n }, (_, k) => `p${k}`);
      const equal = computeShares(mkExpense(amount, { mode: 'equal', participantIds: ids }));
      const weighted = computeShares(
        mkExpense(amount, {
          mode: 'weights',
          entries: ids.map((personId) => ({ personId, weight: 1 })),
        }),
      );
      for (const id of ids) expect(weighted.get(id)).toBe(equal.get(id));
    }
  });
});

describe('validation', () => {
  it('rejects zero, negative, and non-integer amounts', () => {
    for (const amount of [0, -100, 10.5]) {
      expect(() =>
        computeShares(mkExpense(amount, { mode: 'equal', participantIds: ['a'] })),
      ).toThrow();
    }
  });
});
