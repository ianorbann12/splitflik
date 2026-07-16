// Read-only selectors that turn the raw group data (people / outings /
// expenses / settlements) into the shapes the screens render: friend balances,
// the home summary, notifications, stats and spending breakdowns. All money math
// runs through the tested engine — never re-implemented here.
import type { AppState } from '../../lib/storage';
import type { Expense, Outing, Person, Settlement } from '../../types';
import { computeShares } from '../../engine/shares';
import { computeBalances, materialiseSettlements } from '../../engine/settle';

// ------------------------------ friends / balances -------------------------

export interface FriendBalance {
  person: Person;
  /** Positive = they owe me; negative = I owe them; 0 = settled. */
  cents: number;
}

/**
 * Net position between me and every other person, combining materialised
 * pending settlements with the live (unsettled) balances of every outing's
 * current cycle. The two never overlap: a settled cycle has settlements but no
 * live expenses; an open cycle has live expenses but no settlements.
 */
export function friendBalances(state: AppState, meId: string): FriendBalance[] {
  const net = new Map<string, number>();
  const add = (id: string, delta: number) => net.set(id, (net.get(id) ?? 0) + delta);

  for (const s of state.settlements) {
    if (s.status !== 'pending') continue;
    if (s.toId === meId) add(s.fromId, s.amountCents);
    else if (s.fromId === meId) add(s.toId, -s.amountCents);
  }

  for (const outing of state.outings) {
    let transfers;
    try {
      transfers = materialiseSettlements(outing, state.expenses);
    } catch {
      continue; // skip an outing with mid-edit invalid data
    }
    for (const t of transfers) {
      if (t.toId === meId) add(t.fromId, t.amountCents);
      else if (t.fromId === meId) add(t.toId, -t.amountCents);
    }
  }

  return state.people
    .filter((p) => p.id !== meId)
    .map((person) => ({ person, cents: net.get(person.id) ?? 0 }));
}

export interface Summary {
  oweCents: number;
  waitCents: number;
}

/** Totals for the Home / Stats summary cards, netted per friend. */
export function summarize(balances: FriendBalance[]): Summary {
  let oweCents = 0;
  let waitCents = 0;
  for (const b of balances) {
    if (b.cents < 0) oweCents += -b.cents;
    else if (b.cents > 0) waitCents += b.cents;
  }
  return { oweCents, waitCents };
}

// ------------------------------ notifications ------------------------------

export type NotifKind = 'owe' | 'awaiting' | 'received' | 'sent';

export interface Notif {
  id: string;
  kind: NotifKind;
  otherId: string;
  otherName: string;
  amountCents: number;
  createdAt: number;
  settlement: Settlement;
  unread: boolean;
}

export interface NotifGroup {
  label: string;
  items: Notif[];
}

function startOfDay(now: number): number {
  const d = new Date(now);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function startOfWeek(now: number): number {
  const d = new Date(now);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow).getTime();
}

export function notifications(
  state: AppState,
  meId: string,
  readAt: number,
  now: number = Date.now(),
): { groups: NotifGroup[]; unreadCount: number } {
  const nameOf = (id: string) => state.people.find((p) => p.id === id)?.name ?? 'Neznan';
  const mine = state.settlements.filter((s) => s.fromId === meId || s.toId === meId);

  const notifs: Notif[] = mine.map((s) => {
    let kind: NotifKind;
    if (s.status === 'paid') kind = s.toId === meId ? 'received' : 'sent';
    else kind = s.fromId === meId ? 'owe' : 'awaiting';
    const otherId = s.fromId === meId ? s.toId : s.fromId;
    return {
      id: s.id,
      kind,
      otherId,
      otherName: nameOf(otherId),
      amountCents: s.amountCents,
      createdAt: s.createdAt,
      settlement: s,
      unread: s.status === 'pending' && s.createdAt > readAt,
    };
  });

  notifs.sort((a, b) => b.createdAt - a.createdAt);

  const today = startOfDay(now);
  const week = startOfWeek(now);
  const buckets: NotifGroup[] = [
    { label: 'Danes', items: [] },
    { label: 'Ta teden', items: [] },
    { label: 'Starejše', items: [] },
  ];
  for (const n of notifs) {
    if (n.createdAt >= today) buckets[0]!.items.push(n);
    else if (n.createdAt >= week) buckets[1]!.items.push(n);
    else buckets[2]!.items.push(n);
  }

  return {
    groups: buckets.filter((g) => g.items.length > 0),
    unreadCount: notifs.filter((n) => n.unread).length,
  };
}

// ------------------------------ recent activity ----------------------------

export interface RecentItem {
  id: string;
  outingId: string;
  payerId: string;
  payerName: string;
  description: string;
  outingName: string;
  amountCents: number;
  createdAt: number;
}

export function recentActivity(state: AppState, limit = 6): RecentItem[] {
  const nameOf = (id: string) => state.people.find((p) => p.id === id)?.name ?? 'Neznan';
  const outingOf = (id: string) => state.outings.find((o) => o.id === id)?.name ?? '';
  return [...state.expenses]
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .map((e) => ({
      id: e.id,
      outingId: e.outingId,
      payerId: e.payerId,
      payerName: nameOf(e.payerId),
      description: e.description,
      outingName: outingOf(e.outingId),
      amountCents: e.amountCents,
      createdAt: e.createdAt,
    }));
}

