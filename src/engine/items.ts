// Item-mode splitting (PLAN.md §6.1). Pure functions, integer cents only.
import type { SplitSpec } from '../types';
import { equalSplit } from './shares';

export type ItemEntry = Extract<SplitSpec, { mode: 'items' }>['items'][number];

/**
 * Splits each item equally among its assignees with the standard floor +
 * remainder-by-id rule, applied per item; a person's share is the sum of
 * their item shares. Throws on invalid input.
 */
export function computeItemShares(items: ItemEntry[]): Map<string, number> {
  if (items.length === 0) throw new Error('no items');
  const shares = new Map<string, number>();
  for (const item of items) {
    // equalSplit validates positive integer amounts, non-empty and unique assignees
    for (const [personId, cents] of equalSplit(item.amountCents, item.participantIds)) {
      shares.set(personId, (shares.get(personId) ?? 0) + cents);
    }
  }
  return shares;
}

/** Sum of item amounts — must equal the expense amount before saving (§6.1). */
export function itemsTotal(items: ItemEntry[]): number {
  return items.reduce((sum, item) => sum + item.amountCents, 0);
}
