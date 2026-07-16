// In-memory stand-in for src/lib/storage.ts, used when Supabase is not
// configured. Same public surface and same optimistic semantics, but no network
// — so the whole app is explorable locally with realistic seeded data. Screens
// never import this directly; store.ts picks it over the real SDK.
import type { AppState } from '../../lib/storage';
import type { Friend, FriendRequest, Group, Outing, Person, Settlement, SettlementDraft } from '../../types';
import type { Expense } from '../../types';
import { buildDemoData, DEMO_AUTH_USER, DEMO_INVITE_CODE, DEMO_ME_ID } from './demoSeed';
import { setActiveCurrency } from '../../lib/format';

// User-level demo state (groups list + friends roster), separate from the
// single active-group snapshot in `state`.
let demoGroups: Group[] = [];
let demoFriends: Friend[] = [];
let demoRequests: FriendRequest[] = [];
let demoInited = false;
const createdGroupPeople: Record<string, Person[]> = {};

function ensureDemoInit(): void {
  if (demoInited) return; // seed once — leaving every group must not re-seed
  demoInited = true;
  const d = buildDemoData();
  demoGroups = [d.group];
  demoFriends = d.people
    .filter((p) => p.id !== DEMO_ME_ID && p.phone)
    .map((p) => ({
      owner: DEMO_AUTH_USER,
      phone: p.phone as string,
      ...(p.name ? { name: p.name } : {}),
      ...(p.avatarUrl ? { avatarUrl: p.avatarUrl } : {}),
    }));
  // A sample incoming request (to the demo user's phone) so the flow is visible.
  demoRequests = [
    {
      id: 'req-demo-1',
      fromOwner: 'u-nejc',
      fromName: 'Nejc Kovač',
      fromPhone: '031444555',
      toPhone: '041234567',
      status: 'pending',
      createdAt: Date.now() - 3_600_000,
    },
  ];
}

function seededState(): AppState {
  const data = buildDemoData();
  return {
    status: 'ready',
    authUserId: DEMO_AUTH_USER,
    group: data.group,
    people: data.people,
    outings: data.outings,
    expenses: data.expenses,
    settlements: data.settlements,
    toast: null,
  };
}

let state: AppState = seededState();
const listeners = new Set<() => void>();

function notify(): void {
  for (const l of listeners) l();
}

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  notify();
}

