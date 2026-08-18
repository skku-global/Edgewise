# Auto-sync your MT5 trades

One setup on a PC, then trade from your phone as usual. Closed trades land in the
journal on their own.

## Why a PC once

MT5 has no cloud API, and the services that rent you a cloud terminal bill per
account — that cannot stay free as users are added. So the work is done by an
Expert Advisor (EA) running in your own terminal, which costs nothing at any
number of users.

EAs don't run on the MT5 mobile app. That would be a problem if the EA only
caught trades as they closed, but it also backfills: MT5 re-downloads your full
history from the broker every time it connects, so the EA sends everything it
missed on each start.

**Your PC does not need to stay on.** Trade from your phone all week, open the
terminal on Sunday, and the week lands in the journal.

## Why it can't just ask for your account number

An MT5 account number is an identifier, not a credential — like a bank account
number, knowing it grants nothing. And there is no MetaQuotes cloud API a website
can call to ask what account 12345678 has been trading. Nothing can read your
history from the number alone.

The services that feel like *set once and forget* — Myfxbook, FX Blue, and the
auto-sync in the bigger journals — take your account number **plus the investor
(read-only) password plus the server name**, and then log into your account from
their own servers. That is why it keeps working with your computer off: their
machine is doing what your terminal does here. It also means handing a third
party standing read access to your broker account, and for a paid journal it
means a per-account fee, which is the tradeoff being made on your behalf.

The account number is still recorded — but the advisor reads it off the terminal
itself and stamps it on each trade, which is how the app can tell you *"37 trades
imported · account 12345678"*. It is an output, never something you type in.

## Before you start

Run these in your Supabase SQL editor, in order:

1. `scripts/create-trades-table.sql` — the tables (skip if you already have them)
2. `scripts/add-broker-sync.sql` — the columns the EA writes to. Without it every
   send fails with HTTP 400.
3. `scripts/secure-rls.sql` — per-user ownership. Without it the EA's sign-in has
   nothing to sign in against and writes are refused.
4. `scripts/enable-realtime.sql` — optional. Makes a trade appear in the app the
   moment the EA sends it. Skip it and the app falls back to a one-minute poll.

You'll also need, from Supabase → Project Settings → API:

- **Project URL** — `https://<your-project>.supabase.co`
- **Publishable (anon) key** — the same key the app already uses

…and the **email and password you sign in to the app with**.

### Why it wants your password

The journal owns rows per user now. The publishable key on its own authenticates
as `anon`, which owns nothing and can write nothing — the write is refused before
any policy is even consulted. So the EA signs in exactly the way the app does,
gets a token that says *you*, and sends that with each trade. Postgres stamps the
row with your user id and verifies it matches.

Both values stay in the EA inputs on your own PC, and are sent only to your own
Supabase project over HTTPS. If you'd rather not type a password into a chart
dialog, make a second Supabase account just for syncing — but note it will then
own the synced trades, and you'll see them by signing in to the app as that
account.

## Setup

**1. Install MT5 on a PC and log in** to the same account you trade from your
phone. Same broker, same login. Once it connects, your history is there.

**2. Copy the EA into the terminal.** In MT5: File → Open Data Folder, then
`MQL5/Experts/`. Drop `EdgewiseSync.mq5` in.

**3. Compile it.** Tools → MetaQuotes Language Editor, open the file, press F7.
Expect `0 errors, 0 warnings`.

**4. Whitelist your Supabase URL.** Tools → Options → Expert Advisors → tick
*Allow WebRequest for listed URL* and add your project URL:

```
https://<your-project>.supabase.co
```

**This is the step everyone misses.** Without it `WebRequest` returns -1 and
nothing is ever sent. One entry covers both the sign-in and the trade writes —
they're the same host.

**5. Drag the EA onto any chart.** Which chart doesn't matter — it reads your
whole account, not that symbol. In the dialog:

- **Common** tab: tick *Allow Algo Trading*
- **Inputs** tab: fill in `SupabaseUrl`, `SupabaseKey`, `SupabaseEmail` and
  `SupabasePassword`; leave `BackfillDays` at 90 (or raise it to reach further
  back)

Click OK. A smiley face in the top-right of the chart means it's running.

Check the **Experts** tab at the bottom for the result:

```
EdgewiseSync: attached to XAUUSD | account 12345678 | Your Broker Ltd | server UTC+3
EdgewiseSync: signed in as you@example.com (user 8f2c…).
EdgewiseSync: backfilling 90 days (214 deals to scan)...
EdgewiseSync: 37 closed trades found in the window.
EdgewiseSync: backfill done -- 37 sent, 0 failed.
```

Open the app. Those trades are in the table, the calendar and the equity curve.

## Check the mapping before writing anything

Set **`DryRun`** to `true` on the Inputs tab and the EA prints each payload to the
Experts tab and sends no trades. It still signs in — that's most of what a dry
run is for, and it means the payload you're shown is the real one.

Useful for confirming direction, prices and P/L look right against your own
history before any row is created. Set it back to `false` when you're satisfied.

