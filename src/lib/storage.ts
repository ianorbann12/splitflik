// Supabase adapter (PLAN.md §10) — the only module that touches Supabase or
// localStorage (CLAUDE.md rule 8). Screens read a synchronous in-memory
// snapshot (useSyncExternalStore-compatible) and call the action functions
// below; writes apply optimistically and roll back with a toast on failure.
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from '@supabase/supabase-js';
import type {
  Expense,
  Friend,
  Group,
  Outing,
  Person,
  Settlement,
  SettlementDraft,
  SplitSpec,
} from '../types';
import { STR } from './strings';
import { setActiveCurrency } from './format';

const CACHE_KEY = 'splitflik:v2:cache';

// --- Local key-value helpers (the only localStorage access in the app) ---

export function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocal(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // best effort
  }
}

// --- Config / client ---

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export function isConfigured(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Supabase is not configured');
  // The auth session persists under supabase-js's own localStorage key — the
  // documented exception to CLAUDE.md rule 8 (see PLAN.md §5).
  client ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

// --- Row mapping (snake_case DB ↔ camelCase domain) ---

interface GroupRow {
  id: string;
  name: string;
  invite_code: string;
  // Optional: absent while the DB column is being rolled out (defaults to EUR).
  currency?: string | null;
  created_at: string;
}
interface PersonRow {
  id: string;
  group_id: string;
  name: string;
  phone: string | null;
  claimed_by: string | null;
  avatar_url: string | null;
  created_at: string;
}
interface OutingRow {
  id: string;
  group_id: string;
  name: string;
  participant_ids: string[];
  current_cycle: number;
  created_at: string;
}
interface ExpenseRow {
  id: string;
  outing_id: string;
  group_id: string;
  description: string;
  amount_cents: number;
  payer_id: string;
  split: SplitSpec;
  cycle: number;
  created_at: string;
}
interface SettlementRow {
  id: string;
  outing_id: string;
  group_id: string;
  cycle: number;
  from_id: string;
  to_id: string;
  amount_cents: number;
  status: 'pending' | 'paid';
  created_at: string;
  paid_at: string | null;
}

export function groupFromRow(r: GroupRow): Group {
  return {
    id: r.id,
    name: r.name,
    inviteCode: r.invite_code,
    ...(r.currency ? { currency: r.currency } : {}),
    createdAt: Date.parse(r.created_at),
  };
}
export function personFromRow(r: PersonRow): Person {
  return {
    id: r.id,
    groupId: r.group_id,
    name: r.name,
    ...(r.phone ? { phone: r.phone } : {}),
    ...(r.claimed_by ? { claimedBy: r.claimed_by } : {}),
    ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
  };
}
export function outingFromRow(r: OutingRow): Outing {
  return {
    id: r.id,
    groupId: r.group_id,
    name: r.name,
    participantIds: r.participant_ids,
    currentCycle: r.current_cycle,
    createdAt: Date.parse(r.created_at),
  };
}
export function expenseFromRow(r: ExpenseRow): Expense {
  return {
    id: r.id,
    outingId: r.outing_id,
    groupId: r.group_id,
    description: r.description,
    amountCents: r.amount_cents,
    payerId: r.payer_id,
    split: r.split,
    cycle: r.cycle,
    createdAt: Date.parse(r.created_at),
  };
}
export function settlementFromRow(r: SettlementRow): Settlement {
  return {
    id: r.id,
    outingId: r.outing_id,
    groupId: r.group_id,
    cycle: r.cycle,
    fromId: r.from_id,
    toId: r.to_id,
    amountCents: r.amount_cents,
    status: r.status,
    createdAt: Date.parse(r.created_at),
    ...(r.paid_at ? { paidAt: Date.parse(r.paid_at) } : {}),
  };
}

function personToRow(p: Person): Omit<PersonRow, 'created_at'> {
  return {
    id: p.id,
    group_id: p.groupId,
    name: p.name,
    phone: p.phone ?? null,
    claimed_by: p.claimedBy ?? null,
    avatar_url: p.avatarUrl ?? null,
  };
}
function expenseToRow(e: Expense): Omit<ExpenseRow, 'created_at'> {
  return {
    id: e.id,
    outing_id: e.outingId,
    group_id: e.groupId,
    description: e.description,
    amount_cents: e.amountCents,
    payer_id: e.payerId,
    split: e.split,
    cycle: e.cycle,
  };
}

// --- In-memory state ---

export interface AppState {
  status: 'idle' | 'loading' | 'ready' | 'error';
  /** 'loading' until the persisted auth session has been read (PLAN.md §5). */
  authUserId: string | null | 'loading';
  group: Group | null;
  people: Person[];
  outings: Outing[];
  expenses: Expense[];
  settlements: Settlement[];
  toast: string | null;
}

const initialState: AppState = {
  status: 'idle',
  authUserId: 'loading',
  group: null,
  people: [],
  outings: [],
  expenses: [],
  settlements: [],
  toast: null,
};

let state: AppState = initialState;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<AppState>): void {
  state = { ...state, ...patch };
  persistCache();
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

// --- Toast ---

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

// --- Offline cache (last known group snapshot) ---

interface CacheShape {
  group: Group;
  people: Person[];
  outings: Outing[];
  expenses: Expense[];
  settlements: Settlement[];
}

function isCache(v: unknown): v is CacheShape {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c['group'] === 'object' &&
    c['group'] !== null &&
    Array.isArray(c['people']) &&
    Array.isArray(c['outings']) &&
    Array.isArray(c['expenses']) &&
    Array.isArray(c['settlements'])
  );
}

