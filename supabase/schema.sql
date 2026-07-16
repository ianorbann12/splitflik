-- SplitFlik schema (PLAN.md §10). Run once in the Supabase SQL editor.
--
-- Access model (documented jam tradeoff): no auth — the anon key plus a
-- group's invite code are the only secrets. RLS is enabled but permissive.
-- Do not store anything more sensitive than names and phone numbers.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  invite_code text not null unique check (char_length(invite_code) between 12 and 64),
  created_at timestamptz not null default now()
);

create table public.people (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  phone text check (phone is null or phone ~ '^0[1-9][0-9]{7}$'),
  claimed_by uuid,
  avatar_url text,
  created_at timestamptz not null default now()
);
create index people_group_idx on public.people (group_id);

create table public.outings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  participant_ids uuid[] not null default '{}',
  current_cycle int not null default 1 check (current_cycle >= 1),
  created_at timestamptz not null default now()
);
create index outings_group_idx on public.outings (group_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  outing_id uuid not null references public.outings(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  description text not null check (char_length(description) between 1 and 200),
  amount_cents int not null check (amount_cents > 0),
  payer_id uuid not null references public.people(id),
  split jsonb not null,
  cycle int not null check (cycle >= 1),
  created_at timestamptz not null default now()
);
create index expenses_group_idx on public.expenses (group_id);
create index expenses_outing_idx on public.expenses (outing_id);

create table public.settlements (
  id uuid primary key default gen_random_uuid(),
  outing_id uuid not null references public.outings(id) on delete cascade,
  group_id uuid not null references public.groups(id) on delete cascade,
  cycle int not null check (cycle >= 1),
  from_id uuid not null references public.people(id),
  to_id uuid not null references public.people(id),
  amount_cents int not null check (amount_cents > 0),
  status text not null default 'pending' check (status in ('pending', 'paid')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index settlements_group_idx on public.settlements (group_id);
create index settlements_outing_idx on public.settlements (outing_id);

-- Settlement snapshot (PLAN.md §6.3, CLAUDE.md rule 3): materialise pending
-- settlements and bump the cycle atomically, guarded against concurrent
-- settles by the expected-cycle check under a row lock.
create or replace function public.settle_outing(
  p_outing_id uuid,
  p_expected_cycle int,
  p_settlements jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cycle int;
  v_group uuid;
begin
  select current_cycle, group_id into v_cycle, v_group
    from public.outings where id = p_outing_id for update;
  if v_cycle is null then
    raise exception 'outing not found';
  end if;
  if v_cycle <> p_expected_cycle then
    raise exception 'cycle mismatch: expected %, got %', p_expected_cycle, v_cycle;
  end if;

  insert into public.settlements
    (id, outing_id, group_id, cycle, from_id, to_id, amount_cents, status)
  select
    coalesce(nullif(s->>'id', '')::uuid, gen_random_uuid()),
    p_outing_id,
    v_group,
    p_expected_cycle,
    (s->>'fromId')::uuid,
    (s->>'toId')::uuid,
    (s->>'amountCents')::int,
    'pending'
  from jsonb_array_elements(p_settlements) as s;

  update public.outings set current_cycle = current_cycle + 1
    where id = p_outing_id;
end;
$$;

-- User-level friends: a personal roster added by phone, reusable across groups.
create table public.friends (
  owner uuid not null,
  phone text not null check (phone ~ '^0[1-9][0-9]{7}$'),
  name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  primary key (owner, phone)
);
create index friends_owner_idx on public.friends (owner);

-- RLS: enabled, permissive (see access model note above).
alter table public.groups enable row level security;
alter table public.people enable row level security;
alter table public.outings enable row level security;
alter table public.expenses enable row level security;
alter table public.settlements enable row level security;
alter table public.friends enable row level security;

create policy groups_all on public.groups for all using (true) with check (true);
create policy people_all on public.people for all using (true) with check (true);
create policy outings_all on public.outings for all using (true) with check (true);
create policy expenses_all on public.expenses for all using (true) with check (true);
create policy settlements_all on public.settlements for all using (true) with check (true);
create policy friends_all on public.friends for all using (true) with check (true);

-- Realtime change feeds for live sync (PLAN.md §10).
alter publication supabase_realtime add table
  public.groups, public.people, public.outings, public.expenses, public.settlements;
