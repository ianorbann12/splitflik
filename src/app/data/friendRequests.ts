// Friend requests (accept/decline). User-level, like the friends roster: adding
// someone by phone sends them a pending request; they see it in Obvestila and
// accept (→ mutual friends) or decline. Kept in a small reactive module so the
// Friends screen and the Notifications screen share one view.
import { useSyncExternalStore } from 'react';
import type { FriendRequest } from '../../types';
import { store } from './store';
import { loadFriends } from './friends';

type Me = { userId: string; name?: string; phone?: string; avatarUrl?: string };

let incoming: FriendRequest[] = [];
let outgoing: FriendRequest[] = [];
let loadedKey: string | null = null;
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

export function getIncoming(): FriendRequest[] {
  return incoming;
}
export function getOutgoing(): FriendRequest[] {
  return outgoing;
}
export function useIncomingRequests(): FriendRequest[] {
  return useSyncExternalStore(subscribe, getIncoming);
}
export function useOutgoingRequests(): FriendRequest[] {
  return useSyncExternalStore(subscribe, getOutgoing);
}

export async function loadRequests(userId: string, myPhone: string, force = false): Promise<void> {
  const key = `${userId}:${myPhone}`;
  if (!force && loadedKey === key) return;
  loadedKey = key;
  try {
    const [inc, out] = await Promise.all([
      myPhone ? store.listIncomingRequests(myPhone) : Promise.resolve<FriendRequest[]>([]),
      userId ? store.listOutgoingRequests(userId) : Promise.resolve<FriendRequest[]>([]),
    ]);
    incoming = inc;
    outgoing = out;
    notify();
  } catch {
    // keep whatever we have
  }
}

/** Sends a friend request to a phone; reflects it optimistically in `outgoing`. */
export async function sendRequest(from: Me, toPhone: string): Promise<boolean> {
  try {
    await store.sendFriendRequest(from, toPhone);
    outgoing = [
      ...outgoing.filter((r) => r.toPhone !== toPhone),
      {
        id: `tmp-${toPhone}`,
        fromOwner: from.userId,
        ...(from.name ? { fromName: from.name } : {}),
        ...(from.phone ? { fromPhone: from.phone } : {}),
        ...(from.avatarUrl ? { fromAvatarUrl: from.avatarUrl } : {}),
        toPhone,
        status: 'pending',
        createdAt: Date.now(),
      },
    ];
    notify();
    return true;
  } catch {
    store.toast('Prošnje ni bilo mogoče poslati.');
    return false;
  }
}

export async function acceptRequest(req: FriendRequest, me: Me): Promise<void> {
  incoming = incoming.filter((r) => r.id !== req.id);
  notify();
  try {
    await store.acceptFriendRequest(req, me);
    await loadFriends(me.userId, true); // the new mutual friend now appears
  } catch {
    store.toast('Prošnje ni bilo mogoče sprejeti.');
  }
}

export async function declineRequest(requestId: string): Promise<void> {
  incoming = incoming.filter((r) => r.id !== requestId);
  notify();
  try {
    await store.declineFriendRequest(requestId);
  } catch {
    // best effort
  }
}
