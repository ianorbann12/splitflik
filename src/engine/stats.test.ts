import { describe, expect, it } from 'vitest';
import type { Expense, Outing, Settlement, SplitSpec } from '../types';
import { computeStats, yearRange } from './stats';

let seq = 0;
function mkExpense(
  payerId: string,
  amountCents: number,
  split: SplitSpec,
  createdAt = 0,
  outingId = 'o1',
): Expense {
  return {
    id: `e${seq++}`,
    outingId,
    groupId: 'g1',
    description: 'test',
    amountCents,
    payerId,
    split,
    cycle: 1,
    createdAt,
  };
}

function mkOuting(id: string, participantIds: string[], createdAt = 0): Outing {
  return { id, groupId: 'g1', name: id, participantIds, currentCycle: 1, createdAt };
}

function mkSettlement(
  fromId: string,
  toId: string,
  amountCents: number,
  status: 'pending' | 'paid',
  createdAt = 0,
): Settlement {
  return {
    id: `s${seq++}`,
    outingId: 'o1',
    groupId: 'g1',
    cycle: 1,
    fromId,
    toId,
    amountCents,
    status,
    createdAt,
  };
}

const equal = (ids: string[]): SplitSpec => ({ mode: 'equal', participantIds: ids });

describe('computeStats', () => {
  it('aggregates paid, consumed and net per person', () => {
    const stats = computeStats({
      outings: [mkOuting('o1', ['a', 'b'])],
      expenses: [
        mkExpense('a', 1000, equal(['a', 'b'])),
        mkExpense('b', 400, equal(['a', 'b'])),
      ],
      settlements: [],
    });
    expect(stats.totalCents).toBe(1400);
    const a = stats.perPerson.find((p) => p.personId === 'a')!;
    const b = stats.perPerson.find((p) => p.personId === 'b')!;
    expect(a.paidCents).toBe(1000);
    expect(a.consumedCents).toBe(700);
    expect(a.netCents).toBe(300);
    expect(b.netCents).toBe(-300);
    expect(stats.topPayerId).toBe('a');
    // Nets always cancel out.
    expect(stats.perPerson.reduce((s, p) => s + p.netCents, 0)).toBe(0);
    // Sorted by net descending.
    expect(stats.perPerson.map((p) => p.personId)).toEqual(['a', 'b']);
  });

  it('tracks biggest paid expense and outings attended', () => {
    const stats = computeStats({
      outings: [mkOuting('o1', ['a', 'b']), mkOuting('o2', ['a'])],
      expenses: [
        mkExpense('a', 300, equal(['a', 'b'])),
        mkExpense('a', 900, equal(['a', 'b'])),
      ],
      settlements: [],
    });
    const a = stats.perPerson.find((p) => p.personId === 'a')!;
    expect(a.biggestPaidExpenseCents).toBe(900);
    expect(a.outingsAttended).toBe(2);
    expect(stats.perPerson.find((p) => p.personId === 'b')!.outingsAttended).toBe(1);
  });

  it('finds who most often covers a person', () => {
    const stats = computeStats({
      outings: [mkOuting('o1', ['a', 'b', 'c'])],
      expenses: [
        mkExpense('b', 100, equal(['a', 'b'])),
        mkExpense('c', 100, equal(['a', 'c'])),
        mkExpense('c', 100, equal(['a', 'c'])),
      ],
      settlements: [],
    });
    expect(stats.perPerson.find((p) => p.personId === 'a')!.mostCoveredById).toBe('c');
  });

  it('counts only pending settlements as debt and finds the oldest', () => {
    const oldPending = mkSettlement('b', 'a', 500, 'pending', 100);
    const stats = computeStats({
      outings: [],
      expenses: [],
      settlements: [
        mkSettlement('b', 'a', 700, 'paid', 50),
        oldPending,
        mkSettlement('b', 'a', 200, 'pending', 900),
      ],
      });
    const b = stats.perPerson.find((p) => p.personId === 'b')!;
    expect(b.pendingDebtCents).toBe(700);
    expect(stats.topDebtorId).toBe('b');
    expect(stats.longestPendingSettlementId).toBe(oldPending.id);
  });

  it('ranks item labels from items-mode expenses', () => {
    const items: SplitSpec = {
      mode: 'items',
      items: [
        { label: 'Pica', amountCents: 1000, participantIds: ['a'] },
        { label: 'pivo', amountCents: 300, participantIds: ['a'] },
      ],
    };
    const items2: SplitSpec = {
      mode: 'items',
      items: [{ label: 'pica ', amountCents: 800, participantIds: ['a'] }],
    };
    const stats = computeStats({
      outings: [],
      expenses: [mkExpense('a', 1300, items), mkExpense('a', 800, items2)],
      settlements: [],
    });
    expect(stats.topItems[0]).toEqual({ label: 'pica', count: 2 });
    expect(stats.topItems[1]).toEqual({ label: 'pivo', count: 1 });
  });

  it('finds the most expensive outing', () => {
    const stats = computeStats({
      outings: [mkOuting('o1', ['a']), mkOuting('o2', ['a'])],
      expenses: [
        mkExpense('a', 500, equal(['a']), 0, 'o1'),
        mkExpense('a', 900, equal(['a']), 0, 'o2'),
      ],
      settlements: [],
    });
    expect(stats.mostExpensiveOuting).toEqual({ outingId: 'o2', totalCents: 900 });
  });

  it('filters by range (yearRange)', () => {
    const in2026 = new Date(2026, 5, 15).getTime();
    const in2025 = new Date(2025, 5, 15).getTime();
    const stats = computeStats(
      {
        outings: [mkOuting('o1', ['a'], in2026), mkOuting('o2', ['a'], in2025)],
        expenses: [
          mkExpense('a', 1000, equal(['a']), in2026),
          mkExpense('a', 400, equal(['a']), in2025),
        ],
        settlements: [],
      },
      yearRange(2026),
    );
    expect(stats.totalCents).toBe(1000);
    expect(stats.perPerson.find((p) => p.personId === 'a')!.outingsAttended).toBe(1);
  });

  it('returns nulls and empty lists for empty input', () => {
    const stats = computeStats({ outings: [], expenses: [], settlements: [] });
    expect(stats.totalCents).toBe(0);
    expect(stats.perPerson).toEqual([]);
    expect(stats.topPayerId).toBeNull();
    expect(stats.topDebtorId).toBeNull();
    expect(stats.mostExpensiveOuting).toBeNull();
    expect(stats.topItems).toEqual([]);
    expect(stats.longestPendingSettlementId).toBeNull();
  });
});
