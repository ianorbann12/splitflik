import { beforeEach, describe, expect, it, vi } from 'vitest';

function mockLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size;
    },
  };
}

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', mockLocalStorage());
});

async function identity() {
  return import('./identity');
}

describe('session', () => {
  it('round-trips through setSession/getSession and persists', async () => {
    const mod = await identity();
    expect(mod.getSession()).toBeNull();
    const session = { groupId: 'g1', personId: 'p1', inviteCode: 'abcabcabcabc' };
    mod.setSession(session);
    expect(mod.getSession()).toEqual(session);

    // A fresh module load reads the persisted session.
    vi.resetModules();
    const fresh = await identity();
    expect(fresh.getSession()).toEqual(session);
  });

  it('clears the session with null', async () => {
    const mod = await identity();
    mod.setSession({ groupId: 'g1', personId: 'p1', inviteCode: 'abcabcabcabc' });
    mod.setSession(null);
    expect(mod.getSession()).toBeNull();
    expect(localStorage.getItem('splitflik:v2:session')).toBeNull();
  });

  it('ignores corrupt persisted sessions', async () => {
    localStorage.setItem('splitflik:v2:session', '{broken');
    const mod = await identity();
    expect(mod.getSession()).toBeNull();
  });
});

describe('invite codes', () => {
  it('generates 20-char base36 codes', async () => {
    const { newInviteCode } = await identity();
    const code = newInviteCode();
    expect(code).toMatch(/^[0-9a-z]{20}$/);
    expect(newInviteCode()).not.toBe(code);
  });

  it('builds invite URLs from the current origin', async () => {
    vi.stubGlobal('location', { origin: 'https://splitflik.si', pathname: '/' });
    const { inviteUrl } = await identity();
    expect(inviteUrl('abc123')).toBe('https://splitflik.si/#/join/abc123');
  });

  it('parses pasted links and raw codes', async () => {
    const { parseInviteInput } = await identity();
    expect(parseInviteInput('https://splitflik.si/#/join/a1b2c3d4e5f6g7h8i9j0')).toBe(
      'a1b2c3d4e5f6g7h8i9j0',
    );
    expect(parseInviteInput('  A1B2C3D4E5F6G7H8I9J0 ')).toBe('a1b2c3d4e5f6g7h8i9j0');
    expect(parseInviteInput('kratko')).toBeNull();
    expect(parseInviteInput('')).toBeNull();
    expect(parseInviteInput('ne veljavna koda!')).toBeNull();
  });
});
