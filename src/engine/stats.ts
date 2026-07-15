// Leaderboard & Wrapped aggregation (PLAN.md §9). Pure, integer cents only.
import type { Expense, Outing, Settlement } from '../types';
import { computeShares } from './shares';

export interface StatsInput {
  outings: Outing[];
  expenses: Expense[];
  settlements: Settlement[];
}

/** Half-open interval [fromMs, toMs). */
export interface StatsRange {
  fromMs: number;
  toMs: number;
}

export function yearRange(year: number): StatsRange {
  return {
    fromMs: new Date(year, 0, 1).getTime(),
    toMs: new Date(year + 1, 0, 1).getTime(),
  };
}

export interface PersonStats {
  personId: string;
  /** Sum of expenses this person paid. */
  paidCents: number;
  /** Sum of this person's shares across all expenses. */
  consumedCents: number;
  /** paid − consumed: positive = net generous. */
  netCents: number;
  outingsAttended: number;
  /** Largest single expense this person paid (0 if none). */
  biggestPaidExpenseCents: number;
  /** Payer who most often covered an expense this person shared in (not self). */
  mostCoveredById: string | null;
  /** Sum of this person's pending settlements. */
  pendingDebtCents: number;
}

export interface GroupStats {
  totalCents: number;
  /** Sorted by netCents descending, ties by personId. */
  perPerson: PersonStats[];
  topPayerId: string | null;
  topDebtorId: string | null;
  mostExpensiveOuting: { outingId: string; totalCents: number } | null;
  /** Items-mode labels by occurrence count, top 5, ties by label. */
  topItems: { label: string; count: number }[];
  /** Oldest still-pending settlement. */
  longestPendingSettlementId: string | null;
}

export function computeStats(input: StatsInput, range?: StatsRange): GroupStats {
  const inRange = (ts: number) => !range || (ts >= range.fromMs && ts < range.toMs);
  const outings = input.outings.filter((o) => inRange(o.createdAt));
  const expenses = input.expenses.filter((e) => inRange(e.createdAt));
  const settlements = input.settlements.filter((s) => inRange(s.createdAt));

  const persons = new Map<string, PersonStats>();
  const stat = (personId: string): PersonStats => {
    let s = persons.get(personId);
    if (!s) {
      s = {
        personId,
        paidCents: 0,
        consumedCents: 0,
        netCents: 0,
        outingsAttended: 0,
        biggestPaidExpenseCents: 0,
        mostCoveredById: null,
        pendingDebtCents: 0,
      };
      persons.set(personId, s);
    }
    return s;
  };

  let totalCents = 0;
  const outingTotals = new Map<string, number>();
  const coveredBy = new Map<string, Map<string, number>>(); // person -> payer -> count
  const itemCounts = new Map<string, number>();

  for (const expense of expenses) {
    totalCents += expense.amountCents;
    outingTotals.set(
      expense.outingId,
      (outingTotals.get(expense.outingId) ?? 0) + expense.amountCents,
    );
    const payer = stat(expense.payerId);
    payer.paidCents += expense.amountCents;
    payer.biggestPaidExpenseCents = Math.max(
      payer.biggestPaidExpenseCents,
      expense.amountCents,
    );
    for (const [personId, share] of computeShares(expense)) {
      stat(personId).consumedCents += share;
      if (personId !== expense.payerId) {
        let byPayer = coveredBy.get(personId);
        if (!byPayer) coveredBy.set(personId, (byPayer = new Map()));
        byPayer.set(expense.payerId, (byPayer.get(expense.payerId) ?? 0) + 1);
      }
    }
    if (expense.split.mode === 'items') {
      for (const item of expense.split.items) {
        const label = item.label.trim().toLowerCase();
        if (label) itemCounts.set(label, (itemCounts.get(label) ?? 0) + 1);
      }
    }
  }

  for (const outing of outings) {
    for (const personId of outing.participantIds) stat(personId).outingsAttended++;
  }

  let longestPending: Settlement | null = null;
  for (const s of settlements) {
    if (s.status !== 'pending') continue;
    stat(s.fromId).pendingDebtCents += s.amountCents;
    if (
      !longestPending ||
      s.createdAt < longestPending.createdAt ||
      (s.createdAt === longestPending.createdAt && s.id < longestPending.id)
    ) {
      longestPending = s;
    }
  }

  for (const s of persons.values()) {
    s.netCents = s.paidCents - s.consumedCents;
    s.mostCoveredById = maxKey(coveredBy.get(s.personId));
  }

  const perPerson = [...persons.values()].sort(
    (a, b) => b.netCents - a.netCents || (a.personId < b.personId ? -1 : 1),
  );

  const topItems = [...itemCounts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || (a.label < b.label ? -1 : 1))
    .slice(0, 5);

  return {
    totalCents,
    perPerson,
    topPayerId: maxBy(perPerson, (s) => s.paidCents),
    topDebtorId: maxBy(perPerson, (s) => s.pendingDebtCents),
    mostExpensiveOuting: maxEntry(outingTotals),
    topItems,
    longestPendingSettlementId: longestPending?.id ?? null,
  };
}

/** Key with the highest count; ties by key ascending; null when empty. */
function maxKey(counts: Map<string, number> | undefined): string | null {
  if (!counts) return null;
  let best: { key: string; count: number } | null = null;
  for (const [key, count] of counts) {
    if (!best || count > best.count || (count === best.count && key < best.key)) {
      best = { key, count };
    }
  }
  return best?.key ?? null;
}

/** personId with the highest positive value; ties by personId; null when all zero. */
function maxBy(stats: PersonStats[], value: (s: PersonStats) => number): string | null {
  let best: PersonStats | null = null;
  for (const s of stats) {
    if (value(s) <= 0) continue;
    if (!best || value(s) > value(best) || (value(s) === value(best) && s.personId < best.personId)) {
      best = s;
    }
  }
  return best?.personId ?? null;
}

function maxEntry(totals: Map<string, number>): { outingId: string; totalCents: number } | null {
  let best: { outingId: string; totalCents: number } | null = null;
  for (const [outingId, totalCents] of totals) {
    if (!best || totalCents > best.totalCents || (totalCents === best.totalCents && outingId < best.outingId)) {
      best = { outingId, totalCents };
    }
  }
  return best;
}
