import { describe, expect, it } from 'vitest';
import type { Expense, Outing, Settlement, SettlementDraft } from '../types';
import { computeBalances, materialiseSettlements, suggestTransfers } from './settle';

let seq = 0;
function mkExpense(
  payerId: string,
  amountCents: number,
  participantIds: string[],
  cycle = 1,
  outingId = 'o1',
): Expense {
  return {
    id: `e${seq++}`,
    outingId,
    groupId: 'g1',
    description: 'test',
    amountCents,
    payerId,
    split: { mode: 'equal', participantIds },
    cycle,
    createdAt: 0,
  };
}

function mkOuting(currentCycle = 1, id = 'o1'): Outing {
  return {
    id,
    groupId: 'g1',
    name: 'test',
    participantIds: ['a', 'b', 'c'],
    currentCycle,
    createdAt: 0,
  };
}

/** Simulates what storage does with drafts: persist as pending + bump the cycle. */
function persist(outing: Outing, drafts: SettlementDraft[]): {
  outing: Outing;
  settlements: Settlement[];
} {
  return {
    outing: { ...outing, currentCycle: outing.currentCycle + 1 },
    settlements: drafts.map((d, i) => ({
      ...d,
      id: `s${seq++}-${i}`,
      status: 'pending' as const,
      createdAt: 0,
    })),
  };
}

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('computeBalances', () => {
  it('credits the payer and debits each participant by their share', () => {
    const balances = computeBalances([mkExpense('a', 3000, ['a', 'b', 'c'])], 1);
    expect(balances.get('a')).toBe(2000);
    expect(balances.get('b')).toBe(-1000);
    expect(balances.get('c')).toBe(-1000);
  });

  it('only counts expenses of the requested cycle', () => {
    const expenses = [
      mkExpense('a', 3000, ['a', 'b', 'c'], 1),
      mkExpense('b', 600, ['a', 'b'], 2),
    ];
    const cycle2 = computeBalances(expenses, 2);
    expect(cycle2.get('b')).toBe(300);
    expect(cycle2.get('a')).toBe(-300);
    expect(cycle2.has('c')).toBe(false);
  });

  it('returns an empty map for a cycle with no expenses', () => {
    expect(computeBalances([mkExpense('a', 100, ['a', 'b'], 1)], 5).size).toBe(0);
  });

  it('property: balances always sum to 0', () => {
    const rnd = lcg(13);
    for (let i = 0; i < 200; i++) {
      const people = ['a', 'b', 'c', 'd', 'e'].slice(0, 2 + Math.floor(rnd() * 4));
      const expenses = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => {
        const payer = people[Math.floor(rnd() * people.length)]!;
        const participants = people.filter(() => rnd() > 0.3);
        if (participants.length === 0) participants.push(payer);
        return mkExpense(payer, 1 + Math.floor(rnd() * 50000), participants);
      });
      const balances = computeBalances(expenses, 1);
      let sum = 0;
      for (const v of balances.values()) sum += v;
      expect(sum).toBe(0);
    }
  });
});

describe('suggestTransfers', () => {
  it('settles a simple two-person debt with one transfer', () => {
    const balances = computeBalances([mkExpense('a', 1000, ['a', 'b'])], 1);
    expect(suggestTransfers(balances)).toEqual([
      { fromId: 'b', toId: 'a', amountCents: 500 },
    ]);
  });

  it('returns no transfers when everyone is settled', () => {
    expect(suggestTransfers(new Map([['a', 0]]))).toEqual([]);
    expect(suggestTransfers(new Map())).toEqual([]);
  });

  it('matches the largest debtor with the largest creditor first', () => {
    const balances = new Map([
      ['a', 5000],
      ['b', 1000],
      ['c', -4000],
      ['d', -2000],
    ]);
    expect(suggestTransfers(balances)).toEqual([
      { fromId: 'c', toId: 'a', amountCents: 4000 },
      { fromId: 'd', toId: 'a', amountCents: 1000 },
      { fromId: 'd', toId: 'b', amountCents: 1000 },
    ]);
  });

  it('breaks ties by id ascending (deterministic)', () => {
    const balances = new Map([
      ['b', 500],
      ['a', 500],
      ['d', -500],
      ['c', -500],
    ]);
    expect(suggestTransfers(balances)).toEqual([
      { fromId: 'c', toId: 'a', amountCents: 500 },
      { fromId: 'd', toId: 'b', amountCents: 500 },
    ]);
  });

  it('property: transfers zero out balances in at most n-1 steps', () => {
    const rnd = lcg(31);
    for (let i = 0; i < 200; i++) {
      const people = ['a', 'b', 'c', 'd', 'e', 'f'].slice(0, 2 + Math.floor(rnd() * 5));
      const expenses = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => {
        const payer = people[Math.floor(rnd() * people.length)]!;
        const participants = people.filter(() => rnd() > 0.3);
        if (participants.length === 0) participants.push(payer);
        return mkExpense(payer, 1 + Math.floor(rnd() * 50000), participants);
      });
      const balances = computeBalances(expenses, 1);
      const transfers = suggestTransfers(balances);
      const remaining = new Map(balances);
      for (const t of transfers) {
        expect(t.amountCents).toBeGreaterThan(0);
        remaining.set(t.fromId, (remaining.get(t.fromId) ?? 0) + t.amountCents);
        remaining.set(t.toId, (remaining.get(t.toId) ?? 0) - t.amountCents);
      }
      for (const v of remaining.values()) expect(v).toBe(0);
      const nonZero = [...balances.values()].filter((v) => v !== 0).length;
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, nonZero - 1));
    }
  });
});