function persistCache(): void {
  if (!state.group) return;
  const cache: CacheShape = {
    group: state.group,
    people: state.people,
    outings: state.outings,
    expenses: state.expenses,
    settlements: state.settlements,
  };
  writeLocal(CACHE_KEY, JSON.stringify(cache));
}

function loadCache(groupId: string): CacheShape | null {
  const raw = readLocal(CACHE_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (isCache(parsed) && parsed.group.id === groupId) return parsed;
  } catch {
    // ignore corrupt cache
  }
  return null;
}

// --- Group lifecycle: init, refetch, realtime ---

let channel: RealtimeChannel | null = null;
let activeGroupId: string | null = null;
let refetchTimer: ReturnType<typeof setTimeout> | undefined;

function scheduleRefetch(): void {
  clearTimeout(refetchTimer);
  refetchTimer = setTimeout(() => void refetch(), 250);
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && activeGroupId) scheduleRefetch();
  });
}

export async function initGroup(groupId: string): Promise<void> {
  activeGroupId = groupId;
  const cached = loadCache(groupId);
  const authUserId = state.authUserId;
  state = cached
    ? { ...initialState, ...cached, authUserId, status: 'loading' }
    : { ...initialState, authUserId, status: 'loading' };
  notify();

  if (channel) {
    void db().removeChannel(channel);
    channel = null;
  }
  channel = db().channel(`group-${groupId}`);
  const tables = ['groups', 'people', 'outings', 'expenses', 'settlements'] as const;
  for (const table of tables) {
    channel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table,
        filter: table === 'groups' ? `id=eq.${groupId}` : `group_id=eq.${groupId}`,
      },
      scheduleRefetch,
    );
  }
  channel.subscribe();

  await refetch();
}

export function teardownGroup(): void {
  if (channel) {
    void db().removeChannel(channel);
    channel = null;
  }
  activeGroupId = null;
  setActiveCurrency(null);
  state = { ...initialState, authUserId: state.authUserId };
  writeLocal(CACHE_KEY, null);
  notify();
}

// --- Auth (PLAN.md §5) — email + password via Supabase Auth ---

let authInitialized = false;

/** Reads the persisted auth session and tracks changes. Call once at startup. */
export function initAuth(): void {
  if (authInitialized || !isConfigured()) return;
  authInitialized = true;
  void db()
    .auth.getSession()
    .then(({ data }) => setState({ authUserId: data.session?.user.id ?? null }))
    .catch(() => setState({ authUserId: null }));
  db().auth.onAuthStateChange((_event, session) => {
    setState({ authUserId: session?.user.id ?? null });
  });
}

/** Returns 'confirm' when the project still requires email confirmation. */
export async function authSignUp(email: string, password: string): Promise<'ok' | 'confirm'> {
  const { data, error } = await db().auth.signUp({ email, password });
  if (error) throw error;
  return data.session ? 'ok' : 'confirm';
}

