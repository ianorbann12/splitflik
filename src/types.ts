// Domain types — single source of truth (PLAN.md §4).
// All amounts are integer cents. Timestamps are epoch milliseconds.

export interface Group {
  id: string;
  name: string;
  inviteCode: string;
  /** ISO 4217 currency code for all amounts in this group. Defaults to EUR. */
  currency?: string;
  createdAt: number;
}

export interface Person {
  id: string;
  groupId: string;
  name: string;
  /** Flik-registered mobile number, normalized to "0XXXXXXXX". */
  phone?: string;
  /** Device id that claimed this person via the Join flow (PLAN.md §5). */
  claimedBy?: string;
  /** Profile picture — a small data URL (or hosted URL). Optional. */
  avatarUrl?: string;
}

/** A user-level friend (added by phone, independent of any group). */
export interface Friend {
  /** Auth user id of the owner who added this friend. */
  owner: string;
  phone: string;
  name?: string;
  avatarUrl?: string;
}

export interface Outing {
  id: string;
  groupId: string;
  name: string;
  participantIds: string[];
  /** Settlement cycle counter; starts at 1, bumped by settling (PLAN.md §6.3). */
  currentCycle: number;
  createdAt: number;
}

/** An item as parsed from a receipt (PLAN.md §7). */
export interface ReceiptItem {
  label: string;
  quantity: number;
  totalCents: number;
}

export type SplitSpec =
  | { mode: 'equal'; participantIds: string[] }
  | { mode: 'exact'; entries: { personId: string; amountCents: number }[] }
  | { mode: 'weights'; entries: { personId: string; weight: number }[] } // positive ints
  | { mode: 'items'; items: { label: string; amountCents: number; participantIds: string[] }[] };

export interface Expense {
  id: string;
  outingId: string;
  groupId: string;
  description: string;
  amountCents: number;
  payerId: string;
  split: SplitSpec;
  /** outing.currentCycle at creation time (PLAN.md §6.3). */
  cycle: number;
  createdAt: number;
}

/** A materialised debt from settling a cycle (PLAN.md §6.3). */
export interface Settlement {
  id: string;
  outingId: string;
  groupId: string;
  cycle: number;
  fromId: string;
  toId: string;
  amountCents: number;
  status: 'pending' | 'paid';
  createdAt: number;
  paidAt?: number;
}

/** Engine output for settling; storage assigns id/status/createdAt. */
export type SettlementDraft = Omit<Settlement, 'id' | 'status' | 'createdAt' | 'paidAt'>;