// ------------------------------ stats --------------------------------------

export type StatsPeriod = 'week' | 'month' | 'year';

export function periodStart(period: StatsPeriod, now: number = Date.now()): number {
  const d = new Date(now);
  if (period === 'week') return startOfWeek(now);
  if (period === 'month') return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  return new Date(d.getFullYear(), 0, 1).getTime();
}

export interface StatTotals {
  receivedCents: number;
  sentCents: number;
  oweCents: number;
  waitCents: number;
}

export function statTotals(
  state: AppState,
  meId: string,
  balances: FriendBalance[],
  fromMs: number,
): StatTotals {
  let receivedCents = 0;
  let sentCents = 0;
  for (const s of state.settlements) {
    if (s.status !== 'paid') continue;
    const at = s.paidAt ?? s.createdAt;
    if (at < fromMs) continue;
    if (s.toId === meId) receivedCents += s.amountCents;
    else if (s.fromId === meId) sentCents += s.amountCents;
  }
  const { oweCents, waitCents } = summarize(balances);
  return { receivedCents, sentCents, oweCents, waitCents };
}

export interface PlaceSpend {
  label: string;
  cents: number;
  pct: number;
}

/** My share of spending grouped by expense description, within the period. */
export function spendingByPlace(state: AppState, meId: string, fromMs: number): PlaceSpend[] {
  const totals = new Map<string, number>();
  for (const e of state.expenses) {
    if (e.createdAt < fromMs) continue;
    let shares;
    try {
      shares = computeShares(e);
    } catch {
      continue;
    }
    const mine = shares.get(meId);
    if (!mine) continue;
    totals.set(e.description, (totals.get(e.description) ?? 0) + mine);
  }
  const arr = [...totals.entries()]
    .map(([label, cents]) => ({ label, cents }))
    .sort((a, b) => b.cents - a.cents || (a.label < b.label ? -1 : 1));
  const max = arr[0]?.cents ?? 0;
  return arr.slice(0, 5).map((x) => ({ ...x, pct: max ? Math.round((x.cents / max) * 100) : 0 }));
}

const CATEGORY_RULES: { name: string; keywords: string[] }[] = [
  {
    name: 'Hrana',
    keywords: [
      'mercator', 'špar', 'spar', 'lidl', 'hofer', 'tuš', 'tus', 'burger', 'mcdonald',
      'kfc', 'hood', 'picerij', 'pizza', 'kebab', 'sladoled', 'kosilo', 'malica',
      'market', 'trgovina', 'hrana', 'gostiln', 'restavr', 'večerja', 'zajtrk',
    ],
  },
  { name: 'Pijača', keywords: ['pijač', 'pivo', 'kava', 'kavarn', 'bar', 'vino', 'koktajl', 'sok', 'čaj'] },
  { name: 'Zabava', keywords: ['kino', 'koncert', 'kegljanj', 'biljard', 'igre', 'zabava', 'vstopnic', 'muzej', 'klub', 'karaoke'] },
  { name: 'Prevoz', keywords: ['prevoz', 'bencin', 'taksi', 'uber', 'bolt', 'vlak', 'avtobus', 'parkir', 'gorivo'] },
];

function categoryFor(description: string): string {
  const d = description.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.keywords.some((k) => d.includes(k))) return rule.name;
  }
  return 'Ostalo';
}

export interface CategorySpend {
  name: string;
  cents: number;
}

export function categoryTotals(state: AppState, meId: string, fromMs: number): CategorySpend[] {
  const totals = new Map<string, number>();
  for (const e of state.expenses) {
    if (e.createdAt < fromMs) continue;
    let shares;
    try {
      shares = computeShares(e);
    } catch {
      continue;
    }
    const mine = shares.get(meId);
    if (!mine) continue;
    const cat = categoryFor(e.description);
    totals.set(cat, (totals.get(cat) ?? 0) + mine);
  }
  return [...totals.entries()]
    .map(([name, cents]) => ({ name, cents }))
    .sort((a, b) => b.cents - a.cents || (a.name < b.name ? -1 : 1))
    .slice(0, 4);
}

// ------------------------------ outing helpers (activity flow) -------------

/** Expenses belonging to an outing's current (open) cycle. */
export function outingExpenses(state: AppState, outingId: string, cycle: number): Expense[] {
  return state.expenses.filter((e) => e.outingId === outingId && e.cycle === cycle);
}

export function outingGrandTotal(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amountCents, 0);
}

/** Net per participant for an outing's current cycle (positive = is owed). */
export function outingNet(outing: Outing, expenses: Expense[]): Map<string, number> {
  const own = expenses.filter((e) => e.outingId === outing.id);
  try {
    return computeBalances(own, outing.currentCycle);
  } catch {
    return new Map();
  }
}

/** Suggested "who pays whom" for an outing's current cycle (engine settlement). */
export function settlementPreview(outing: Outing, expenses: Expense[]) {
  try {
    return materialiseSettlements(outing, expenses);
  } catch {
    return [];
  }
}
