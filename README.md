# SplitFlik + Deli

A bill-splitting app for friend groups, with **Flik (NLB Pay) settlement handoff**
and **AI receipt scanning**. This repo now contains both halves:

- **Backend kit** — Supabase schema, the receipt-parsing serverless function, the
  pure money engine, and the typed client SDK.
- **Deli** — the reference frontend: a mobile-first **Vite + React + TypeScript**
  SPA (Slovenian UI) that renders the whole product on top of that SDK.

```
supabase/schema.sql   # Postgres schema, RLS, settle_outing RPC — run once in Supabase
api/parse-receipt.ts  # Vercel serverless: receipt photo → structured items (Anthropic vision)
src/types.ts          # domain types — the single source of truth
src/engine/           # pure, tested money math: splits, rounding, balances, settlement, stats
src/lib/              # typed client SDK: Supabase adapter, auth, identity/invites, sl-SI formatting, Flik
src/app/              # Deli frontend — screens, UI kit, theming, data selectors (see below)
docs/API.md           # contracts for frontend builders
```

## The Deli frontend (`src/app/`)

Mobile-first, dark ("Glossy") + light themes, Rubik type, lime accent — implemented
from the `Deli.dc.html` design. Everything talks to the backend through one facade
(`src/app/data/store.ts`); no screen touches Supabase directly.

```
src/app/
├── App.tsx              # auth gate → group gate → main app (5-tab shell + activity overlay)
├── theme.tsx            # light / glossy-dark CSS-variable themes
├── format.ts            # sl-SI money/phone/date formatting (over src/lib/format.ts)
├── useBootstrap.ts      # initAuth → session → initGroup; demo auto-login; /#/join/<code>
├── data/
│   ├── store.ts         # single data entry point: live SDK or in-memory demo store
│   ├── demoStore.ts     # in-memory stand-in used when Supabase isn't configured
│   ├── demoSeed.ts      # realistic seeded group so the whole app is explorable offline
│   ├── derive.ts        # read-only selectors (balances, notifications, stats) via the engine
│   ├── receipt.ts       # downscale + POST /api/parse-receipt (fixture fallback in demo)
│   └── people.ts, uiPrefs.ts
├── ui/                  # AppShell (swipe tabs + nav), kit (Avatar/Card/Button/…), Toast, FlikSheet, icons
├── auth/                # AuthGate, GroupGate (create/join by invite code)
└── screens/             # Home, Notifications, Stats, Friends, Profile, activity/ (New→…→Sent)
```

Screens: **Domov** (summary + recent + map), **Obvestila** (requests/payments),
**Statistika** (received/sent/owed + spending bars + categories), **Prijatelji**
(balances + Flik pay), **Profil**, and the **new-activity flow** (create → add bills,
incl. receipt scan + per-item split → engine-computed settlement preview → settle →
Flik handoff).

### Demo mode

Run without any Supabase keys and the app boots into an in-memory demo group
(seeded people, outings, expenses and settlements; receipt parsing returns a
fixture). Every screen and the full settle flow work offline. Set the
`VITE_SUPABASE_*` env vars to switch to a live backend automatically.

## Quick start

```bash
npm install
npm run dev          # Deli frontend at http://localhost:5173 (demo mode without env)
npm run build        # production build → dist/
npm test             # engine/SDK/API tests (Vitest, 74)
npm run typecheck    # app + api tsconfigs
```

## Going live

1. Create a [Supabase](https://supabase.com) project; run `supabase/schema.sql`
   in the SQL editor; disable **Authentication → Email → Confirm email**.
2. Set env (`.env.local` locally, Vercel project env for deploys):
   `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `ANTHROPIC_API_KEY`
   (server-only, for `/api/parse-receipt`).
3. Deploy to Vercel — `vercel.json` builds the SPA (`vite build` → `dist/`) and
   deploys `api/*` as functions (30 s timeout).

## Non-negotiables (see `CLAUDE.md`, `docs/API.md`)

- **Money is integer cents** with the documented rounding rules — formatting only in
  `src/lib/format.ts`.
- **Settle only via the `settle_outing` RPC** (through `store.settleOuting`).
- **Flik is a manual handoff** — the app never sends payments or calls NLB, and the
  `FLIK_DISCLAIMER` stays visible on the handoff sheet.
