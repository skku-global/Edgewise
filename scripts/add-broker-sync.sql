-- Broker sync: lets trades arrive from a broker instead of the Add Trade form.
--
-- Run order, all in the Supabase SQL editor:
--   1. scripts/create-trades-table.sql
--   2. this file
--   3. scripts/secure-rls.sql          <-- required, not optional
--
-- Then start the MT5 Expert Advisor (mt5/SkkuJournalSync.mq5).
--
-- Safe to re-run, and safe to re-run *after* step 3: this file only adds columns
-- and one plain index. It deliberately touches no policies and creates no unique
-- index -- see the notes at the bottom for why that separation matters.
--
-- Design note: these are nullable columns on the EXISTING `trades` table rather
-- than a separate `imported_trades` table. src/hooks/use-trades.ts is the single
-- loader behind the dashboard, trades table, calendar and equity curve, so
-- widening `trades` makes synced trades appear on every screen at once. A second
-- table would have meant teaching all four screens to union two sources.

-- ---------------------------------------------------------------------------
-- Provenance and dedup
-- ---------------------------------------------------------------------------
-- 'manual' (the Add Trade form), 'mt5', later 'ctrader' / 'tradelocker'.
-- Defaulting to 'manual' is what keeps existing rows correct: they were all
-- typed in by hand, and a NOT NULL default backfills them in place.
alter table public.trades add column if not exists source text not null default 'manual';

-- The broker's own id for the trade -- for MT5, the closing deal ticket. This
-- is the dedup anchor: it lets the EA re-send its whole history on every
-- terminal start without creating duplicates.
alter table public.trades add column if not exists external_id text;

-- Which trading account the row came from. Plain text for now; this becomes a
-- foreign key to a broker_accounts table when multi-user auth lands.
alter table public.trades add column if not exists account_login text;

-- ---------------------------------------------------------------------------
-- Real broker timestamps
-- ---------------------------------------------------------------------------
-- `created_at` already exists and every screen sorts and groups by it, so the
-- importer writes the broker's CLOSE time into it. That single choice is what
-- makes the calendar, equity curve and table order correct for synced trades
-- with no application changes. These two columns keep the underlying facts:
-- how long the position was actually held, which created_at alone cannot say.
alter table public.trades add column if not exists opened_at timestamptz;
alter table public.trades add column if not exists closed_at timestamptz;

-- ---------------------------------------------------------------------------
-- Broker costs
-- ---------------------------------------------------------------------------
-- Stored separately so the journal can show gross vs net later. `profit_loss`
-- holds the NET figure (profit + commission + swap) because that is the number
-- that actually hit the account.
--
-- Why net rather than a derived value: src/lib/trade-math.ts computes P/L as
-- priceDiff * size, which is wrong for XAUUSD -- gold's contract size is 100,
-- so a $1 move on 1 lot is $100, not $1 -- and it cannot know about commission
-- or swap at all. effectiveProfitLoss() already prefers a stored profit_loss,
-- so storing the broker's real number makes synced trades correct for free.
alter table public.trades add column if not exists commission numeric;
alter table public.trades add column if not exists swap       numeric;

-- ---------------------------------------------------------------------------
-- setup_type must be nullable
-- ---------------------------------------------------------------------------
-- The original create-trades-table.sql declared this `not null`, which was
-- right when a human filled the form and the dropdown enforced a value. A
-- synced trade has no setup: the broker does not know why the trade was taken.
-- Rows arrive with setup_type NULL and the user classifies them afterwards in
-- the tagging queue, which is the whole point of the psychology layer.
alter table public.trades alter column setup_type drop not null;

-- ---------------------------------------------------------------------------
-- Dedup index: deliberately NOT created here
-- ---------------------------------------------------------------------------
-- The EA's upsert needs a unique index matching its `?on_conflict=` target, but
-- that index is owned by scripts/secure-rls.sql, which creates it as
-- (user_id, source, external_id).
--
-- It used to be created here as a global (source, external_id), and having both
-- files able to create an index for the same job was a trap: run this file again
-- after securing the database and the global index comes back, at which point
-- two traders whose brokers issue the same deal ticket collide -- the second
-- one's upsert resolves onto a row RLS hides from them, and Postgres cannot
-- report that in any useful way.
--
-- So: this file owns columns, secure-rls.sql owns ownership and dedup, and
-- neither can undo the other whatever order they are run in.
--
-- (One thing worth recording, because it cost real time and the fix is
-- counter-intuitive: that index must NOT be partial. An earlier draft added
-- `where external_id is not null` to document that manual rows sit outside the
-- constraint -- which reads well and breaks the feature. Postgres only infers a
-- PARTIAL unique index for ON CONFLICT when the statement repeats the index
-- predicate, and PostgREST emits no predicate, so every send failed with 42P10,
-- "no unique or exclusion constraint matching the ON CONFLICT specification".
-- Manual rows are safe regardless: their external_id is NULL, and unique indexes
-- treat NULLs as distinct, so any number of them coexist.)

-- Imported history is read newest-first and filtered by account.
create index if not exists trades_source_idx on public.trades (source);

-- ---------------------------------------------------------------------------
-- Row level security: not touched here either
-- ---------------------------------------------------------------------------
-- Run scripts/secure-rls.sql next. It is not optional any more -- it is what
-- makes the trades table owned, and the EA now signs in with email and password
-- and sends a real user JWT, so without it the EA's writes are refused.
--
-- This file used to create `"Allow updates for all users" ... using (true)` so
-- that the upsert's update half would pass, back when the EA wrote as `anon`.
-- Leaving that here would mean re-running this migration silently re-opened a
-- secured database to every anonymous caller. secure-rls.sql drops that policy
-- by name, so an existing database is cleaned up when you run it.

-- PostgREST caches the schema; without this the new columns return
-- "column does not exist" until its next automatic reload.
notify pgrst, 'reload schema';
