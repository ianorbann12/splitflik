# SplitFlik — backend kit

Backend + build-your-own-frontend kit for **SplitFlik**, a bill-splitting app
for friend groups with Flik (NLB Pay) settlement handoff and AI receipt
scanning.

**This branch (`main`) contains no UI.** It is everything a frontend needs:

```
supabase/schema.sql   # Postgres schema, RLS, settle_outing RPC — run once in Supabase
api/parse-receipt.ts  # Vercel serverless: receipt photo → structured items (Anthropic vision)
src/types.ts          # domain types — the single source of truth
src/engine/           # pure, tested money math: splits, rounding, balances, settlement, stats
src/lib/              # typed client SDK: Supabase adapter, auth, identity/invites, sl-SI formatting, Flik handoff
docs/API.md           # ← START HERE: all contracts for frontend builders
```

The complete reference frontend (mobile-first PWA, Slovenian UI) lives on the
**`splitflik-frontend` repository** (private) and is deployed at https://splitflik.vercel.app.

## Quick start (backend owner)

1. Create a [Supabase](https://supabase.com) project; run `supabase/schema.sql`
   in the SQL editor; disable **Authentication → Email → Confirm email**.
2. Deploy this repo to Vercel (or anywhere that runs Vercel-style functions)
   with env `ANTHROPIC_API_KEY` for `/api/parse-receipt`.
3. Hand frontend builders: your Supabase **URL**, the **anon key**, your
   deployed **parse-receipt endpoint**, and [`docs/API.md`](docs/API.md).

## Quick start (frontend builder)

Read [`docs/API.md`](docs/API.md). Short version: copy `src/types.ts`,
`src/engine/` and `src/lib/` into your project, set `VITE_SUPABASE_URL` +
`VITE_SUPABASE_ANON_KEY`, call `initAuth()` → `initGroup()`, render from
`getState()`/`subscribe()`. The non-negotiables: **money is integer cents**
with the documented rounding rules, **settle only via the `settle_outing`
RPC**, and **Flik is a manual handoff** — never pretend to send payments, and
keep the disclaimer visible.

## Development

```bash
npm install
npm test           # engine/SDK/API validation tests (Vitest)
npm run typecheck  # app + api tsconfigs
```
