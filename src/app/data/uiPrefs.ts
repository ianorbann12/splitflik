// Small local UI preferences that aren't part of the group data model — right
// now just "when did I last mark notifications read", which drives the unread
// badge. Persisted in localStorage; subscribable for useSyncExternalStore.
import { useSyncExternalStore } from 'react';

const READ_KEY = 'deli:notifReadAt';

let notifReadAt: number | null = null;
const listeners = new Set<() => void>();

function load(): number {
  if (notifReadAt !== null) return notifReadAt;
  try {
    const raw = localStorage.getItem(READ_KEY);
    notifReadAt = raw ? Number(raw) || 0 : 0;
  } catch {
    notifReadAt = 0;
  }
  return notifReadAt;
}

export function getNotifReadAt(): number {
  return load();
}

export function markNotificationsRead(at: number): void {
  notifReadAt = at;
  try {
    localStorage.setItem(READ_KEY, String(at));
  } catch {
    // best effort
  }
  for (const l of listeners) l();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNotifReadAt(): number {
  return useSyncExternalStore(subscribe, getNotifReadAt);
}
