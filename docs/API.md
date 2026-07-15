# SplitFlik backend — contracts for frontend builders

Everything a custom frontend needs to work against this backend. The backend
has two halves: a **Supabase project** (Postgres + Realtime + Auth, schema in
[`supabase/schema.sql`](../supabase/schema.sql)) that clients talk to directly,
and **one serverless function** (`POST /api/parse-receipt`) for AI receipt
parsing. A complete reference frontend lives on the
separate `splitflik-frontend` repository.

You can build on three levels — each lower level means reimplementing more:

1. **Use the TypeScript SDK** (`src/lib/`) — recommended. Typed state + actions,
   optimistic writes, realtime sync, offline cache.
2. **Use the engine** (`src/engine/`) + your own data access.
3. **Raw Supabase/HTTP** — follow the contracts below exactly, especially §3.

---

## 1. Setup

- Create a Supabase project, run `supabase/schema.sql` in its SQL editor once.
- Disable **Authentication → Email → Confirm email** (or handle the
  confirmation flow yourself).
- Client env (Vite naming, used by the SDK): `VITE_SUPABASE_URL`,
  `VITE_SUPABASE_ANON_KEY`.
- Serverless env: `ANTHROPIC_API_KEY` — **server-side only, never in client
  code** (hard rule).

## 2. Data model

Tables (snake_case) map 1:1 to the TypeScript types in
[`src/types.ts`](../src/types.ts) (camelCase). All money is **integer euro
cents**; all client timestamps are epoch milliseconds (DB stores timestamptz).

| Table | Purpose | Notes |
|---|---|---|
| `groups` | one friend circle | `invite_code` unique, 12–64 chars — the effective access secret |
| `people` | members (roster entries) | `claimed_by` = Supabase Auth user id of whoever "is" this person; `phone` matches `^0[1-9][0-9]{7}$` (Slovenian mobile, normalized) |
| `outings` | events expenses hang off | `participant_ids uuid[]`, `current_cycle` starts at 1 |
| `expenses` | one bill | `split jsonb` (see §3.2), `cycle` = outing's `current_cycle` at creation, `amount_cents > 0` |
| `settlements` | materialised debts | `status` ∈ `pending`/`paid`; created only via the `settle_outing` RPC |

Deletes cascade: removing an outing removes its expenses and settlements;
removing a group removes everything.

### Identity & access

- **Auth**: Supabase email + password. Accounts are identity only — RLS is
  deliberately permissive and the **invite code is the access boundary**.
  Do not store anything more sensitive than names and phone numbers.
- **Joining**: fetch the group by `invite_code`, then either *claim* an
  existing person (`update people set claimed_by = <your auth user id>`) or
  insert a new person with `claimed_by` set. Convention for invite URLs:
  `<origin>/#/join/<inviteCode>`.
- **Session validation** (recommended client behavior): on load, if your
  claimed person's `claimed_by` no longer equals your auth user id, drop the
  local session. Foreign claims may be taken over after an explicit user
  confirm.

## 3. Money rules (hard requirements)

Frontends MUST reproduce these exactly — otherwise groups using different
frontends will disagree about who owes what. The engine in `src/engine/`
implements all of them with property tests; import it rather than porting it
if at all possible.

### 3.1 Integer cents

No float arithmetic on amounts anywhere. Parse user input as strings
(`src/lib/format.ts` shows how); `12,15 €` is `1215`.

### 3.2 Split modes and rounding (`expenses.split` JSON)

```ts
type SplitSpec =
  | { mode: 'equal';   participantIds: string[] }
  | { mode: 'exact';   entries: { personId: string; amountCents: number }[] }
  | { mode: 'weights'; entries: { personId: string; weight: number }[] }   // positive integers
  | { mode: 'items';   items: { label: string; amountCents: number; participantIds: string[] }[] };
```

- **equal** — floor division; remainder cents one-by-one to participants
  sorted by `id` ascending (lexicographic).
- **exact** — entries are non-negative integers, unique person ids, summing
  exactly to `amount_cents`.
- **weights** — positive integer weights, largest-remainder method:
  `floor(amount·w/W)` each, leftover cents to the largest `(amount·w) mod W`,
  ties by `id` ascending.
- **items** — every item is split among its `participantIds` with the *equal*
  rule above, per item; a person's share is the sum of their item shares.
  Item amounts must sum exactly to `amount_cents`.

Invariant: shares always sum exactly to `amount_cents`.
Engine entry point: `computeShares(expense): Map<personId, cents>`.

### 3.3 Balances and the settlement snapshot rule

- Balance of a cycle: for each expense with `expense.cycle === cycle`, payer
  `+amount`, each participant `−share`. Balances sum to 0. Settlements never
  enter this sum — settling **closes a cycle** instead:
