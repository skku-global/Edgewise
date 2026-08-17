-- Per-user Row Level Security for Edgewise.
--
-- Run this in the Supabase SQL editor AFTER scripts/create-trades-table.sql and
-- scripts/add-broker-sync.sql, and after you have signed up at least once in the
-- app. Safe to re-run.
--
-- ---------------------------------------------------------------------------
-- WHY THE PREVIOUS VERSION OF THIS FILE COULD NOT BE RUN
-- ---------------------------------------------------------------------------
-- It added `user_id` and wrote policies against `auth.uid() = user_id`, but
-- nothing ever populated the column -- not the app, not the MT5 EA. Applying it
-- would have:
--
--   * hidden every existing trade (user_id NULL never equals auth.uid()),
--   * rejected every insert from the Add Trade form (same check, on WITH CHECK),
--   * and killed broker sync outright, because the policies are `to authenticated`
--     and the EA authenticated as `anon`.
--
-- Three changes fix that, and all three matter:
--
--   1. `default auth.uid()` on the column. PostgREST runs an insert as the
--      caller's role with their JWT in `request.jwt.claims`, so the default
--      resolves to the right user with no application change. Under `anon`
--      auth.uid() is NULL, which the NOT NULL constraint then rejects -- so an
--      anonymous writer is refused by the column, before any policy runs.
--
--   2. The dedup index becomes (user_id, source, external_id). It used to be
--      (source, external_id) globally, which is a latent multi-user data bug:
--      two traders whose brokers issue the same deal ticket collide, and the
--      second one's upsert resolves onto a row RLS makes invisible to them.
--      Postgres would either raise a unique violation it cannot explain or
--      silently update nothing. Scoping the index per user removes the class.
--
--   3. Existing rows are backfilled before NOT NULL is enforced, and this script
--      refuses to guess when it cannot tell who owns what.
--
-- The MT5 EA now signs in with email and password and sends a real user JWT.
-- See mt5/README.md.

-- ---------------------------------------------------------------------------
-- 1. trades.user_id
-- ---------------------------------------------------------------------------
-- Added nullable first: a NOT NULL column cannot be added to a table that
-- already has rows without a value for them.
alter table public.trades
  add column if not exists user_id uuid references auth.users (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- 2. Backfill, or stop and say why
-- ---------------------------------------------------------------------------
-- Ownership of pre-auth rows is not derivable from the data. With exactly one
-- account they are unambiguously that account's; with several, guessing would
-- hand one trader another's history, so this aborts instead. This block runs
-- before any policy is created, so an abort here leaves the old wide-open
-- policies in place and the app still working, rather than half migrated.
do $$
declare
  user_count   bigint;
  orphan_count bigint;
  only_user    uuid;
begin
  select count(*) into user_count from auth.users;
  select count(*) into orphan_count from public.trades where user_id is null;

  if orphan_count = 0 then
    raise notice 'No unowned trades to backfill.';

  elsif user_count = 0 then
    raise exception
      'Found % trade(s) with no owner and no accounts exist yet. Sign up in the app first, then re-run this script.',
      orphan_count;

  elsif user_count = 1 then
    select id into only_user from auth.users;
    update public.trades set user_id = only_user where user_id is null;
    raise notice 'Backfilled % trade(s) to the only account (%).', orphan_count, only_user;

  else
    raise exception
      'Found % trade(s) with no owner across % accounts. Assign them yourself, then re-run: update public.trades set user_id = ''<uuid>'' where user_id is null;',
      orphan_count, user_count;
  end if;
end $$;

-- Now that every row has an owner, make it impossible to write one without.
-- The default is what keeps the application code free of user_id plumbing.
alter table public.trades alter column user_id set default auth.uid();
alter table public.trades alter column user_id set not null;

-- Every screen filters by owner on every read.
create index if not exists trades_user_id_idx on public.trades (user_id);

-- ---------------------------------------------------------------------------
-- 3. Per-user dedup index for broker sync
-- ---------------------------------------------------------------------------
-- Replaces the global (source, external_id) index -- see note 2 at the top.
-- The EA's request must name the same columns:
--   ?on_conflict=user_id,source,external_id
drop index if exists public.trades_source_external_id_idx;

create unique index if not exists trades_user_source_external_id_idx
  on public.trades (user_id, source, external_id);

-- Manual rows are unaffected: their external_id is NULL, and Postgres treats
-- NULLs as distinct in a unique index, so any number of them coexist.

-- ---------------------------------------------------------------------------
-- 4. trades policies
-- ---------------------------------------------------------------------------
alter table public.trades enable row level security;

-- The wide-open single-user policies, by every name they have been given.
drop policy if exists "Allow reads for all users"   on public.trades;
drop policy if exists "Allow inserts for all users" on public.trades;
drop policy if exists "Allow updates for all users" on public.trades;
drop policy if exists "Allow deletes for all users" on public.trades;

drop policy if exists "Users can read own trades"   on public.trades;
drop policy if exists "Users can insert own trades" on public.trades;
drop policy if exists "Users can update own trades" on public.trades;
drop policy if exists "Users can delete own trades" on public.trades;

create policy "Users can read own trades" on public.trades
  for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own trades" on public.trades
  for insert to authenticated
  with check (auth.uid() = user_id);

-- UPDATE needs both clauses: USING picks which rows may be touched, WITH CHECK
-- validates the result. Without WITH CHECK a user could reassign their own row
-- to somebody else's user_id. The upsert path depends on this policy existing.
create policy "Users can update own trades" on public.trades
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own trades" on public.trades
  for delete to authenticated
  using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 5. moods policies
-- ---------------------------------------------------------------------------
-- Ownership is derived from the parent trade rather than duplicated onto a
-- moods.user_id. One source of truth for who owns what, and no way for the two
-- columns to disagree; the subquery hits trades by primary key.
alter table public.moods enable row level security;

drop policy if exists "Allow reads for all users"   on public.moods;
drop policy if exists "Allow inserts for all users" on public.moods;
drop policy if exists "Allow updates for all users" on public.moods;
drop policy if exists "Allow deletes for all users" on public.moods;

drop policy if exists "Users can read own moods"   on public.moods;
drop policy if exists "Users can insert own moods" on public.moods;
drop policy if exists "Users can update own moods" on public.moods;
drop policy if exists "Users can delete own moods" on public.moods;

create policy "Users can read own moods" on public.moods
  for select to authenticated
  using (
    exists (
      select 1 from public.trades t
      where t.id = moods.trade_id and t.user_id = auth.uid()
    )
  );

create policy "Users can insert own moods" on public.moods
  for insert to authenticated
  with check (
    exists (
      select 1 from public.trades t
      where t.id = moods.trade_id and t.user_id = auth.uid()
    )
  );

create policy "Users can update own moods" on public.moods
  for update to authenticated
  using (
    exists (
      select 1 from public.trades t
      where t.id = moods.trade_id and t.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.trades t
      where t.id = moods.trade_id and t.user_id = auth.uid()
    )
  );

create policy "Users can delete own moods" on public.moods
  for delete to authenticated
  using (
    exists (
      select 1 from public.trades t
      where t.id = moods.trade_id and t.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Revoke anon at the grant level
-- ---------------------------------------------------------------------------
-- Belt and braces. Every policy above is `to authenticated`, so anon already
-- matches none of them, but a future `to public` policy added by hand would
-- quietly re-expose the tables. Removing the grant means anon cannot reach
-- these tables even then.
revoke all on public.trades, public.moods from anon;

-- ---------------------------------------------------------------------------
-- 7. Refresh PostgREST's schema cache
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
