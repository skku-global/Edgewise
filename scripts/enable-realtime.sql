-- Live updates: let the app hear about trades the moment they are written.
--
-- Run this in the Supabase SQL editor after scripts/add-broker-sync.sql and
-- scripts/secure-rls.sql. It is safe to run twice.
--
-- Without it the app still works — `useTrades` falls back to a one-minute poll
-- and a refresh whenever the app is foregrounded — but a trade closed in
-- MetaTrader will not appear on the dashboard until one of those fires. With it,
-- the row arrives in under a second.
--
-- Nothing here weakens isolation. Realtime's `postgres_changes` runs each
-- subscriber's filter through the same RLS policies as a REST read, using that
-- user's JWT: a subscription on `trades` delivers only the rows
-- `auth.uid() = user_id` already allows. Enabling replication without RLS on the
-- table WOULD broadcast every row to every listener, which is the other reason
-- secure-rls.sql has to be run first.

-- `supabase_realtime` is created by the platform. On a project where it is
-- missing (self-hosted, or deleted by hand) create it empty first.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;

-- Add the two tables the app subscribes to. `add table` errors if the table is
-- already a member, so each is guarded.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'trades'
  ) then
    alter publication supabase_realtime add table public.trades;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'moods'
  ) then
    alter publication supabase_realtime add table public.moods;
  end if;
end $$;

-- Old rows are not needed: the app reloads its own query when an event arrives
-- and never reads the payload, so `default` (primary key only) is enough and
-- keeps the WAL small. `full` would ship every column of every change to the
-- replication slot for nothing.
alter table public.trades replica identity default;
alter table public.moods replica identity default;

-- Confirm. Both tables should be listed.
select schemaname, tablename
from pg_publication_tables
where pubname = 'supabase_realtime'
order by tablename;
