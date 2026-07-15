import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  expenseFromRow,
  groupFromRow,
  outingFromRow,
  personFromRow,
  readLocal,
  settlementFromRow,
  writeLocal,
} from './storage';

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
  vi.stubGlobal('localStorage', mockLocalStorage());
});

describe('local key-value helpers', () => {
  it('round-trips values and removes on null', () => {
    expect(readLocal('k')).toBeNull();
    writeLocal('k', 'v');
    expect(readLocal('k')).toBe('v');
    writeLocal('k', null);
    expect(readLocal('k')).toBeNull();
  });

  it('never throws when localStorage is unavailable', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(readLocal('k')).toBeNull();
    expect(() => writeLocal('k', 'v')).not.toThrow();
  });
});

describe('row mapping', () => {
  const ts = '2026-07-14T10:00:00.000Z';
  const ms = Date.parse(ts);

  it('maps group rows', () => {
    expect(
      groupFromRow({ id: 'g1', name: 'Sošolci', invite_code: 'abc123abc123', created_at: ts }),
    ).toEqual({ id: 'g1', name: 'Sošolci', inviteCode: 'abc123abc123', createdAt: ms });
  });

  it('maps person rows, omitting null phone and claimed_by', () => {
    const bare = personFromRow({
      id: 'p1',
      group_id: 'g1',
      name: 'Ana',
      phone: null,
      claimed_by: null,
      created_at: ts,
    });
    expect(bare).toEqual({ id: 'p1', groupId: 'g1', name: 'Ana' });
    expect('phone' in bare).toBe(false);

    const full = personFromRow({
      id: 'p2',
      group_id: 'g1',
      name: 'Bor',
      phone: '031123456',
      claimed_by: 'dev-1',
      created_at: ts,
    });
    expect(full.phone).toBe('031123456');
    expect(full.claimedBy).toBe('dev-1');
  });

  it('maps outing rows', () => {
    expect(
      outingFromRow({
        id: 'o1',
        group_id: 'g1',
        name: 'Večerja',
        participant_ids: ['p1', 'p2'],
        current_cycle: 3,
        created_at: ts,
      }),
    ).toEqual({
      id: 'o1',
      groupId: 'g1',
      name: 'Večerja',
      participantIds: ['p1', 'p2'],
      currentCycle: 3,
      createdAt: ms,
    });
  });

  it('maps expense rows including the split JSON', () => {
    const row = expenseFromRow({
      id: 'e1',
      outing_id: 'o1',
      group_id: 'g1',
      description: 'Pica',
      amount_cents: 1250,
      payer_id: 'p1',
      split: { mode: 'equal', participantIds: ['p1', 'p2'] },
      cycle: 2,
      created_at: ts,
    });
    expect(row.amountCents).toBe(1250);
    expect(row.cycle).toBe(2);
    expect(row.split).toEqual({ mode: 'equal', participantIds: ['p1', 'p2'] });
  });

  it('maps settlement rows with and without paid_at', () => {
    const pending = settlementFromRow({
      id: 's1',
      outing_id: 'o1',
      group_id: 'g1',
      cycle: 1,
      from_id: 'p1',
      to_id: 'p2',
      amount_cents: 500,
      status: 'pending',
      created_at: ts,
      paid_at: null,
    });
    expect(pending.status).toBe('pending');
    expect('paidAt' in pending).toBe(false);

    const paid = settlementFromRow({
      id: 's2',
      outing_id: 'o1',
      group_id: 'g1',
      cycle: 1,
      from_id: 'p1',
      to_id: 'p2',
      amount_cents: 500,
      status: 'paid',
      created_at: ts,
      paid_at: ts,
    });
    expect(paid.paidAt).toBe(ms);
  });
});
