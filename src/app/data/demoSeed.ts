// Demo dataset used when Supabase isn't configured (local dev / preview without
// keys). Hand-crafted so the real engine derives a coherent story: a couple of
// settled outings that produced pending + paid settlements, and a couple of
// open outings whose live balances feed Home / Friends / Stats. All amounts are
// integer cents; splits are valid for the engine.
import type { Expense, Group, Outing, Person, Settlement } from '../../types';
import type { GroupSession } from '../../lib/identity';

export interface DemoData {
  group: Group;
  people: Person[];
  outings: Outing[];
  expenses: Expense[];
  settlements: Settlement[];
  session: GroupSession;
}

const DAY = 86_400_000;

export const DEMO_ME_ID = 'nina';
export const DEMO_AUTH_USER = 'demo-user';
export const DEMO_INVITE_CODE = 'delidemokoda01';

/** Session that drops you straight into the seeded demo group. */
export const DEMO_SESSION: GroupSession = {
  groupId: 'g-demo',
  personId: DEMO_ME_ID,
  inviteCode: DEMO_INVITE_CODE,
};

export function buildDemoData(): DemoData {
  const now = Date.now();
  const ago = (days: number) => now - days * DAY;

  const group: Group = {
    id: 'g-demo',
    name: 'Cimri & prijatelji',
    inviteCode: DEMO_INVITE_CODE,
    createdAt: ago(30),
  };

  const people: Person[] = [
    { id: 'nina', groupId: group.id, name: 'Nina Kovač', phone: '041234567', claimedBy: DEMO_AUTH_USER },
    { id: 'joze', groupId: group.id, name: 'Jože Novak', phone: '031111222' },
    { id: 'maja', groupId: group.id, name: 'Maja Horvat', phone: '040555666' },
    { id: 'luka', groupId: group.id, name: 'Luka Zupan', phone: '051777888' },
    { id: 'ana', groupId: group.id, name: 'Ana Krajnc', phone: '030999000' },
    { id: 'tine', groupId: group.id, name: 'Tine Mlakar', phone: '064321987' },
  ];

  const outings: Outing[] = [
    { id: 'o-piknik', groupId: group.id, name: 'Piknik ob reki', participantIds: ['nina', 'joze', 'maja', 'luka'], currentCycle: 2, createdAt: ago(21) },
    { id: 'o-kava', groupId: group.id, name: 'Kavarna Rog', participantIds: ['nina', 'ana'], currentCycle: 2, createdAt: ago(25) },
    { id: 'o-spar', groupId: group.id, name: 'Špar nakup', participantIds: ['nina', 'tine'], currentCycle: 2, createdAt: ago(23) },
    { id: 'o-kino', groupId: group.id, name: 'Kino sreda', participantIds: ['nina', 'tine'], currentCycle: 1, createdAt: ago(5) },
    { id: 'o-kosilo', groupId: group.id, name: 'Kosilo v petek', participantIds: ['nina', 'joze', 'maja', 'luka', 'tine'], currentCycle: 1, createdAt: ago(2) },
  ];

  const expenses: Expense[] = [
    // o-piknik (settled cycle 1)
    { id: 'e-p1', outingId: 'o-piknik', groupId: group.id, description: 'Mercator', amountCents: 4230, payerId: 'nina', split: { mode: 'equal', participantIds: ['nina', 'joze', 'maja', 'luka'] }, cycle: 1, createdAt: ago(21) },
    { id: 'e-p2', outingId: 'o-piknik', groupId: group.id, description: 'Pijača', amountCents: 1200, payerId: 'luka', split: { mode: 'equal', participantIds: ['nina', 'joze', 'maja', 'luka'] }, cycle: 1, createdAt: ago(21) },
    // o-kava (settled)
    { id: 'e-kava', outingId: 'o-kava', groupId: group.id, description: 'Kavarna Rog', amountCents: 640, payerId: 'ana', split: { mode: 'equal', participantIds: ['nina', 'ana'] }, cycle: 1, createdAt: ago(25) },
    // o-spar (settled)
    { id: 'e-spar', outingId: 'o-spar', groupId: group.id, description: 'Špar', amountCents: 900, payerId: 'tine', split: { mode: 'equal', participantIds: ['nina', 'tine'] }, cycle: 1, createdAt: ago(23) },
    // o-kino (open) — Nina fronted the big one; Tine owes her
    { id: 'e-c1', outingId: 'o-kino', groupId: group.id, description: 'Kino + kokice', amountCents: 2626, payerId: 'nina', split: { mode: 'equal', participantIds: ['nina', 'tine'] }, cycle: 1, createdAt: ago(5) },
    { id: 'e-c2', outingId: 'o-kino', groupId: group.id, description: 'Prevoz', amountCents: 900, payerId: 'tine', split: { mode: 'equal', participantIds: ['nina', 'tine'] }, cycle: 1, createdAt: ago(5) },
    // o-kosilo (open) — an items-mode bill + an equal one
    {
      id: 'e-k1',
      outingId: 'o-kosilo',
      groupId: group.id,
      description: 'Hood Burger',
      amountCents: 3160,
      payerId: 'joze',
      split: {
        mode: 'items',
        items: [
          { label: 'Burger', amountCents: 1580, participantIds: ['nina', 'joze'] },
          { label: 'Krompirček', amountCents: 780, participantIds: ['maja', 'luka'] },
          { label: 'Pijača', amountCents: 800, participantIds: ['nina', 'joze', 'maja', 'luka', 'tine'] },
        ],
      },
      cycle: 1,
      createdAt: ago(2),
    },
    { id: 'e-k2', outingId: 'o-kosilo', groupId: group.id, description: 'Sladoled', amountCents: 1000, payerId: 'nina', split: { mode: 'equal', participantIds: ['nina', 'joze', 'tine'] }, cycle: 1, createdAt: ago(2) },
  ];

  const settlements: Settlement[] = [
    // o-piknik settle (cycle 1): Nina was the big creditor
    { id: 's-1', outingId: 'o-piknik', groupId: group.id, cycle: 1, fromId: 'joze', toId: 'nina', amountCents: 1358, status: 'pending', createdAt: ago(1) },
    { id: 's-2', outingId: 'o-piknik', groupId: group.id, cycle: 1, fromId: 'maja', toId: 'nina', amountCents: 1357, status: 'paid', createdAt: ago(20), paidAt: ago(19) },
    { id: 's-3', outingId: 'o-piknik', groupId: group.id, cycle: 1, fromId: 'luka', toId: 'nina', amountCents: 158, status: 'pending', createdAt: ago(6) },
    // o-kava settle: Nina owes Ana (still pending → I owe)
    { id: 's-kava', outingId: 'o-kava', groupId: group.id, cycle: 1, fromId: 'nina', toId: 'ana', amountCents: 320, status: 'pending', createdAt: ago(3) },
    // o-spar settle: Nina already paid Tine
    { id: 's-spar', outingId: 'o-spar', groupId: group.id, cycle: 1, fromId: 'nina', toId: 'tine', amountCents: 450, status: 'paid', createdAt: ago(22), paidAt: ago(21) },
  ];

  const session: GroupSession = {
    groupId: group.id,
    personId: DEMO_ME_ID,
    inviteCode: DEMO_INVITE_CODE,
  };

  return { group, people, outings, expenses, settlements, session };
}
