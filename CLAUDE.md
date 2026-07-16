# CLAUDE.md — SplitFlik + SplitFlik

This repo has two halves:

1. The **backend + SDK kit**: Supabase schema, the receipt-parsing serverless
   function, the money engine, and the typed client SDK. Contracts: `docs/API.md`.
2. **SplitFlik** — the reference frontend (Vite + React + TS SPA) under `src/app/`,
   built from the `Deli.dc.html` design. It renders the whole product on top of
   the SDK and never touches Supabase directly (all data goes through
   `src/app/data/store.ts`, which delegates to `src/lib/storage.ts` or an
   in-memory demo store when Supabase isn't configured). See `README.md`.

If this file and PLAN.md conflict, PLAN.md wins; flag the conflict.
The backend hard rules below apply to the frontend too (integer cents, settle
only via the RPC, Flik is a handoff with the disclaimer always visible).

## Commands

```bash
npm test           # Vitest — run after every change to src/ or api/
npm run typecheck  # tsc (src) + tsc -p tsconfig.api.json (api)
```

## Architecture

```
supabase/schema.sql   # tables, permissive RLS, settle_outing RPC (atomic snapshot rule)
api/parse-receipt.ts  # Vercel function: image -> Anthropic vision -> strict JSON (+ _validate.ts, tested)
src/types.ts          # Group, Person, Outing, Expense, Settlement, SplitSpec — single source of truth
src/engine/           # PURE functions only: shares.ts, items.ts, settle.ts, stats.ts (+ *.test.ts)
src/lib/              # storage.ts (Supabase adapter — ALL persistence), identity.ts, format.ts, flik.ts
docs/API.md           # public contracts — update it whenever schema/engine/api semantics change
```

## Hard rules

1. **Money is integer cents.** No float arithmetic on amounts. Formatting/parsing
   only in `src/lib/format.ts` (sl-SI, EUR).
2. **Rounding is contract, not implementation detail:** equal splits floor + remainder
   cents by `id` ascending; weights use largest-remainder; items apply the equal rule
   per item. Shares must always sum exactly to `amountCents`. Changing any of this
   breaks every deployed frontend — don't, and keep the property tests green.
3. **Settlement snapshot rule:** settling materialises `pending` settlements and bumps
   `current_cycle` atomically via the `settle_outing` RPC only. Never double-count
   settled amounts; never insert settlements outside the RPC.
4. **Flik is a handoff, not an API.** No public NLB/Flik consumer API or deep link
   exists. Never add code that sends payments, polls status, or calls NLB endpoints.
   `src/lib/flik.ts` is the whole integration; `FLIK_DISCLAIMER` must stay exported
   and documented as must-remain-visible. No card data (PAN/CVV/expiry), ever.
5. **API key hygiene:** `ANTHROPIC_API_KEY` exists only in the serverless function's
   env. Never import into client-side modules, never log it, never commit it.
   Receipt images are parsed and discarded — never persisted, never logged.
6. `src/engine/` stays UI-free and side-effect-free; every exported function has
   Vitest tests (fixed cases + property tests).
7. All persistence goes through `src/lib/storage.ts` — no direct Supabase or
   localStorage calls elsewhere (exception: supabase-js's own auth token storage).
8. **Schema changes are breaking changes.** Any change to `supabase/schema.sql`,
   `src/types.ts`, engine semantics, or the parse-receipt contract must be mirrored
   in `docs/API.md` in the same PR.
9. No new runtime dependencies without a note in the PR description.
10. TS strict; no `any` in `src/` or `api/`.

## Workflow

- Conventional commits (`feat:`, `fix:`, `test:`, `docs:`). Branch per feature.
- Before finishing: run typecheck + tests, then summarize what changed and which
  PLAN.md/docs/API.md sections it touches.
- The `splitflik-frontend` repo is the deployed reference frontend — backend changes that break
  it need a matching PR there.
