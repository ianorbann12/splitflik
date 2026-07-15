// Cycle balances and the settlement snapshot rule (PLAN.md §6.2–6.3).
// Pure functions, integer cents only.
import type { Expense, Outing, SettlementDraft } from '../types';
import { computeShares } from './shares';

/**
 * Net balance per person for one settlement cycle: positive = is owed money,
 * negative = owes. Only expenses stamped with `cycle` count — settled cycles
 * are closed and never re-enter (CLAUDE.md rule 3). Balances sum to 0.
 */
export function computeBalances(expenses: Expense[], cycle: number): Map<string, number> {
  const balances = new Map<string, number>();
  const add = (id: string, delta: number) =>
    balances.set(id, (balances.get(id) ?? 0) + delta);
  for (const expense of expenses) {
    if (expense.cycle !== cycle) continue;
    add(expense.payerId, expense.amountCents);
    for (const [personId, share] of computeShares(expense)) add(personId, -share);
  }
  let sum = 0;
  for (const v of balances.values()) sum += v;
  if (sum !== 0) throw new Error('balances must sum to 0');
  return balances;
}

export interface TransferPair {
  fromId: string;
  toId: string;
  amountCents: number;
}

/**
 * Greedy simplified debts: repeatedly match the largest debtor with the
 * largest creditor (ties by id ascending). Deterministic; at most n-1
 * transfers; zero-balance people never appear.
 */
export function suggestTransfers(balances: Map<string, number>): TransferPair[] {
  const open = [...balances.entries()]
    .filter(([, cents]) => cents !== 0)
    .map(([id, cents]) => ({ id, cents }));
  const transfers: TransferPair[] = [];
  for (;;) {
    let creditor: { id: string; cents: number } | undefined;
    let debtor: { id: string; cents: number } | undefined;
    for (const p of open) {
      if (p.cents > 0 && (!creditor || p.cents > creditor.cents || (p.cents === creditor.cents && p.id < creditor.id))) {
        creditor = p;
      }
      if (p.cents < 0 && (!debtor || p.cents < debtor.cents || (p.cents === debtor.cents && p.id < debtor.id))) {
        debtor = p;
      }
    }
    if (!creditor || !debtor) break;
    const amount = Math.min(creditor.cents, -debtor.cents);
    transfers.push({ fromId: debtor.id, toId: creditor.id, amountCents: amount });
    creditor.cents -= amount;
    debtor.cents += amount;
  }
  return transfers;
}

/**
 * The settlement snapshot (PLAN.md §6.3): drafts for the outing's *current*
 * cycle. The caller persists them with status 'pending' and bumps
 * `outing.currentCycle` atomically; this function only computes.
 */
export function materialiseSettlements(outing: Outing, expenses: Expense[]): SettlementDraft[] {
  const own = expenses.filter((e) => e.outingId === outing.id);
  const balances = computeBalances(own, outing.currentCycle);
  return suggestTransfers(balances).map((t) => ({
    ...t,
    outingId: outing.id,
    groupId: outing.groupId,
    cycle: outing.currentCycle,
  }));
}
