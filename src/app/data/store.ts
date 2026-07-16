// Single data entry point for the UI. Delegates to the real Supabase SDK
// (src/lib/storage.ts) when configured, or to the in-memory demo store when
// not — so the same screens work against a live backend or a local demo.
import { useSyncExternalStore } from 'react';
import * as live from '../../lib/storage';
import * as demo from './demoStore';
import type { AppState } from '../../lib/storage';
import type { Expense, Friend, Group, Outing, Person, SettlementDraft } from '../../types';

export type StoreMode = 'live' | 'demo';

export interface StoreApi {
  getState(): AppState;
  subscribe(listener: () => void): () => void;
  toast(message: string): void;
  isConfigured(): boolean;
  initAuth(): void;
  authSignUp(email: string, password: string): Promise<'ok' | 'confirm'>;
  authSignIn(email: string, password: string): Promise<void>;
  authSignOut(): Promise<void>;
  initGroup(groupId: string): Promise<void>;
  teardownGroup(): void;
  refetch(): Promise<void>;
  createGroup(
    groupName: string,
    inviteCode: string,
    founder: { name: string; phone?: string; claimedBy: string },
    currency?: string,
  ): Promise<{ groupId: string; personId: string }>;
  fetchGroupByInvite(
    inviteCode: string,
  ): Promise<{ group: Group; people: Person[] } | null>;
  claimPerson(personId: string, userId: string): Promise<void>;
  claimPersonWithName(personId: string, userId: string, name: string, avatarUrl?: string): Promise<void>;
  fetchPendingByPhone(phone: string): Promise<{ group: Group; person: Person } | null>;
  fetchMyGroups(userId: string): Promise<{ group: Group; personId: string }[]>;
  lookupPersonByPhone(phone: string): Promise<{ name: string; avatarUrl?: string } | null>;
  listFriends(userId: string): Promise<Friend[]>;
  addFriend(userId: string, phone: string): Promise<Friend>;
  removeFriend(userId: string, phone: string): Promise<void>;
  updateFriendName(userId: string, phone: string, name: string): Promise<void>;
  addGroupMembers(
    groupId: string,
    members: { name?: string; phone: string; avatarUrl?: string }[],
  ): Promise<void>;
  leaveGroup(groupId: string, userId: string): Promise<void>;
  joinAsNewPerson(
    groupId: string,
    name: string,
    phone: string | undefined,
    userId: string,
    avatarUrl?: string,
  ): Promise<string>;
  savePerson(person: Person, isNew: boolean): void;
  deletePerson(personId: string): void;
  createOuting(name: string, participantIds: string[]): string;
  updateOuting(outing: Outing): void;
  deleteOuting(outingId: string): void;
  saveExpense(expense: Expense, isNew: boolean): void;
  deleteExpense(expenseId: string): void;
  settleOuting(outing: Outing, drafts: SettlementDraft[]): void;
  markSettlementPaid(settlementId: string): void;
  setGroupCurrency(groupId: string, currency: string): void;
}

export const mode: StoreMode = live.isConfigured() ? 'live' : 'demo';

// Both modules implement the same surface; the cast pins them to StoreApi so
// callers get one stable, fully-typed contract regardless of mode.
export const store: StoreApi = (mode === 'live' ? live : demo) as unknown as StoreApi;

/** Reactive snapshot of the whole app state. */
export function useStore(): AppState {
  return useSyncExternalStore(store.subscribe, store.getState);
}

export type { AppState };

// Identity/session helpers are localStorage-based and mode-agnostic; re-export
// them here so screens have a single data import point.
export {
  getSession,
  setSession,
  useSession,
  subscribeSession,
  newInviteCode,
  inviteUrl,
  parseInviteInput,
  type GroupSession,
} from '../../lib/identity';
