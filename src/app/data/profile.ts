// A small local copy of the signed-in person's identity (name, phone, avatar),
// persisted in localStorage. When you sign in to a group via a special code we
// reuse this instead of asking you to register again / creating a new profile.
import { readLocal, writeLocal } from '../../lib/storage';

const KEY = 'splitflik:profile';

export interface LocalProfile {
  name: string;
  phone: string;
  avatarUrl?: string;
}

export function getLocalProfile(): LocalProfile | null {
  const raw = readLocal(KEY);
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v === 'object' && v !== null) {
      const p = v as Record<string, unknown>;
      if (typeof p['name'] === 'string' && typeof p['phone'] === 'string') {
        return {
          name: p['name'],
          phone: p['phone'],
          ...(typeof p['avatarUrl'] === 'string' ? { avatarUrl: p['avatarUrl'] } : {}),
        };
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export function setLocalProfile(profile: LocalProfile): void {
  writeLocal(KEY, JSON.stringify(profile));
}

/** Clears the device's local identity — used on logout (one account per device). */
export function clearLocalProfile(): void {
  writeLocal(KEY, null);
}
