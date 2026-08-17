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

-- Drop every policy on the table, by enumeration rather than by name.
--
-- This replaces a list of `drop policy if exists` calls that guessed at the
-- legacy names and guessed wrong: the live policy was "Allow all access to
-- trades", so every drop was a silent no-op and the four correct policies below
-- were created *alongside* it. That is the worst possible outcome, because
-- permissive policies are OR'd together -- a single `using (true)` granted to
-- `public` outranks any number of correct per-user policies, and the migration
-- still reports success. The table stayed world-readable behind eight policies
-- that looked right.
--
-- Enumerating pg_policies cannot miss a name, including names introduced by
-- hand in the dashboard. Everything wanted is recreated immediately below, in
-- the same transaction, so there is no window where the table is unprotected.
do $$
declare
  doomed text;
begin
  for doomed in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'trades'
  loop
    execute format('drop policy %I on public.trades', doomed);
  end loop;
end $$;

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

-- Same enumeration as for trades, and for the same reason: the live policy here
-- was "Allow all access to moods", which no hand-written drop list caught.
do $$
declare
  doomed text;
begin
  for doomed in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'moods'
  loop
    execute format('drop policy %I on public.moods', doomed);
  end loop;
end $$;

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
--
-- Grant `authenticated` explicitly first. Supabase's default privileges already
-- cover it, so this is normally a no-op -- but if those defaults were ever
-- changed, revoking anon without it leaves NO role able to read the table and
-- every request fails with a bare "permission denied for table trades", which
-- looks nothing like a grants problem. Idempotent, so it costs nothing to state.
grant select, insert, update, delete on public.trades, public.moods to authenticated;

revoke all on public.trades, public.moods from anon;

-- ---------------------------------------------------------------------------
-- 7. Refresh PostgREST's schema cache
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';

-- ---------------------------------------------------------------------------
-- 8. Verify — read this output, do not assume
-- ---------------------------------------------------------------------------
-- One result set, because the SQL editor only shows the last statement's.
--
-- Expect, on `trades`: four "Users can own..." policies (select/insert/update/
-- delete), trades_user_id_idx, and trades_user_source_external_id_idx UNIQUE on
-- (user_id, source, external_id). On `moods`: four policies and
-- moods_trade_id_idx. Every policy should read `to authenticated` -- the name a
-- policy carries means nothing, the role and the expression are what decide.
--
-- The one thing worth hunting for: a leftover UNIQUE index on
-- (source, external_id) WITHOUT user_id. The first version of
-- add-broker-sync.sql created one, that version was run on 2026-08-12, and the
-- file has since been rewritten -- so the live name is not recoverable from the
-- repo. Section 3 drops it by its expected name; if the real name differed, it
-- is still here and still enforcing global uniqueness. Harmless while you are the
-- only trader, wrong the moment you are not. If you see one, drop it by the name
-- shown:  drop index public.<name>;
-- FIRST, an assertion, because "read this output" failed once already.
--
-- The original version of this section printed each policy's name and `cmd` and
-- asked you to check them. "Allow all access to trades | ALL" sitting beside
-- four per-user policies reads as unremarkable, and it was missed -- the columns
-- that would have given it away, `roles` and `qual`, were not selected.
--
-- A permissive policy granted to `public` with `using (true)` is not one flaw
-- among several; it cancels every other policy on the table, because permissive
-- policies are OR'd. So it aborts the migration instead of being displayed.
-- Raising rolls the whole script back, which is the right outcome: either the
-- tables end up isolated, or nothing changed and the reason is on screen.
do $$
declare
  offender record;
begin
  for offender in
    select tablename, policyname, permissive,
           array_to_string(roles, ',') as who,
           coalesce(qual, with_check)  as expr
    from pg_policies
    where schemaname = 'public'
      and tablename in ('trades', 'moods')
      and (roles && '{public,anon}'::name[] or qual = 'true' or with_check = 'true')
  loop
    raise exception
      'Policy "%" on public.% defeats per-user isolation: % to %, expression %. '
      'Permissive policies are OR''d, so this one grants access no matter what '
      'the other policies say. Nothing was changed. Drop it and re-run.',
      offender.policyname, offender.tablename, offender.permissive,
      offender.who, coalesce(offender.expr, '(none)');
  end loop;
end $$;

select 'policy'::text as kind,
       tablename::text as on_table,
       policyname::text as name,
       -- roles and the expression, not just cmd: who a policy applies to and
       -- what it tests are the whole question. `cmd` alone hides both.
       (cmd || ' to ' || array_to_string(roles, ',') ||
        ' using ' || coalesce(qual, with_check, '(none)'))::text as detail
from pg_policies
where schemaname = 'public' and tablename in ('trades', 'moods')
union all
select 'index'::text,
       tablename::text,
       indexname::text,
       indexdef::text
from pg_indexes
where schemaname = 'public' and tablename in ('trades', 'moods')
order by kind, on_table, name;
