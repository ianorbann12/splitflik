// In-memory stand-in for src/lib/storage.ts, used when Supabase is not
// configured. Same public surface and same optimistic semantics, but no network
// — so the whole app is explorable locally with realistic seeded data. Screens
// never import this directly; store.ts picks it over the real SDK.
import type { AppState } from '../../lib/storage';
import type { Group, Outing, Person, Settlement, SettlementDraft } from '../../types';
import type { Expense } from '../../types';
import { buildDemoData, DEMO_AUTH_USER, DEMO_INVITE_CODE } from './demoSeed';

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
  if (groupId === 'g-demo') {
    const data = buildDemoData();
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
  // A freshly created/joined demo group keeps whatever createGroup/join set.
  if (!state.group || state.group.id !== groupId) {
    setState({ status: 'ready', group: { id: groupId, name: 'Moja skupina', inviteCode: '', createdAt: Date.now() } });
  }
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
): Promise<{ groupId: string; personId: string }> {
  const groupId = crypto.randomUUID();
  const personId = crypto.randomUUID();
  const group: Group = { id: groupId, name: groupName, inviteCode, createdAt: Date.now() };
  const person: Person = {
    id: personId,
    groupId,
    name: founder.name,
    ...(founder.phone ? { phone: founder.phone } : {}),
    claimedBy: founder.claimedBy,
  };
  setState({ status: 'ready', group, people: [person], outings: [], expenses: [], settlements: [] });
  return { groupId, personId };
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