describe('materialiseSettlements — settlement snapshot rule', () => {
  it('stamps drafts with the outing, group and current cycle', () => {
    const outing = mkOuting(1);
    const drafts = materialiseSettlements(outing, [mkExpense('a', 1000, ['a', 'b'])]);
    expect(drafts).toEqual([
      { outingId: 'o1', groupId: 'g1', cycle: 1, fromId: 'b', toId: 'a', amountCents: 500 },
    ]);
  });

  it('ignores expenses from other outings', () => {
    const outing = mkOuting(1, 'o1');
    const drafts = materialiseSettlements(outing, [
      mkExpense('a', 1000, ['a', 'b'], 1, 'o2'),
    ]);
    expect(drafts).toEqual([]);
  });

  it('settling twice without new expenses yields nothing the second time', () => {
    let outing = mkOuting(1);
    const expenses = [mkExpense('a', 3000, ['a', 'b', 'c'])];
    const first = materialiseSettlements(outing, expenses);
    expect(first).toHaveLength(2);
    ({ outing } = persist(outing, first));
    expect(materialiseSettlements(outing, expenses)).toEqual([]);
  });

  it('later expenses accumulate fresh — settled amounts are never re-counted', () => {
    let outing = mkOuting(1);
    const expenses = [mkExpense('a', 1000, ['a', 'b'], 1)];
    ({ outing } = persist(outing, materialiseSettlements(outing, expenses)));

    // New cycle: b pays 6,00 € for both. Only this expense may count.
    expenses.push(mkExpense('b', 600, ['a', 'b'], outing.currentCycle));
    const second = materialiseSettlements(outing, expenses);
    expect(second).toEqual([
      { outingId: 'o1', groupId: 'g1', cycle: 2, fromId: 'a', toId: 'b', amountCents: 300 },
    ]);
  });

  it('property: each cycle settles exactly its own expense volume', () => {
    const rnd = lcg(77);
    for (let i = 0; i < 100; i++) {
      let outing = mkOuting(1);
      const expenses: Expense[] = [];
      const all: Settlement[] = [];
      const cycleCredit = new Map<number, number>();
      for (let round = 0; round < 3; round++) {
        const cycle = outing.currentCycle;
        for (let k = 0; k < 1 + Math.floor(rnd() * 4); k++) {
          const people = ['a', 'b', 'c', 'd'];
          const payer = people[Math.floor(rnd() * people.length)]!;
          const participants = people.filter(() => rnd() > 0.4);
          if (participants.length === 0) participants.push(payer);
          expenses.push(mkExpense(payer, 1 + Math.floor(rnd() * 20000), participants, cycle));
        }
        // Positive balances of this cycle = what must flow in settlements.
        const balances = computeBalances(
          expenses.filter((e) => e.outingId === outing.id),
          cycle,
        );
        let credit = 0;
        for (const v of balances.values()) if (v > 0) credit += v;
        cycleCredit.set(cycle, credit);

        const drafts = materialiseSettlements(outing, expenses);
        const persisted = persist(outing, drafts);
        outing = persisted.outing;
        all.push(...persisted.settlements);
      }
      // Per cycle, settled amounts match that cycle's credit exactly (no double count).
      for (const [cycle, credit] of cycleCredit) {
        const settledForCycle = all
          .filter((s) => s.cycle === cycle)
          .reduce((sum, s) => sum + s.amountCents, 0);
        expect(settledForCycle).toBe(credit);
      }
    }
  });
});
