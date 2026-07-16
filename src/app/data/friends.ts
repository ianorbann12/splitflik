// User-level friends roster (independent of any group). Backed by the friends
// table via the store facade; kept in a small reactive module so screens share
// one list. Add is by phone, in-app (no SMS) — a registered friend's cached
// name + avatar come back with it.
import { useSyncExternalStore } from 'react';
import type { Friend } from '../../types';
import { store } from './store';

let friends: Friend[] = [];
let loadedFor: string | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

export function getFriends(): Friend[] {
  return friends;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useFriends(): Friend[] {
  return useSyncExternalStore(subscribe, getFriends);
}

export async function loadFriends(userId: string, force = false): Promise<void> {
  if (!force && loadedFor === userId) return;
  loadedFor = userId;
  try {
    friends = await store.listFriends(userId);
    notify();
  } catch {
    // keep whatever we have
  }
}

/** Add a friend by phone; returns the friend (with cached profile) or null. */
export async function addFriend(userId: string, phone: string): Promise<Friend | null> {
  try {
    const friend = await store.addFriend(userId, phone);
    friends = [...friends.filter((f) => f.phone !== friend.phone), friend];
    notify();
    return friend;
  } catch {
    store.toast('Prijatelja ni bilo mogoče dodati.');
    return null;
  }
}

export async function removeFriend(userId: string, phone: string): Promise<void> {
  friends = friends.filter((f) => f.phone !== phone);
  notify();
  try {
    await store.removeFriend(userId, phone);
  } catch {
    // best effort
  }
}

export async function renameFriend(userId: string, phone: string, name: string): Promise<void> {
  friends = friends.map((f) => (f.phone === phone ? { ...f, name } : f));
  notify();
  try {
    await store.updateFriendName(userId, phone, name);
  } catch {
    // best effort
  }
}
