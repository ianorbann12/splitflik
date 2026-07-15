// Split computation (PLAN.md §6.1). Pure functions, integer cents only.
import type { Expense } from '../types';
import { computeItemShares } from './items';

/**
 * Computes each participant's share of an expense. For every mode the shares
 * sum exactly to `expense.amountCents`. Throws on invalid input.
 */
export function computeShares(expense: Expense): Map<string, number> {
  const amount = expense.amountCents;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amountCents must be a positive integer');
  }
  const split = expense.split;
  switch (split.mode) {
    case 'equal':
      return equalSplit(amount, split.participantIds);
    case 'exact':
      return exactShares(amount, split.entries);
    case 'weights':
      return weightShares(amount, split.entries);
    case 'items': {
      const itemSum = split.items.reduce((sum, item) => sum + item.amountCents, 0);
      if (itemSum !== amount) throw new Error('items must sum to the amount');
      return computeItemShares(split.items);
    }
  }
}

function assertUnique(ids: string[]): void {
  if (new Set(ids).size !== ids.length) {
    throw new Error('duplicate participant');
  }
}

/**
 * Equal split: floor division; remainder cents go one-by-one to participants
 * sorted by id. Also the per-item rule for items mode (CLAUDE.md rule 2).
 */
export function equalSplit(amount: number, participantIds: string[]): Map<string, number> {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error('amount must be a positive integer');
  }
  if (participantIds.length === 0) throw new Error('no participants');
  assertUnique(participantIds);
  const ids = [...participantIds].sort();
  const base = Math.floor(amount / ids.length);
  const remainder = amount - base * ids.length;
  const shares = new Map<string, number>();
  ids.forEach((id, i) => shares.set(id, base + (i < remainder ? 1 : 0)));
  return shares;
}

function exactShares(
  amount: number,
  entries: { personId: string; amountCents: number }[],
): Map<string, number> {
  if (entries.length === 0) throw new Error('no participants');
  assertUnique(entries.map((e) => e.personId));
  let sum = 0;
  for (const e of entries) {
    if (!Number.isInteger(e.amountCents) || e.amountCents < 0) {
      throw new Error('exact entry must be a non-negative integer');
    }
    sum += e.amountCents;
  }
  if (sum !== amount) throw new Error('exact entries must sum to the amount');
  return new Map(entries.map((e) => [e.personId, e.amountCents]));
}

/**
 * Largest-remainder method, all integer math: floor(amount * weight / W) each,
 * leftover cents to the largest remainders, ties broken by id ascending.
 */
function weightShares(
  amount: number,
  entries: { personId: string; weight: number }[],
): Map<string, number> {
  if (entries.length === 0) throw new Error('no participants');
  assertUnique(entries.map((e) => e.personId));
  for (const e of entries) {
    if (!Number.isInteger(e.weight) || e.weight <= 0) {
      throw new Error('weight must be a positive integer');
    }
  }
  const totalWeight = entries.reduce((w, e) => w + e.weight, 0);
  const parts = entries.map((e) => {
    const raw = amount * e.weight;
    return {
      personId: e.personId,
      base: Math.floor(raw / totalWeight),
      rem: raw % totalWeight,
    };
  });
  let leftover = amount - parts.reduce((s, p) => s + p.base, 0);
  const byRemainder = [...parts].sort(
    (a, b) => b.rem - a.rem || (a.personId < b.personId ? -1 : 1),
  );
  const extra = new Set<string>();
  for (const p of byRemainder) {
    if (leftover === 0) break;
    extra.add(p.personId);
    leftover--;
  }
  return new Map(parts.map((p) => [p.personId, p.base + (extra.has(p.personId) ? 1 : 0)]));
}