## Keeping it running

Leave the EA on the chart. While the terminal is open every position you close is
sent within a second. Close the terminal and nothing is lost — the next start
backfills.

Sign-in tokens last an hour, so a terminal left open for a week will outlive
many of them. The EA notices the expiry, refreshes, and re-sends — you'll see
`access token expired, refreshing...` in the Experts tab and nothing is dropped.

The EA only sends **closed** trades. A journal reviews completed trades, and an
open position has no exit price or P/L to review yet.

Re-sending is safe. Each trade carries its broker position id, the database has a
unique index on `(user_id, source, external_id)`, and the request names that index
as its conflict target so Postgres merges rather than inserts. Running the
backfill a hundred times produces the same rows once.

## What arrives, and what doesn't

Filled in for you: pair, direction, entry and exit price, lot size, net P/L
(profit + commission + swap), and the real open and close times.

Entry price is volume-weighted across every entry into the position, so a trade
you scaled into over three fills reports the average you actually paid rather
than the first fill.

Left empty on purpose: **setup and mood.** Your broker knows what happened, not
why you took the trade or how you felt taking it. The dashboard shows a card —
*"3 synced trades need a mood"* — and tags them one at a time.

That is the point of the whole thing. The numbers arrive free; the reflection
stays deliberate.

### Two edges worth knowing

**Reversals.** If you flip a position directly from long to short in one order,
MT5 records that as a single deal that both closes and opens. The EA records the
half it closed; the new position gets its own row when you close it. Nothing is
lost, but the two halves are separate rows.

**Daylight saving on backfill.** MT5 reports deal times in your broker's server
time and exposes only what that server's offset from UTC is *right now* — there's
no way to ask what it was last March. So a backfilled trade from the other side
of a DST change can land an hour out, which at the very edges of a day can put it
on the neighbouring date. Live sync is always exact, so this only affects history
imported across a clock change.

## Troubleshooting

Read the Experts tab first — every failure prints there with the fix.

| What you see | What it means |
| --- | --- |
| `0 deals to scan` / `no deals in the last 90 days` | The terminal handed over an empty history — not a sync failure. Usually history has not finished downloading: Toolbox → History tab, right-click, set the period to **All**, then drag the advisor on again. Otherwise you're logged in to a different account than the one you trade. |
| `all deposits, credits or adjustments` | The account is funded but has no closed trades yet. Nothing is wrong; close a trade and it arrives on its own. |
| `DRY RUN complete -- N trades would have been sent` | Working correctly, but `DryRun` is still `true` so nothing was written. Set it to `false`. |
| `WARNING -- the terminal is not connected` | Attached before the broker connection came up, so the backfill may see nothing. Wait for the connection and reattach. |
| `SkkuJournalSync` in the Experts list | The advisor from before 2.00, when the journal was not yet per-user. It never signs in, so every write is now refused. Remove it from the chart and use `EdgewiseSync`. |
| `WebRequest failed ... error 4014` | URL isn't whitelisted. Step 4. It must match exactly, with no trailing slash. |
| `WebRequest failed ... error 4060` | Algo trading is off. Tick *Allow Algo Trading* in the EA dialog and the *Algo Trading* toolbar button. |
| `sign-in failed with HTTP 400` | Wrong email or password. If you signed up recently, confirm the address from the verification email first — unconfirmed accounts can't sign in. |
| `sign-in returned no usable session` | The key isn't a publishable/anon key for this project, or the URL points at a different project. |
| `HTTP 400` | Sync columns are missing. Run `scripts/add-broker-sync.sql`. |
| `HTTP 400` with `42P10` | The dedup index doesn't match the conflict target. Run `scripts/secure-rls.sql`, which replaces the old global index with the per-user one. |
| `HTTP 401` / `403` after signing in fine | `scripts/secure-rls.sql` hasn't been run, so there are no per-user policies to satisfy. |
| `HTTP 404` | No `trades` table on that project. Check the URL is the right project. |
| `set SupabaseUrl and SupabaseKey` | Inputs are blank. Re-drag the EA and fill them in. |
| `set SupabaseEmail and SupabasePassword` | Same, for the two new fields. The key alone can no longer write. |
| Nothing at all in Experts | EA isn't attached. Look for the smiley face; a sad face or × means algo trading is off. |
| `no opening deal for position ... skipped` | The position opened before your history window. Raise `BackfillDays`. Skipping is deliberate: direction would be a guess, and a wrong direction silently corrupts your stats. |

Synced but not in the app? The app's **Connect MetaTrader** card (on the
dashboard) shows what it can see: how many trades have arrived, from which
account, and when the last one closed. If the count is 0, the EA has not
successfully written anything — read the Experts tab. If the count is right but a
new trade is slow to appear, run `scripts/enable-realtime.sql`; without it the app
polls once a minute rather than being pushed to.

Also check you're signed in to the app as the same account the EA signs in as.
Trades belong to whoever sent them, and the app can only ever show you your own.
