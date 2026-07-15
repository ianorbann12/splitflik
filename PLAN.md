# PLAN.md — SplitFlik backend kit

Authoritative spec for the `main` branch. Where this document and CLAUDE.md
disagree, this document wins.

> **Repo split (2026-07-15):** this repo was converted from the full app into a
> backend + SDK kit so that anyone can build a frontend against this backend.
> The complete reference frontend (PWA, Slovenian UI) — together with the
> original full product spec (PLAN.md v2 with §-numbered sections) — lives in
> the separate private **`splitflik-frontend`** repository, which deploys to
> https://splitflik.vercel.app.

## 1. Scope of `main`

| Component | Contract |
|---|---|
| `supabase/schema.sql` | the database: tables, constraints, permissive RLS, `settle_outing` RPC |
| `api/parse-receipt.ts` | the only server code: receipt image → strict JSON items (Anthropic vision) |
| `src/types.ts` + `src/engine/` | the money rules every frontend must share (integer cents, rounding, cycles, stats) |
| `src/lib/` | typed client SDK: Supabase adapter with optimistic writes/realtime/offline cache, auth + identity/invites, sl-SI formatting, Flik handoff constants |
| `docs/API.md` | the public contract document — kept in lockstep with all of the above |

Non-goals on `main`: UI of any kind, routing, styling, PWA packaging.

## 2. Compatibility policy

- The engine's rounding rules, the settlement snapshot rule, the `SplitSpec`
  JSON shape, the schema, and the parse-receipt HTTP contract are **public
  contracts**. Breaking changes require: updating `docs/API.md`, a matching
  change in the `splitflik-frontend` repo, and a version bump in `package.json`.
- Tests are the compatibility net: fixed cases + seeded property tests for
  every exported engine function, validation tests for the API, mapper and
  identity tests for the SDK. `npm test` and `npm run typecheck` must pass
  before any PR.

## 3. Security model (unchanged)

Supabase Auth (email + password) provides identity; the group invite code is
the effective access secret over permissive RLS. Suitable for friend groups,
not for sensitive data — names and Slovenian mobile numbers at most.
`ANTHROPIC_API_KEY` is serverless-only; receipt images are never persisted.

## 4. Deployment

- Vercel: this repo is not connected to any deployment; the production URL
  (and its `/api/parse-receipt`) deploys from the `splitflik-frontend` repo.
  `vercel.json` stays functions-only so the kit can be deployed standalone.
- Supabase: one project per friend-group community; schema applied manually
  via the SQL editor.