export function getState(): AppState {
  return state;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isConfigured(): boolean {
  return false;
}

// --- Toast (mirrors storage.ts timing) ---

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function toast(message: string): void {
  clearTimeout(toastTimer);
  state = { ...state, toast: message };
  notify();
  toastTimer = setTimeout(() => {
    state = { ...state, toast: null };
    notify();
  }, 4000);
}

// --- Auth (no-op; always "signed in" as the demo user) ---

export function initAuth(): void {
  if (state.authUserId === 'loading') setState({ authUserId: DEMO_AUTH_USER });
}

export async function authSignUp(): Promise<'ok' | 'confirm'> {
  setState({ authUserId: DEMO_AUTH_USER });
  return 'ok';
}

export async function authSignIn(): Promise<void> {
  setState({ authUserId: DEMO_AUTH_USER });
}

export async function authSignOut(): Promise<void> {
  // keep the demo user; the group session is what the gate clears
}

// --- Group lifecycle ---

export async function initGroup(groupId: string): Promise<void> {
  ensureDemoInit();
  if (groupId === 'g-demo') {
    const data = buildDemoData();
    setActiveCurrency(data.group.currency);
    setState({
      status: 'ready',
      group: data.group,
      people: data.people,
      outings: data.outings,
      expenses: data.expenses,
      settlements: data.settlements,
    });
    return;
  }
  const group = demoGroups.find((g) => g.id === groupId);
  setActiveCurrency(group?.currency);
  setState({
    status: 'ready',
    group: group ?? { id: groupId, name: 'Moja skupina', inviteCode: '', createdAt: Date.now() },
    people: createdGroupPeople[groupId] ?? [],
    outings: [],
    expenses: [],
    settlements: [],
  });
}

export function teardownGroup(): void {
  // nothing to tear down in memory
}

export async function refetch(): Promise<void> {
  // no-op — the in-memory state is always current
}

// --- Pre-session actions ---

export async function createGroup(
  groupName: string,
  inviteCode: string,
  founder: { name: string; phone?: string; claimedBy: string },
  currency: string = 'EUR',
): Promise<{ groupId: string; personId: string }> {
  const groupId = crypto.randomUUID();
  const personId = crypto.randomUUID();
  const group: Group = { id: groupId, name: groupName, inviteCode, currency, createdAt: Date.now() };
  const person: Person = {
    id: personId,
    groupId,
    name: founder.name,
    ...(founder.phone ? { phone: founder.phone } : {}),
    claimedBy: founder.claimedBy,
  };
  ensureDemoInit();
  demoGroups = [...demoGroups, group];
  createdGroupPeople[groupId] = [person];
  setActiveCurrency(currency);
  setState({ status: 'ready', group, people: [person], outings: [], expenses: [], settlements: [] });
  return { groupId, personId };
}

// --- User-level: my groups + friends roster ---

export async function fetchMyGroups(): Promise<{ group: Group; personId: string }[]> {
  ensureDemoInit();
  return demoGroups.map((group) => {
    if (group.id === 'g-demo') return { group, personId: DEMO_ME_ID };
    const founder = (createdGroupPeople[group.id] ?? []).find((p) => p.claimedBy === DEMO_AUTH_USER);
    return { group, personId: founder?.id ?? DEMO_ME_ID };
  });
}

export async function lookupPersonByPhone(
  phone: string,
): Promise<{ name: string; avatarUrl?: string } | null> {
  const d = buildDemoData();
  const person = d.people.find((p) => p.phone === phone);
  if (!person) return null;
  return { name: person.name, ...(person.avatarUrl ? { avatarUrl: person.avatarUrl } : {}) };
}

export async function listFriends(): Promise<Friend[]> {
  ensureDemoInit();
  return demoFriends;
}

export async function addFriend(userId: string, phone: string): Promise<Friend> {
  ensureDemoInit();
  const profile = await lookupPersonByPhone(phone);
  const friend: Friend = {
    owner: userId,
    phone,
    ...(profile?.name ? { name: profile.name } : {}),
    ...(profile?.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
  };
  if (!demoFriends.some((f) => f.phone === phone)) demoFriends = [...demoFriends, friend];
  return friend;
}

export async function removeFriend(_userId: string, phone: string): Promise<void> {
  demoFriends = demoFriends.filter((f) => f.phone !== phone);
}

export async function leaveGroup(groupId: string, _userId: string): Promise<void> {
  demoGroups = demoGroups.filter((g) => g.id !== groupId);
  delete createdGroupPeople[groupId];
}

export async function addGroupMembers(
  groupId: string,
  members: { name?: string; phone: string; avatarUrl?: string }[],
): Promise<void> {
  const people: Person[] = members.map((m) => ({
    id: crypto.randomUUID(),
    groupId,
    name: m.name ?? m.phone,
    phone: m.phone,
    ...(m.avatarUrl ? { avatarUrl: m.avatarUrl } : {}),
  }));
  createdGroupPeople[groupId] = [...(createdGroupPeople[groupId] ?? []), ...people];
  if (state.group?.id === groupId) setState({ people: [...state.people, ...people] });
}

export async function updateFriendName(_userId: string, phone: string, name: string): Promise<void> {
  demoFriends = demoFriends.map((f) => (f.phone === phone ? { ...f, name } : f));
}

export async function sendFriendRequest(
  from: { userId: string; name?: string; phone?: string; avatarUrl?: string },
  toPhone: string,
): Promise<void> {
  ensureDemoInit();
  demoRequests = demoRequests.filter((r) => !(r.fromOwner === from.userId && r.toPhone === toPhone));
  demoRequests = [
    ...demoRequests,
    {
      id: crypto.randomUUID(),
      fromOwner: from.userId,
      ...(from.name ? { fromName: from.name } : {}),
      ...(from.phone ? { fromPhone: from.phone } : {}),
      ...(from.avatarUrl ? { fromAvatarUrl: from.avatarUrl } : {}),
      toPhone,
      status: 'pending',
      createdAt: Date.now(),
    },
  ];
}

export async function listIncomingRequests(myPhone: string): Promise<FriendRequest[]> {
  ensureDemoInit();
  return demoRequests.filter((r) => r.toPhone === myPhone && r.status === 'pending');
}

export async function listOutgoingRequests(userId: string): Promise<FriendRequest[]> {
  ensureDemoInit();
  return demoRequests.filter((r) => r.fromOwner === userId && r.status === 'pending');
}

export async function acceptFriendRequest(
  req: FriendRequest,
  me: { userId: string; name?: string; phone?: string; avatarUrl?: string },
): Promise<void> {
  demoRequests = demoRequests.map((r) => (r.id === req.id ? { ...r, status: 'accepted' } : r));
  if (req.fromPhone && !demoFriends.some((f) => f.phone === req.fromPhone)) {
    demoFriends = [
      ...demoFriends,
      {
        owner: me.userId,
        phone: req.fromPhone,
        ...(req.fromName ? { name: req.fromName } : {}),
        ...(req.fromAvatarUrl ? { avatarUrl: req.fromAvatarUrl } : {}),
      },
    ];
  }
}

export async function declineFriendRequest(requestId: string): Promise<void> {
  demoRequests = demoRequests.map((r) => (r.id === requestId ? { ...r, status: 'declined' } : r));
}

export async function fetchGroupByInvite(
  inviteCode: string,
): Promise<{ group: Group; people: Person[] } | null> {
  if (inviteCode === DEMO_INVITE_CODE) {
    const data = buildDemoData();
    return { group: data.group, people: data.people };
  }
  return null;
}

export async function claimPerson(personId: string, userId: string): Promise<void> {
  setState({
    people: state.people.map((p) => (p.id === personId ? { ...p, claimedBy: userId } : p)),
  });
}

export async function claimPersonWithName(
  personId: string,
  userId: string,
  name: string,
  avatarUrl?: string,
): Promise<void> {
  setState({
    people: state.people.map((p) =>
      p.id === personId ? { ...p, claimedBy: userId, name, ...(avatarUrl ? { avatarUrl } : {}) } : p,
    ),
  });
}

export async function fetchPendingByPhone(
  phone: string,
): Promise<{ group: Group; person: Person } | null> {
  const person = state.people.find((p) => p.phone === phone && !p.claimedBy);
  if (!person || !state.group) return null;
  return { group: state.group, person };
}

export async function joinAsNewPerson(
  groupId: string,
  name: string,
  phone: string | undefined,
  userId: string,
  avatarUrl?: string,
): Promise<string> {
  const personId = crypto.randomUUID();
  const person: Person = {
    id: personId,
    groupId,
    name,
    ...(phone ? { phone } : {}),
    claimedBy: userId,
    ...(avatarUrl ? { avatarUrl } : {}),
  };
  setState({ people: [...state.people, person] });
  return personId;
}

// --- In-group actions ---

export function savePerson(person: Person, isNew: boolean): void {
  setState({
    people: isNew
      ? [...state.people, person]
      : state.people.map((p) => (p.id === person.id ? person : p)),
  });
}

export function deletePerson(personId: string): void {
  setState({ people: state.people.filter((p) => p.id !== personId) });
}

export function createOuting(name: string, participantIds: string[]): string {
  const group = state.group;
  if (!group) throw new Error('no active group');
  const outing: Outing = {
    id: crypto.randomUUID(),
    groupId: group.id,
    name,
    participantIds,
    currentCycle: 1,
    createdAt: Date.now(),
  };
  setState({ outings: [...state.outings, outing] });
  return outing.id;
}

export function updateOuting(outing: Outing): void {
  setState({ outings: state.outings.map((o) => (o.id === outing.id ? outing : o)) });
}

export function deleteOuting(outingId: string): void {
  setState({
    outings: state.outings.filter((o) => o.id !== outingId),
    expenses: state.expenses.filter((e) => e.outingId !== outingId),
    settlements: state.settlements.filter((s) => s.outingId !== outingId),
  });
}

export function saveExpense(expense: Expense, isNew: boolean): void {
  setState({
    expenses: isNew
      ? [...state.expenses, expense]
      : state.expenses.map((e) => (e.id === expense.id ? expense : e)),
  });
}

export function deleteExpense(expenseId: string): void {
  setState({ expenses: state.expenses.filter((e) => e.id !== expenseId) });
}

export function settleOuting(outing: Outing, drafts: SettlementDraft[]): void {
  if (drafts.length === 0) return;
  const now = Date.now();
  const rows: Settlement[] = drafts.map((d) => ({
    ...d,
    id: crypto.randomUUID(),
    status: 'pending' as const,
    createdAt: now,
  }));
  setState({
    settlements: [...state.settlements, ...rows],
    outings: state.outings.map((o) =>
      o.id === outing.id ? { ...o, currentCycle: o.currentCycle + 1 } : o,
    ),
  });
}

export function markSettlementPaid(settlementId: string): void {
  const paidAt = Date.now();
  setState({
    settlements: state.settlements.map((s) =>
      s.id === settlementId ? { ...s, status: 'paid' as const, paidAt } : s,
    ),
  });
}

export function setGroupCurrency(groupId: string, currency: string): void {
  setActiveCurrency(currency);
  demoGroups = demoGroups.map((g) => (g.id === groupId ? { ...g, currency } : g));
  if (state.group?.id === groupId) setState({ group: { ...state.group, currency } });
}