export async function authSignIn(email: string, password: string): Promise<void> {
  const { error } = await db().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function authSignOut(): Promise<void> {
  try {
    await db().auth.signOut();
  } catch {
    // the local session is cleared regardless
  }
}

export async function refetch(): Promise<void> {
  const groupId = activeGroupId;
  if (!groupId) return;
  try {
    const [g, pe, ou, ex, se] = await Promise.all([
      db().from('groups').select('*').eq('id', groupId).maybeSingle(),
      db().from('people').select('*').eq('group_id', groupId),
      db().from('outings').select('*').eq('group_id', groupId),
      db().from('expenses').select('*').eq('group_id', groupId),
      db().from('settlements').select('*').eq('group_id', groupId),
    ]);
    const err = g.error ?? pe.error ?? ou.error ?? ex.error ?? se.error;
    if (err) throw err;
    if (groupId !== activeGroupId) return; // group switched mid-flight
    if (!g.data) {
      setState({ status: 'error', group: null });
      return;
    }
    const group = groupFromRow(g.data as GroupRow);
    setActiveCurrency(group.currency);
    setState({
      status: 'ready',
      group,
      people: ((pe.data ?? []) as PersonRow[]).map(personFromRow),
      outings: ((ou.data ?? []) as OutingRow[]).map(outingFromRow),
      expenses: ((ex.data ?? []) as ExpenseRow[]).map(expenseFromRow),
      settlements: ((se.data ?? []) as SettlementRow[]).map(settlementFromRow),
    });
  } catch {
    // Offline or transient failure: keep serving the cached snapshot.
    if (state.group) setState({ status: 'ready' });
    else setState({ status: 'error' });
  }
}

// --- Optimistic write helper ---

function withRollback(optimistic: Partial<AppState>, op: () => Promise<void>): void {
  const prev = state;
  setState(optimistic);
  op().catch(() => {
    state = prev;
    persistCache();
    notify();
    toast(STR.saveFailed);
  });
}

async function throwing<T extends { error: unknown }>(res: PromiseLike<T>): Promise<void> {
  const { error } = await res;
  if (error) throw error;
}

// --- Pre-session actions (create / join a group) ---

export async function createGroup(
  groupName: string,
  inviteCode: string,
  founder: { name: string; phone?: string; claimedBy: string },
  currency: string = 'EUR',
): Promise<{ groupId: string; personId: string }> {
  const groupId = crypto.randomUUID();
  const personId = crypto.randomUUID();
  await throwing(
    db().from('groups').insert({ id: groupId, name: groupName, invite_code: inviteCode, currency }),
  );
  setActiveCurrency(currency);
  await throwing(
    db().from('people').insert({
      id: personId,
      group_id: groupId,
      name: founder.name,
      phone: founder.phone ?? null,
      claimed_by: founder.claimedBy,
    }),
  );
  return { groupId, personId };
}

export async function fetchGroupByInvite(
  inviteCode: string,
): Promise<{ group: Group; people: Person[] } | null> {
  const g = await db().from('groups').select('*').eq('invite_code', inviteCode).maybeSingle();
  if (g.error) throw g.error;
  if (!g.data) return null;
  const group = groupFromRow(g.data as GroupRow);
  const pe = await db().from('people').select('*').eq('group_id', group.id);
  if (pe.error) throw pe.error;
  return { group, people: ((pe.data ?? []) as PersonRow[]).map(personFromRow) };
}

export async function claimPerson(personId: string, userId: string): Promise<void> {
  await throwing(db().from('people').update({ claimed_by: userId }).eq('id', personId));
}

/** Claim a pending person and set the display name (+ optional avatar) to the joiner's. */
export async function claimPersonWithName(
  personId: string,
  userId: string,
  name: string,
  avatarUrl?: string,
): Promise<void> {
  await throwing(
    db()
      .from('people')
      .update({ claimed_by: userId, name, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
      .eq('id', personId),
  );
}

/**
 * Finds a group where a still-unclaimed person was added with this phone number
 * (i.e. someone invited you by phone). Used to join by phone number.
 */
export async function fetchPendingByPhone(
  phone: string,
): Promise<{ group: Group; person: Person } | null> {
  const pe = await db()
    .from('people')
    .select('*')
    .eq('phone', phone)
    .is('claimed_by', null)
    .limit(1);
  if (pe.error) throw pe.error;
  const rows = (pe.data ?? []) as PersonRow[];
  const first = rows[0];
  if (!first) return null;
  const person = personFromRow(first);
  const g = await db().from('groups').select('*').eq('id', person.groupId).maybeSingle();
  if (g.error) throw g.error;
  if (!g.data) return null;
  return { group: groupFromRow(g.data as GroupRow), person };
}

export async function joinAsNewPerson(
  groupId: string,
  name: string,
  phone: string | undefined,
  userId: string,
  avatarUrl?: string,
): Promise<string> {
  const personId = crypto.randomUUID();
  await throwing(
    db().from('people').insert({
      id: personId,
      group_id: groupId,
      name,
      phone: phone ?? null,
      claimed_by: userId,
      avatar_url: avatarUrl ?? null,
    }),
  );
  return personId;
}

// --- User-level: my groups + friends roster ---

interface FriendRow {
  owner: string;
  phone: string;
  name: string | null;
  avatar_url: string | null;
  created_at: string;
}

function friendFromRow(r: FriendRow): Friend {
  return {
    owner: r.owner,
    phone: r.phone,
    ...(r.name ? { name: r.name } : {}),
    ...(r.avatar_url ? { avatarUrl: r.avatar_url } : {}),
  };
}

/** All groups the user is a member of, with the user's person id in each. */
export async function fetchMyGroups(userId: string): Promise<{ group: Group; personId: string }[]> {
  const pe = await db().from('people').select('id,group_id').eq('claimed_by', userId);
  if (pe.error) throw pe.error;
  const rows = (pe.data ?? []) as { id: string; group_id: string }[];
  const myPersonByGroup = new Map<string, string>();
  for (const r of rows) if (!myPersonByGroup.has(r.group_id)) myPersonByGroup.set(r.group_id, r.id);
  if (myPersonByGroup.size === 0) return [];
  const g = await db().from('groups').select('*').in('id', [...myPersonByGroup.keys()]);
  if (g.error) throw g.error;
  return ((g.data ?? []) as GroupRow[])
    .map(groupFromRow)
    .map((group) => ({ group, personId: myPersonByGroup.get(group.id) as string }));
}

/** Looks up a registered person's profile (name + avatar) by phone. */
export async function lookupPersonByPhone(
  phone: string,
): Promise<{ name: string; avatarUrl?: string } | null> {
  const pe = await db()
    .from('people')
    .select('name,avatar_url')
    .eq('phone', phone)
    .not('claimed_by', 'is', null)
    .limit(1);
  if (pe.error) throw pe.error;
  const rows = (pe.data ?? []) as { name: string; avatar_url: string | null }[];
  const first = rows[0];
  if (!first) return null;
  return { name: first.name, ...(first.avatar_url ? { avatarUrl: first.avatar_url } : {}) };
}

export async function listFriends(userId: string): Promise<Friend[]> {
  const f = await db().from('friends').select('*').eq('owner', userId);
  if (f.error) throw f.error;
  return ((f.data ?? []) as FriendRow[]).map(friendFromRow);
}

/** Adds a friend by phone, caching their profile (name + avatar) if registered. */
export async function addFriend(userId: string, phone: string): Promise<Friend> {
  const profile = await lookupPersonByPhone(phone);
  await throwing(
    db()
      .from('friends')
      .upsert(
        { owner: userId, phone, name: profile?.name ?? null, avatar_url: profile?.avatarUrl ?? null },
        { onConflict: 'owner,phone' },
      ),
  );
  return {
    owner: userId,
    phone,
    ...(profile?.name ? { name: profile.name } : {}),
    ...(profile?.avatarUrl ? { avatarUrl: profile.avatarUrl } : {}),
  };
}

export async function removeFriend(userId: string, phone: string): Promise<void> {
  // Guard: both keys required — a missing filter would delete every friend row.
  if (!userId || !phone) throw new Error('removeFriend requires userId and phone');
  await throwing(db().from('friends').delete().eq('owner', userId).eq('phone', phone));
}

/** Renames a friend (their phone can never change — that identifies them). */
export async function updateFriendName(userId: string, phone: string, name: string): Promise<void> {
  await throwing(db().from('friends').update({ name }).eq('owner', userId).eq('phone', phone));
}

/**
 * Leaves a group by un-claiming the user's roster entry (claimed_by → null).
 * History is preserved: the person row and its expenses/settlements stay, so
 * balances remain correct and the entry can be re-claimed later.
 */
export async function leaveGroup(groupId: string, userId: string): Promise<void> {
  if (!groupId || !userId) throw new Error('leaveGroup requires groupId and userId');
  await throwing(
    db().from('people').update({ claimed_by: null }).eq('group_id', groupId).eq('claimed_by', userId),
  );
}

/** Adds friends as pending members of a group; they claim their entry on join. */
export async function addGroupMembers(
  groupId: string,
  members: { name?: string; phone: string; avatarUrl?: string }[],
): Promise<void> {
  if (members.length === 0) return;
  const rows = members.map((m) => ({
    id: crypto.randomUUID(),
    group_id: groupId,
    name: m.name ?? m.phone,
    phone: m.phone,
    avatar_url: m.avatarUrl ?? null,
    claimed_by: null,
  }));
  await throwing(db().from('people').insert(rows));
}

// --- In-group actions (optimistic, fire-and-forget) ---

function requireGroup(): Group {
  if (!state.group) throw new Error('no active group');
  return state.group;
}

export function savePerson(person: Person, isNew: boolean): void {
  withRollback(
    {
      people: isNew
        ? [...state.people, person]
        : state.people.map((p) => (p.id === person.id ? person : p)),
    },
    () =>
      isNew
        ? throwing(db().from('people').insert(personToRow(person)))
        : throwing(db().from('people').update(personToRow(person)).eq('id', person.id)),
  );
}

export function deletePerson(personId: string): void {
  // Guard: never issue a delete with an empty id — an undefined filter would
  // become an unfiltered DELETE that wipes the whole table (CLAUDE.md rule 3).
  if (!personId) return;
  withRollback(
    { people: state.people.filter((p) => p.id !== personId) },
    () => throwing(db().from('people').delete().eq('id', personId)),
  );
}

export function createOuting(name: string, participantIds: string[]): string {
  const group = requireGroup();
  const outing: Outing = {
    id: crypto.randomUUID(),
    groupId: group.id,
    name,
    participantIds,
    currentCycle: 1,
    createdAt: Date.now(),
  };
  withRollback({ outings: [...state.outings, outing] }, () =>
    throwing(
      db().from('outings').insert({
        id: outing.id,
        group_id: outing.groupId,
        name: outing.name,
        participant_ids: outing.participantIds,
        current_cycle: 1,
      }),
    ),
  );
  return outing.id;
}

export function updateOuting(outing: Outing): void {
  withRollback(
    { outings: state.outings.map((o) => (o.id === outing.id ? outing : o)) },
    () =>
      throwing(
        db()
          .from('outings')
          .update({ name: outing.name, participant_ids: outing.participantIds })
          .eq('id', outing.id),
      ),
  );
}

export function deleteOuting(outingId: string): void {
  if (!outingId) return; // guard against an unfiltered DELETE (see deletePerson)
  withRollback(
    {
      outings: state.outings.filter((o) => o.id !== outingId),
      expenses: state.expenses.filter((e) => e.outingId !== outingId),
      settlements: state.settlements.filter((s) => s.outingId !== outingId),
    },
    // FK cascades remove the outing's expenses and settlements server-side.
    () => throwing(db().from('outings').delete().eq('id', outingId)),
  );
}

export function saveExpense(expense: Expense, isNew: boolean): void {
  withRollback(
    {
      expenses: isNew
        ? [...state.expenses, expense]
        : state.expenses.map((e) => (e.id === expense.id ? expense : e)),
    },
    () =>
      isNew
        ? throwing(db().from('expenses').insert(expenseToRow(expense)))
        : throwing(db().from('expenses').update(expenseToRow(expense)).eq('id', expense.id)),
  );
}

export function deleteExpense(expenseId: string): void {
  if (!expenseId) return; // guard against an unfiltered DELETE (see deletePerson)
  withRollback(
    { expenses: state.expenses.filter((e) => e.id !== expenseId) },
    () => throwing(db().from('expenses').delete().eq('id', expenseId)),
  );
}

/** Settlement snapshot (PLAN.md §6.3): atomic via the settle_outing RPC. */
export function settleOuting(outing: Outing, drafts: SettlementDraft[]): void {
  if (drafts.length === 0) return;
  const now = Date.now();
  const rows: Settlement[] = drafts.map((d) => ({
    ...d,
    id: crypto.randomUUID(),
    status: 'pending' as const,
    createdAt: now,
  }));
  withRollback(
    {
      settlements: [...state.settlements, ...rows],
      outings: state.outings.map((o) =>
        o.id === outing.id ? { ...o, currentCycle: o.currentCycle + 1 } : o,
      ),
    },
    () =>
      throwing(
        db().rpc('settle_outing', {
          p_outing_id: outing.id,
          p_expected_cycle: outing.currentCycle,
          p_settlements: rows.map((r) => ({
            id: r.id,
            fromId: r.fromId,
            toId: r.toId,
            amountCents: r.amountCents,
          })),
        }),
      ),
  );
}

export function markSettlementPaid(settlementId: string): void {
  const paidAt = Date.now();
  withRollback(
    {
      settlements: state.settlements.map((s) =>
        s.id === settlementId ? { ...s, status: 'paid' as const, paidAt } : s,
      ),
    },
    () =>
      throwing(
        db()
          .from('settlements')
          .update({ status: 'paid', paid_at: new Date(paidAt).toISOString() })
          .eq('id', settlementId),
      ),
  );
}

/** Changes the active group's currency (all its amounts render in it). */
export function setGroupCurrency(groupId: string, currency: string): void {
  const group = state.group;
  if (!group || group.id !== groupId) return;
  setActiveCurrency(currency);
  withRollback({ group: { ...group, currency } }, () =>
    throwing(db().from('groups').update({ currency }).eq('id', groupId)),
  );
}
