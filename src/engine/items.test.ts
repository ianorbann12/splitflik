import { describe, expect, it } from 'vitest';
import type { Expense } from '../types';
import { computeItemShares, itemsTotal, type ItemEntry } from './items';
import { computeShares } from './shares';

function item(label: string, amountCents: number, participantIds: string[]): ItemEntry {
  return { label, amountCents, participantIds };
}

describe('computeItemShares', () => {
  it('splits each item equally among its assignees', () => {
    const shares = computeItemShares([
      item('pica', 1200, ['a', 'b']),
      item('pivo', 350, ['b']),
    ]);
    expect(shares.get('a')).toBe(600);
    expect(shares.get('b')).toBe(950);
  });

  it('applies the floor + remainder-by-id rule per item', () => {
    // 10,00 € for three: 334 to the lowest id; second item 0,05 € for two: 3/2.
    const shares = computeItemShares([
      item('solata', 1000, ['c', 'a', 'b']),
      item('kruh', 5, ['b', 'a']),
    ]);
    expect(shares.get('a')).toBe(334 + 3);
    expect(shares.get('b')).toBe(333 + 2);
    expect(shares.get('c')).toBe(333);
  });

  it('sums shares exactly to the items total', () => {
    const items = [
      item('x', 101, ['a', 'b', 'c']),
      item('y', 77, ['a', 'c']),
      item('z', 999, ['b']),
    ];
    const shares = computeItemShares(items);
    const sum = [...shares.values()].reduce((s, v) => s + v, 0);
    expect(sum).toBe(itemsTotal(items));
  });

  it('rejects empty items, unassigned items, and invalid amounts', () => {
    expect(() => computeItemShares([])).toThrow();
    expect(() => computeItemShares([item('x', 100, [])])).toThrow();
    expect(() => computeItemShares([item('x', 0, ['a'])])).toThrow();
    expect(() => computeItemShares([item('x', 10.5, ['a'])])).toThrow();
    expect(() => computeItemShares([item('x', 100, ['a', 'a'])])).toThrow();
  });
});

describe('computeShares with items mode', () => {
  function mkExpense(amountCents: number, items: ItemEntry[]): Expense {
    return {
      id: 'e1',
      outingId: 'o1',
      groupId: 'g1',
      description: 'test',
      amountCents,
      payerId: 'a',
      split: { mode: 'items', items },
      cycle: 1,
      createdAt: 0,
    };
  }

  it('delegates to computeItemShares when items sum to the amount', () => {
    const shares = computeShares(mkExpense(1550, [
      item('pica', 1200, ['a', 'b']),
      item('pivo', 350, ['b']),
    ]));
    expect(shares.get('a')).toBe(600);
    expect(shares.get('b')).toBe(950);
  });

  it('rejects items that do not sum to the expense amount', () => {
    expect(() =>
      computeShares(mkExpense(1000, [item('pica', 999, ['a'])])),
    ).toThrow();
  });
});
