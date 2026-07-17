// Freemium plan, weekly receipt-parse quota, and tier limits — all local to the
// device (localStorage), which is fine for this demo. A real SaaS would enforce
// these server-side; here the gates are client-side (easily bypassed, by design
// of a prototype). "Paid" is flipped by the (simulated) subscription checkout.
import { useSyncExternalStore } from 'react';
import { readLocal, writeLocal } from '../../lib/storage';

const PLAN_KEY = 'splitflik:plan';
const USAGE_KEY = 'splitflik:receipts';

export type Plan = 'free' | 'paid';

export const FREE_MAX_MEMBERS = 4;
export const FREE_WEEKLY_RECEIPTS = 2;
export const PAID_WEEKLY_RECEIPTS = 30;

const listeners = new Set<() => void>();
function notify(): void {
  for (const l of listeners) l();
}
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// --- Plan ---

export function getPlan(): Plan {
  return readLocal(PLAN_KEY) === 'paid' ? 'paid' : 'free';
}
export function isPaid(): boolean {
  return getPlan() === 'paid';
}
export function adsEnabled(): boolean {
  return getPlan() === 'free';
}
export function maxMembers(): number {
  return isPaid() ? Infinity : FREE_MAX_MEMBERS;
}
export function weeklyReceiptLimit(): number {
  return isPaid() ? PAID_WEEKLY_RECEIPTS : FREE_WEEKLY_RECEIPTS;
}

export function setPlan(plan: Plan): void {
  writeLocal(PLAN_KEY, plan);
  notify();
}

export function usePlan(): Plan {
  return useSyncExternalStore(subscribe, getPlan);
}

// --- Weekly receipt quota ---

interface Usage {
  weekStart: number;
  count: number;
}

function startOfWeek(now: number): number {
  const d = new Date(now);
  const dow = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow).getTime();
}

function getUsage(): Usage {
  const week = startOfWeek(Date.now());
  const raw = readLocal(USAGE_KEY);
  if (raw) {
    try {
      const v: unknown = JSON.parse(raw);
      if (typeof v === 'object' && v !== null) {
        const u = v as Record<string, unknown>;
        if (u['weekStart'] === week && typeof u['count'] === 'number') {
          return { weekStart: week, count: u['count'] };
        }
      }
    } catch {
      // ignore corrupt usage
    }
  }
  return { weekStart: week, count: 0 };
}

export function receiptsUsed(): number {
  return getUsage().count;
}
export function receiptsLeft(): number {
  return Math.max(0, weeklyReceiptLimit() - receiptsUsed());
}
export function canParseReceipt(): boolean {
  return receiptsLeft() > 0;
}
export function recordReceiptParse(): void {
  const u = getUsage();
  writeLocal(USAGE_KEY, JSON.stringify({ weekStart: u.weekStart, count: u.count + 1 }));
  notify();
}

/** Reactive count of receipts left this week (re-renders on plan/usage change). */
export function useReceiptsLeft(): number {
  return useSyncExternalStore(subscribe, receiptsLeft);
}
