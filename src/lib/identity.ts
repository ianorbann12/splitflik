// Active group session (PLAN.md §5). Who you are is the Supabase Auth user
// (storage.ts); this module remembers which group/person this browser uses.
// Persistence goes through storage.ts's local helpers (CLAUDE.md rule 8).
import { useSyncExternalStore } from 'react';
import { readLocal, writeLocal } from './storage';

const SESSION_KEY = 'splitflik:v2:session';

export interface GroupSession {
  groupId: string;
  personId: string;
  inviteCode: string;
}

let session: GroupSession | null | undefined; // undefined = not yet loaded
const listeners = new Set<() => void>();

function loadSession(): GroupSession | null {
  const raw = readLocal(SESSION_KEY);
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v === 'object' && v !== null) {
      const s = v as Record<string, unknown>;
      if (
        typeof s['groupId'] === 'string' &&
        typeof s['personId'] === 'string' &&
        typeof s['inviteCode'] === 'string'
      ) {
        return { groupId: s['groupId'], personId: s['personId'], inviteCode: s['inviteCode'] };
      }
    }
  } catch {
    // fall through
  }
  return null;
}

export function getSession(): GroupSession | null {
  if (session === undefined) session = loadSession();
  return session;
}

export function setSession(next: GroupSession | null): void {
  session = next;
  writeLocal(SESSION_KEY, next ? JSON.stringify(next) : null);
  for (const listener of listeners) listener();
}

export function subscribeSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSession(): GroupSession | null {
  return useSyncExternalStore(subscribeSession, getSession);
}

/** Random invite slug, 20 chars base36 (the group's effective secret). */
export function newInviteCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  return Array.from(bytes, (b) => (b % 36).toString(36)).join('');
}

export function inviteUrl(code: string): string {
  return `${location.origin}${location.pathname}#/join/${encodeURIComponent(code)}`;
}

/** Extracts an invite code from a pasted link or returns the raw code. */
export function parseInviteInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const fromUrl = /#\/join\/([a-z0-9]+)/i.exec(trimmed);
  if (fromUrl?.[1]) return fromUrl[1].toLowerCase();
  if (/^[a-z0-9]{12,64}$/i.test(trimmed)) return trimmed.toLowerCase();
  return null;
}