- **Settling** materialises the suggested transfers as `pending` settlements
  stamped with the current cycle, then increments `outings.current_cycle`.
  Later expenses stamp the new cycle. Settled amounts are never re-counted.
- **Always settle via the `settle_outing` RPC** — it re-checks the expected
  cycle under a row lock so two concurrent settles cannot double-settle:

```
rpc settle_outing(
  p_outing_id uuid,
  p_expected_cycle int,          -- outing.current_cycle you computed against
  p_settlements jsonb            -- [{ id?, fromId, toId, amountCents }, ...]
) -- raises 'cycle mismatch' if someone settled first: refetch and recompute
```

- Suggested transfers (what you pass in): greedy largest-debtor →
  largest-creditor matching, ties by `id` ascending, ≤ n−1 transfers.
  Engine: `computeBalances(expenses, cycle)`, `suggestTransfers(balances)`,
  `materialiseSettlements(outing, expenses)`.
- Marking paid: `update settlements set status='paid', paid_at=now()`.

### 3.4 Flik is a handoff, not an API

There is **no public NLB/Flik consumer API or deep link**. Frontends must
never claim to send payments, poll payment status, or call NLB endpoints.
The only allowed integration (see `src/lib/flik.ts`): copy the plain amount
(`"12,15"`) to the clipboard, show the payee's phone number, link to the
NLB Pay store pages — and keep the Slovenian disclaimer (`FLIK_DISCLAIMER`)
visible on the handoff UI at all times. Never render or accept card data.

## 4. `POST /api/parse-receipt`

Turns a receipt photo into structured items. Stateless; the image is parsed
and discarded, never persisted or logged.

Request (JSON): `{ "image": "<base64>", "mediaType": "image/jpeg" | "image/png" | "image/webp" }`
— downscale client-side first (longest edge ≤ 1600 px, JPEG ~q0.8); base64
payloads over ~6 M chars are rejected.

Responses:

| Status | Body | Meaning |
|---|---|---|
| 200 | `{ items: [{ label, quantity, totalCents }], totalCents \| null }` | parsed; integers, ≤ 100 items, labels ≤ 80 chars |
| 400 | `{ error: 'bad_request' }` | malformed body / bad base64 / bad media type |
| 405 | `{ error: 'method_not_allowed' }` | not POST |
| 413 | `{ error: 'image_too_large' }` | downscale more |
| 422 | `{ error: 'not_a_receipt' }` | image readable but no items found |
| 500 | `{ error: 'not_configured' }` | `ANTHROPIC_API_KEY` missing server-side |
| 502 | `{ error: 'parse_unavailable' }` | model call failed; retry later |

Typical UI: let the user edit the items, add an "Ostalo" (rest) row when the
grand total exceeds the item sum, assign people per item, then save an
`items`-mode expense (§3.2).

## 5. TypeScript SDK (`src/lib/`)

Copy `src/types.ts`, `src/engine/` and `src/lib/` into your project (React
18+ for the two hook helpers; everything else is framework-free).

- `storage.ts` — the adapter. `isConfigured()`, `initAuth()`,
  `authSignUp/authSignIn/authSignOut`, `initGroup(groupId)` /
  `teardownGroup()` / `refetch()`, `getState()`/`subscribe()` (feed
  `useSyncExternalStore`), and actions: `createGroup`, `fetchGroupByInvite`,
  `claimPerson`, `joinAsNewPerson`, `savePerson`, `deletePerson`,
  `createOuting`, `deleteOuting`, `saveExpense`, `deleteExpense`,
  `settleOuting`, `markSettlementPaid`, `toast`. In-group actions are
  synchronous facades: they apply optimistically, persist in the background,
  and roll back + set `state.toast` on failure. Realtime changes and tab
  refocus refetch automatically; the last snapshot is cached in localStorage
  for offline reads.
- `identity.ts` — group session (`getSession`/`setSession`/`useSession`),
  `newInviteCode()`, `inviteUrl(code)`, `parseInviteInput(text)`.
- `useAppState.ts` — React hook over `getState`/`subscribe`.
- `format.ts` — the only place amounts are formatted/parsed: `formatEur`
  (`12,15 €`, NBSP), `formatEurPlain`, string-based `parseEur`,
  `normalizePhone`/`formatPhone` (Slovenian mobile), `formatDate` (sl-SI).
- `flik.ts` — handoff constants and helpers (§3.4).

Bootstrapping order (see the reference frontend repo for a working example):
`initAuth()` → auth gate → `initGroup(session.groupId)` → render from
`getState()`.

## 6. Testing your frontend's math

`npm test` runs the engine's fixed + property tests (74 tests). If you port
the engine instead of importing it, port `src/engine/*.test.ts` too — the
property tests (shares sum exactly; balances sum to zero; settle-twice yields
nothing new) are what keep mixed-frontend groups consistent.
