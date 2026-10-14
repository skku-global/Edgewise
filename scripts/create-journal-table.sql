-- Journal entries: the plan you write BEFORE a trade, your check-ins during it,
-- and your review after it. Separate from `trades`, because a plan has no exit
-- price or result yet. Run this once in the Supabase SQL editor.

create table if not exists public.journal_entries (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  status text not null default 'planned' check (status in ('planned', 'open', 'closed')),

  -- the plan
  pair text not null,
  direction text not null check (direction in ('buy', 'sell')),
  planned_entry numeric,
  stop_loss numeric,
  take_profit numeric,
  size numeric,
  reasons text not null default '',
  feelings_before text not null default '',

  -- the grade, worked out against the user's own rules
  grade text,
  rules_result jsonb not null default '[]'::jsonb,
  flags jsonb not null default '[]'::jsonb,
  ai_summary text,

  -- during the trade: [{ at, text, reply }]
  checkins jsonb not null default '[]'::jsonb,

  -- after the trade
  result_pl numeric,
  feelings_after text,
  review text,
  closed_at timestamptz
);

create index if not exists journal_entries_user_created_idx
  on public.journal_entries (user_id, created_at desc);

alter table public.journal_entries enable row level security;

drop policy if exists "journal select own" on public.journal_entries;
drop policy if exists "journal insert own" on public.journal_entries;
drop policy if exists "journal update own" on public.journal_entries;
drop policy if exists "journal delete own" on public.journal_entries;

create policy "journal select own" on public.journal_entries
  for select using (auth.uid() = user_id);
create policy "journal insert own" on public.journal_entries
  for insert with check (auth.uid() = user_id);
create policy "journal update own" on public.journal_entries
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "journal delete own" on public.journal_entries
  for delete using (auth.uid() = user_id);
