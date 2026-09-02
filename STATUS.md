# Edgewise — status as of 2026-08-16

Snapshot written before a shutdown. Verified against the live code and DB, not from memory.

## Verified state right now

- `npx tsc --noEmit` → clean (exit 0)
- `npx jest` → 164/164 tests pass, 10 suites
- Everything below is **uncommitted**: 55 changed paths on top of a single "Initial commit" (d676475). Branch is `master`; repo's main branch is `main`.

## What landed on 2026-08-15 (18:29 → 21:19, one session)

**Renamed the project to "Edgewise"** — `package.json` name, `app.json` (name/slug/scheme, `com.edgewise.journal` for both platforms), and `mt5/SkkuJournalSync.mq5` → `mt5/EdgewiseSync.mq5`.

**Auth, from scratch**
- `src/lib/session.tsx` — session provider, `getSession()` cold start + `onAuthStateChange`, AsyncStorage persistence
- `src/app/login.tsx` — sign in / sign up with first + last name
- Routes moved into a protected group: `src/app/(app)/`
- `src/components/splash-overlay.tsx`, `src/components/ui/account-button.tsx`

**UI system extracted** — `src/components/ui/`: button, card, screen, field, sheet, pill, stat, state, dropdown. `src/constants/theme.ts` grew 65 lines → 12KB of tokens. `src/lib/styles.ts` added.

**Screens built/rebuilt** — dashboard (`(app)/index.tsx`), trades, calendar, reports, chat. Sheets: add-trade, trade-detail, tag-trade, connect-broker, mood-picker. Charts: `charts/equity-curve/` (svg-chart + chart-frame), `charts/daily-pl/bar-chart.tsx`.

**Data layer** — `src/hooks/use-trades.ts` (realtime subscription, with a 1-min poll + foreground-refresh fallback), `src/lib/broker-sync.ts`, `trade-table.ts`, `calendar.ts`, `supabase.ts`.

**MT5 EA rewritten** (30KB) — now signs in as a real Supabase user, sends `user_id`, upserts on `(user_id, source, external_id)`. Plus `mt5/README.md` (9KB): setup, DryRun, troubleshooting.

**Test suite from nothing** — 10 files under `src/lib/__tests__/`, 164 tests, plus `src/lib/__fixtures__/trade.ts`. jest + jest-expo wired into `package.json`.

**Housekeeping** — `eslint.config.js`, `.env.example`, `.gitignore` hardened (`.env` ignored, `!.env.example`, `coverage/`), `AGENTS.md` SDK pointer corrected v57 → **v54** (matches `expo ~54.0.36`, so the old version confusion is resolved), Expo starter template files deleted.

## ~~THE BLOCKER~~ — CLEARED 2026-08-17, both scripts run and verified

Kept for the history; see "RLS closed for real" at the bottom for what actually
happened, including the way the migration reported success while leaving both
tables world-readable. What follows describes the state before that.

Verified against the live Supabase on 2026-08-16:
- `GET /rest/v1/trades?select=user_id` → HTTP 400, `42703 column trades.user_id does not exist`
- anon `GET /rest/v1/trades?select=id` → HTTP 200, returns rows

Consequences:
1. **Auth is decorative.** No `user_id`, no RLS — every account sees the same shared trades, and the anon key still reads everything.
2. **The rewritten EA cannot sync at all.** It POSTs `user_id` and upserts `on_conflict=user_id,source,external_id`; neither exists, so every request 400s.
3. **Realtime is off**, so `useTrades` is only polling. `enable-realtime.sql` must NOT go first — its header notes that replication without RLS broadcasts every row to every listener.

Run order in the Supabase SQL editor: `scripts/secure-rls.sql` → `scripts/enable-realtime.sql`.
(`create-trades-table.sql` and `add-broker-sync.sql` already went in; add-broker-sync on 2026-08-12.)

Note: the current `secure-rls.sql` is a rewrite. The previous version would have broken everything — it checked `auth.uid() = user_id` with nothing populating the column. The fix is `default auth.uid()` + NOT NULL on the column, and a per-user dedup index.

## Then, in order

1. **Compile and dry-run the EA.** Never opened in MetaEditor (F7). Riskier than before: the version that was never tested isn't the version that now exists. Attach with `DryRun = true` and read the Experts tab.
2. **Chat.** `EXPO_PUBLIC_CLAUDE_API_KEY` is in `.env` but empty (len 0). `.env.example` also lists `EXPO_PUBLIC_CLAUDE_PROXY_URL` and `EXPO_PUBLIC_CLAUDE_MODEL`, which `.env` lacks. `src/lib/claude-client.ts` supports both transports — prefer the proxy URL pointed at `scripts/claude-proxy.mjs`, since the direct-key path bundles the key into the client.
3. **Never run on a physical device.** Browser-only so far. The accelerometer restlessness flag is entirely untested.
4. ~~**Commit.**~~ Done 2026-08-17 on branch `feat/edgewise-rebuild`: `5f1270b` (the build-out) and `7b99365` (secure-rls hardening). `master` still points at `d676475`, so merge or fast-forward when you're happy.

## Migration audit, 2026-08-17

Read `secure-rls.sql` and `enable-realtime.sql` line by line before running them. They hold up — `default auth.uid()` is the right mechanism, the app needs no `user_id` plumbing, the EA's `on_conflict` target matches the new unique index, upsert has both the INSERT and UPDATE policies it needs, the moods policies derive ownership from the parent trade instead of duplicating it, and the backfill aborts rather than guessing. Two changes made (`7b99365`): an explicit `grant ... to authenticated` before the `revoke ... from anon`, and a verification query as section 8.

One unknown that can't be resolved from the repo: the first version of `add-broker-sync.sql` created a global UNIQUE index on `(source, external_id)`, that version was run on 2026-08-12, and the file has since been rewritten — so the live index name isn't recoverable. Section 3 drops it by its expected name; if the real name differed it survives and keeps enforcing global uniqueness. Section 8's output will show it. Harmless while you're the only trader.

**Order matters:** the backfill raises and rolls the whole script back if `auth.users` is empty. So sign up in the app first (which works today, RLS being open), then run the migration.

## Auth screen rebuilt, 2026-08-17 — commit `661c935`

`npx tsc --noEmit` clean, `npx jest` 175/175 across 11 suites, `npx eslint` clean on all touched files, and the web bundle builds (HTTP 200, 5.8MB) with all five new modules in the graph.

New: `src/components/brand-mark.tsx` (SVG logo), `src/components/auth-backdrop.tsx` (two radial glows), `src/components/ui/segmented.tsx`, `src/components/ui/reveal.tsx`, `src/lib/credentials.ts` + its test. Changed: `src/app/login.tsx` rewritten, `src/components/ui/field.tsx` gained an additive `trailing` slot.

Two-column at ≥920pt with a pitch panel; single centred card below that. Per-field errors, focus-first-invalid on submit, `returnKeyType` chaining, password reveal toggle, strength meter on sign-up only. No new dependencies — `react-native-svg` and `@expo/vector-icons` were already in. RN's built-in `Animated` throughout, not Reanimated, because there is no `babel.config.js` in this project and Reanimated 4 wants its worklets plugin.

**Email confirmation is ON.** Verified live: `/auth/v1/settings` → `mailer_autoconfirm: false`, `disable_signup: false`. So signing up returns no session — the screen correctly shows "Check your email for the confirmation link", and you cannot sign in until you click it. Supabase's built-in SMTP is rate-limited to a couple of emails an hour. For local work, either use a real inbox or turn off **Authentication → Sign In / Providers → Email → Confirm email** in the dashboard.

**Still missing from auth:** no "Forgot password". Doing it properly needs `resetPasswordForEmail`, a new update-password screen, and deep-link handling for the recovery token — deliberately not half-built, since sending the email with nowhere to land is a dead end.

## Auth flow completed, 2026-08-17 — commit `9fc082c`

`npx tsc --noEmit` clean, `npx jest` **190/190 across 12 suites**, `npx eslint` clean on every touched file, and `/login`, `/forgot-password`, `/reset-password` all serve HTTP 200 on the dev server.

New: `src/app/forgot-password.tsx`, `src/app/reset-password.tsx`, `src/components/auth-shell.tsx` (page chrome shared by all three auth screens), `src/components/ui/banner.tsx`, `src/hooks/use-cooldown.ts`, `src/lib/auth-link.ts` + 15 tests, `scripts/configure-auth.mjs`. Changed: `src/lib/session.tsx` (four new verbs, `isRecovering`, `linkError`, deep-link handling), `src/app/_layout.tsx` (three mutually exclusive guards), `src/app/login.tsx` (rebuilt on the shell), `src/lib/supabase.ts` (`initialAuthHash`), `.env.example`.

Behaviour worth knowing:
- **Sign-up now lands on the sign-in tab** carrying its notice. Staying on the sign-up tab made a successful sign-up look like nothing happened.
- **A recovery link opens a real session, not a "reset mode."** `isRecovering` closes the app group and opens a group holding only `reset-password`; because it is the only available screen the navigator lands there itself. Without this, "forgot my password" drops you into the dashboard with the old password intact.
- Recovery tokens arrive in the URL **fragment**, and `Linking.parse()` returns query params only — hence `lib/auth-link.ts`. On web the fragment is snapshotted at module scope in `lib/supabase.ts` *above* `createClient`, because `detectSessionInUrl` consumes it and then rewrites the address bar.
- `useLinkingURL()` is the SDK 54 hook; `useURL()` is deprecated.

**Dev-server gotcha, hit and fixed:** the running Metro had a corrupted route manifest — new files created *outside* `src/app` were registered as routes (`/../lib/auth-link`, `/../components/ui/banner`), and the two new real routes 404'd. Restarting with `--clear` and deleting `.expo/types/router.d.ts` fixed both. If a new route 404s, that is the cause.

## ~~THE EMAIL BLOCKER~~ — this diagnosis was WRONG, see below

Left in place because the reasoning is worth not repeating. The conclusion in
this section is false for this project: custom SMTP was **already configured**,
so the built-in mailer was never in the path and its org-members restriction
never applied. What was actually wrong is in "The email mystery, solved".

The redirect allow-list half of it was real, and was fixed.

Signing up sent no email. **The send is being refused, not lost.**

Supabase's built-in mail server delivers **only to addresses belonging to members of the organisation that owns the project**; every other address is rejected with *"Email address not authorized."* It is also capped at roughly **2 messages an hour**. This is documented behaviour, not a fault.

Second, independent problem: `emailRedirectTo`/`redirectTo` are only honoured when they match Supabase's **Redirect URLs** allow-list. Anything else is silently swapped for the Site URL — so a link can "work" and still land nowhere useful. This app needs `http://localhost:8081/**`, `http://localhost:19006/**` and `edgewise://**` listed.

`node scripts/configure-auth.mjs` reports all of it and needs no credentials beyond the existing `.env`. Verified live: Confirm email **ON**, signups enabled, email provider enabled. With a personal access token it also reads the allow-list and SMTP, and `--apply` fixes them.

Three ways out, in order of effort:
1. Sign up with the email on your own Supabase account — authorized today, zero config.
2. `--apply --skip-confirmation` — removes the email dependency from sign-up entirely. Password reset still needs mail by nature.
3. `--apply --smtp` with a real provider — delivery to anyone, 30/hour to start.

## Mail provider decision, 2026-08-17 — Resend

Checked against Resend's own docs rather than assumed:

| | Supabase built-in | Resend free |
|---|---|---|
| Recipients | **only org members** | anyone |
| Throughput | ~2/hour | 100/day, 3,000/month |
| Approval | n/a | **none** — no sandbox, no waiting period, production access at signup |
| Cost | included | free |

**Resend wins, and it is not close** — the built-in mailer cannot deliver to a
real user at any price, so it is not a mail server for this app's purposes.

Exact values, from https://resend.com/docs/send-with-supabase-smtp:
`smtp.resend.com`, port **465** (not 587 — implicit TLS is what they document),
username the literal string `resend`, password the API key itself.

**The one prerequisite: a domain.** Resend requires "add and verify at least one
domain" before sending, and `onboarding@resend.dev` is not a way around it — it
is test-only and 403s any recipient other than your own Resend account address
(`403-error-resend-dev-domain`). The `@resend.dev` addresses in their docs
(`delivered@`, `bounced@`, `complained@`, `suppressed@`) are event *simulators*
that never reach a human inbox, so they cannot prove this flow either.
`configure-auth.mjs --smtp` now refuses a `@resend.dev` sender for that reason,
rather than applying a setting that would fail the same silent way.

If no domain is available, option 2 above (`--skip-confirmation`) is the correct
stopgap: it makes sign-up work fully with no mail at all. Password reset is the
one flow that cannot be faked, since sending the link *is* the feature.

### The three commands, in order

`scripts/setup-resend.mjs` (added `2026-08-17`) does the domain half through
Resend's API, so neither dashboard is needed:

```
RESEND_API_KEY=re_... node scripts/setup-resend.mjs --domain=example.com --add
    Adds the domain, prints the DNS records to create.

RESEND_API_KEY=re_... node scripts/setup-resend.mjs --domain=example.com --verify
    Asks Resend to check DNS, then polls until it settles. Re-runnable.

SUPABASE_ACCESS_TOKEN=sbp_... SMTP_HOST=smtp.resend.com SMTP_PORT=465 \
SMTP_USER=resend SMTP_PASS=re_... SMTP_SENDER=no-reply@example.com \
node scripts/configure-auth.mjs --apply --smtp
    Points Supabase at Resend, and fixes the redirect allow-list in the same pass.
```

It creates the domain with **open and click tracking off**. That drops two
optional DNS records, but the reason is correctness: click tracking rewrites
every link to route through a Resend redirect, and the links this app sends are
single-use auth tokens. A corporate link scanner pre-fetching a rewritten URL
would spend the token before the user clicked it, and the confirmation would fail
with nothing to show why.

It also prints DNS names **relative to the zone** with the absolute form in
brackets. Pasting an absolute name into a panel that appends the zone yields
`send.example.com.example.com`, which resolves as nothing and is invisible until
you read the record back — it is the most common way this setup fails.

### Mail path proven, 2026-08-17

`skkuglobal.com` was **already verified** on the Resend account, so the DNS half
never needed doing. All three records (DKIM TXT, SPF MX, SPF TXT) read `verified`.

Both transports tested from this machine:

- **HTTP API** — `POST /emails` from `no-reply@skkuglobal.com` accepted, id
  `aa31c1ce-0bf1-4a3c-b24f-7293ebb54744`.
- **SMTP, port 465, implicit TLS** — full exchange completed: `235 Authentication
  successful`, `250 Accepted` on both MAIL FROM and RCPT TO, message queued as
  `90253276-887f-461f-b38e-eabeebc0a2ad`. Resend advertises
  `AUTH PLAIN LOGIN`, `SIZE 41943040`.

So the provider side is settled and 465 is not blocked here. Anything that fails
after this point is Supabase's configuration, not the mail path.

`scripts/smtp-check.mjs` is what proved it — a zero-dependency SMTP client over
`node:tls` that speaks the whole conversation and prints it, password masked.
Worth keeping precisely because Supabase reports nothing when its SMTP is wrong:
bad password, unverified sender and blocked port all look identical from inside
the app. It supports implicit TLS on 465 and STARTTLS on 587/2587, so a blocked
port can be told apart from a bad credential.

`eslint.config.js` gained a `scripts/**/*.mjs` block declaring the Node globals
(`Buffer`, `process`, `fetch`, `URL`, timers). The Expo config targets the React
Native runtime, where those do not exist.

**Still outstanding: the Supabase personal access token.** It is the only missing
input — without it the SMTP settings and the redirect allow-list cannot be
written, and `secure-rls.sql` cannot be run.

## The email mystery, solved — 2026-08-17

**Supabase has been sending mail successfully through Resend since 14 August.**
Everything written above about the built-in mailer was a wrong diagnosis of a
real symptom: custom SMTP was already configured on the project, so the built-in
server was never in the path.

Resend's delivery log (`GET /emails`) shows "Confirm your email address"
**delivered** to `smitthy122@gmail.com`, `junecash001@gmail.com`,
`juneblast97@gmail.com` and `testuser98765@gmail.com` (×3). `auth.users` holds
confirmed accounts that have since signed in, so the flow demonstrably worked.

The addresses that got nothing were **wrong addresses**:

| Address | What happened |
|---|---|
| `junecsh001@gmail.com` | typo of `junecash001` — no such mailbox |
| `junecash@gmail.com` | bounced |
| `junecash100@gmail.com` | bounced |

All three are now on Resend's **suppression list**, and that matters more than
the original bounce: further sends to a suppressed address are *silently
dropped*. Resend accepts the request, returns an id, and never delivers. So
retrying one of these looks exactly like the original bug and never will work.
They appear genuinely non-existent — every address that does exist was delivered
to — so leaving them suppressed is correct. If one is real, remove it at
https://resend.com/suppression before trying again.

**One real bug was found alongside this, and fixed.** Site URL was
`http://localhost:8082` and the allow-list held only `8082/**`, while the dev
server runs on **8081**. Every confirmation link pointed at a dead port — the
mail arrived and the link went nowhere. Now `site_url=http://localhost:8081`,
allow-list `8082/** 8081/** 19006/** edgewise://**`, sender name `Edgewise`.

Live rate limits, worth knowing before testing: **30 emails/hour**, and **one
per 60 seconds to any single address**. A second attempt inside that window is
refused and looks identical to no email at all.

## RLS closed for real — 2026-08-17, commit `a57ac82`

`secure-rls.sql` and `enable-realtime.sql` both ran (HTTP 201). `trades.user_id`,
`trades_user_id_idx`, the `(user_id, source, external_id)` unique index, four
policies per table, and both tables added to the realtime publication.

**And it was still wide open afterwards.** The migration's drop list named the
legacy policies it expected — `"Allow reads for all users"` and friends — but the
live ones were `"Allow all access to trades"` / `"Allow all access to moods"`,
`to public using (true)`. Every drop was a silent no-op, so the four correct
policies were created *beside* a policy granting everything to everyone.
Permissive policies are **OR'd**, so one `using (true)` cancels any number of
correct policies next to it, and `pg_policies` showed eight sensible-looking
entries.

Section 8's verification was complicit: it selected `policyname` and `cmd`, so
the offender read as `Allow all access to trades | ALL` beside the good rows. The
two columns that would have exposed it — `roles` and `qual` — were not selected.

Both fixed. Policies are now dropped by **enumerating `pg_policies`**, which
cannot miss a name, and section 8 **raises** on any policy granted to
`public`/`anon` or testing `true` before printing anything. A raise rolls the
migration back, so either the tables end up isolated or nothing changed and the
reason is on screen.

`scripts/verify-rls.mjs` (new) settles it by asking the database rather than
reading its configuration — two pre-confirmed users via the admin API, one trade
each, then user B attempts to **read, update, delete and re-own** user A's row.
A blocked write is not an error: the row falls outside `USING`, so it reports
zero rows affected, which is indistinguishable from success unless you ask for
the representation back. It also covers the `auth.uid()` column default (the app
never sends `user_id`; if that default breaks, every insert lands ownerless and
invisible to its own author) and the anon key against both tables.

**10/10 checks pass.** Anon gets `401 permission denied` on both tables — that is
the grant layer, checked before RLS, which is what protects them from the key
shipped in the app bundle. Probe users delete themselves in a `finally`; verified
after: 0 trades, 0 moods, 0 orphans, 0 leftover probes, 0 policies granted to
public.

Re-runnable any time policies change: `SUPABASE_ACCESS_TOKEN=sbp_... node
scripts/verify-rls.mjs`.

Consequences of all this, replacing the blocker section above: auth is no longer
decorative, the EA's `user_id` + `on_conflict=user_id,source,external_id` request
now has columns to target, and realtime is on so `useTrades` is not merely
polling.

## Web nav fixed — 2026-08-17, commit `836d633`

Two complaints, one bug: *"the NAV bar is jampacked"* and *"I don't think the nav
links are working"*.

`TabTrigger asChild` renders a Radix `Slot` and passes its own
`style={{ flexDirection: 'row', justifyContent: 'space-between' }}` down through
it. Radix's `mergeProps` merges `style` **only for props the child element
declares for itself** — the loop is `for (const propName in childProps)`. And
`<NavLink>{label}</NavLink>` declares nothing but `children`, so that style
arrived untouched in `rest`. `NavLink` then spread `{...rest}` *after* its own
`style`, replacing the entire callback.

Every link silently lost its padding, its pill radius, and its hover, focused and
pressed backgrounds. Hence both symptoms at once: five bare labels a couple of
pixels apart, and a hit area shrunk to the glyphs with nothing acknowledging a
click. **The navigation was firing the whole time.**

`tsc` and eslint accept either spread order, so nothing could have caught it.
`src/components/__tests__/nav-link-test.tsx` now does — 7 tests asserting on the
*resolved* style rather than on the ordering, so it survives a rewrite. Restoring
the old order fails it with `paddingHorizontal: Expected: 16, Received: undefined`.

Also fixed alongside: `flexShrink` defaults to **0** in React Native, not 1 as on
the web, so an overflowing bar does not compress — it pushes the rightmost links
past the edge where they are genuinely unclickable. The wordmark text now drops
below 720px.

Caveat worth keeping honest: the style loss is empirically proven by the test.
The claim that navigation fired all along is **source-verified only** — traced
through expo-router 6.0.24 and react-native-web 0.21 — because no browser is
available in this environment.

Suite: 197/197 across 13 suites. `tsc --noEmit` and `eslint` both clean.

## MT5 sync installed and compiled — 2026-08-17, commit `e1da0b8`

The user's belief was that sync should work from their account number alone, and
that they had once set something up on a computer that then worked forever.

**An account number is an identifier, not a credential** — like a bank account
number, knowing it grants nothing, and there is no MetaQuotes cloud API to ask
what an account has traded. The services that feel like set-once-and-forget
(Myfxbook, FX Blue, the bigger journals' auto-sync) take the account number
**plus the investor read-only password plus the server name**, then log in from
their own servers. That is why they survive the PC being off — and it means
standing third-party read access to the broker account, plus a per-account fee.

Our advisor reads the account number off the terminal and stamps it on each
trade, which is how the app can say *"37 trades imported · account 12345678"*.
It is an output, never an input.

### What was actually wrong, from the terminal's own log

`MQL5\Logs\20260812.log` had the answer:

```
04:28:54  SkkuJournalSync: DRY RUN -- payloads are logged, nothing is sent.
04:28:54  SkkuJournalSync: attached to EURUSD | account ******** |
04:28:54  SkkuJournalSync: backfilling 90 days (0 deals to scan)...
04:28:54  SkkuJournalSync: 0 closed trades found in the window.
04:28:54  SkkuJournalSync: backfill done -- 0 sent, 0 failed.
04:28:54  Experts  automated trading is disabled because the account has been changed
```

Four separate reasons it could never have worked, none of them a sync failure:

1. **`DryRun` was `true`.** Nothing would have been sent regardless.
2. **`0 deals to scan`.** MT5 re-downloads history from the broker on connect and
   keeps none on disk, so an advisor attached before the connection is up reads an
   empty history. Note the blank broker name and `account has been changed` in the
   same second — it was attached mid-connect.
3. **The advisor in `MQL5\Experts` was `SkkuJournalSync` v1.00 (Aug 11)** — the
   pre-rename version. `grep -c "auth/v1/token"` returns **0**: it never signs in,
   sends `Authorization: Bearer <anon key>`, and upserts on the old global
   `on_conflict=source,external_id`. Against the per-user policies from
   `secure-rls.sql` every write it attempts is refused.
4. **`EdgewiseSync` was never in the Experts folder at all.** The `.ex5` next to
   the `.mq5` in `mt5/` had been compiled *in the repo folder*, where MT5's
   Navigator never looks.

### Done without needing the user

Copied `EdgewiseSync.mq5` into
`%APPDATA%\MetaQuotes\Terminal\D0E8209F77C8CF37AD8BF550E51FF075\MQL5\Experts\`
and compiled it **headlessly** — no MetaEditor GUI, no F7:

```
metaeditor64.exe /compile:"<path>\EdgewiseSync.mq5" /log:"<logfile>"
```

`Result: 0 errors, 0 warnings`. Note it **exits 1 even on success** — trust the
log, not the exit code. The log is UTF-16, so `Get-Content -Encoding Unicode`.

`config/common.ini` also confirms `[Experts] Enabled=1` and `WebRequest=1`, so
algo trading and web requests are both permitted. **`WebRequestUrl` is an
encrypted blob**, so whether the Supabase host is on the allow-list cannot be
read from disk — only a run can tell, and `error 4014` is the answer if not.

### The fix in the advisor itself

The real defect was that **a zero-history run was indistinguishable from a
working one**: `0 deals to scan` → `0 sent, 0 failed` reads as a clean import.
Three outcomes now name themselves, and the fourth is caught earlier:

- **No deals in the window** — stated as an empty history, with causes ranked
  (still downloading → wrong account → genuinely no trades).
- **Deals but none closing** — the normal reading for a funded account that has
  not traded; a balance credit closes no position.
- **A dry run's summary** counted trades as "sent" because `SendTrade` returns
  true after logging the payload. It now reports how many *would* have been sent.
- **`TERMINAL_CONNECTED` false at attach** now warns, which is the upstream cause
  of the first case.

`*.ex5` added to `.gitignore` — compiled per machine, and MT5 loads it from its
own Experts folder, so only the source is worth tracking.

## What is left (updated 2026-08-17)

1. **Attach the advisor — 3 minutes, and the only step left on sync.** Open
   MetaTrader, **wait for the broker name to appear** before touching anything.
   Toolbox → History → right-click → period **All**. Then drag **`EdgewiseSync`**
   (not `SkkuJournalSync`) onto any chart, tick *Allow Algo Trading*, fill the
   four inputs, leave `DryRun = true` for the first run, and read the Experts tab
   — it now names every failure mode. Then set `DryRun = false` and reattach.
2. **Sign up through the UI with a real address and click the link.** Still the
   one step nothing here can do. `smitthy122@gmail.com` is proven deliverable.
   This also gates the advisor: an unconfirmed account cannot sign in, so
   `Login()` would fail with HTTP 400.
3. **Chat** — `EXPO_PUBLIC_CLAUDE_API_KEY` is still empty, deliberately.
4. **A physical device** — browser only so far; the accelerometer restlessness
   flag is untested.
5. **Rotate the two credentials** used on 2026-08-17 (the Supabase PAT and the
   Resend API key). Both were pasted into a chat transcript. Neither was written
   to `.env` or committed.

## The backend stopped resolving — 2026-09-01

**This gates every numbered item in "What is left" above.** The app cannot reach
Supabase, so nothing that touches the database can be tested, including the EA.

The symptom was a browser console holding roughly thirty
`net::ERR_NAME_NOT_RESOLVED` lines against
`nqwtetjrzoaggaerriew.supabase.co/auth/v1/token?grant_type=refresh_token`, plus
one on `/auth/v1/signup`, and an `AuthRetryableFetchError: Failed to fetch`.

**It is DNS, not the app, and not this machine.** Queried against `8.8.8.8` so the
local resolver is out of the picture:

```
supabase.co                      -> 76.76.21.21   resolves
nqwtetjrzoaggaerriew.supabase.co -> NXDOMAIN      no record at all
db.nqwtetjrzoaggaerriew...       -> NXDOMAIN
```

A random invented ref returns NXDOMAIN too, so **the zone has no wildcard** —
which means a paused project and a deleted one are indistinguishable from
outside. Only the dashboard can tell them apart.

**Paused is by far the likelier of the two.** That ref was provably live on
2026-08-17: `verify-rls.mjs` ran 10/10 against it, and the SQL migrations
returned 201. Free-tier projects pause after about a week idle and 15 days had
passed. Worth knowing for next time: **a paused Supabase project loses its DNS
record entirely**, so it fails at name resolution rather than returning an HTTP
error — which is why this reads as "no internet" rather than "project paused",
and why the first instinct is to blame the network.

### Why one dead host produced thirty errors

`supabase-js` **does not clear a stored session when a refresh fails with a
retryable fetch error** — only on a real auth error. `_callRefreshToken` returns
`{ session: null, error }` and deliberately skips `_removeSession()` when
`isAuthRetryableFetchError` is true, on the reasoning that a network blip should
not sign anyone out. With a permanently dead host that reasoning inverts: the
stale `localStorage` token is retried about ten times per `autoRefreshToken`
tick, and again on every `visibilitychange`, indefinitely. Clearing site data for
the origin silences it immediately.

### What was fixed here

**The app said "Failed to fetch."** `describe()` had no network branch, so the
raw platform wording reached the user — the least useful thing to show someone
whose password was in fact correct. There is now a first branch, ahead of every
other check, because a dead backend otherwise imitates all of them: a sign-in
that never left the browser is not a credential problem.

The mapping moved to **`src/lib/auth-errors.ts`**. It was previously a private
function inside `session.tsx`, which is why it had no tests while `auth-link.ts`
— the same kind of pure string helper — has fifteen. `session.tsx` keeps a
four-line wrapper that binds the host, so the message can name what it failed to
reach; `UnconfirmedEmailError` moved with it and is re-exported, so `login.tsx`
is untouched.

Detection keys on `AuthRetryableFetchError` **paired with status 0**, which is
what supabase-js sets when `fetch` itself throws. The message is not a reliable
signal on its own — Chrome says "Failed to fetch", Safari "Load failed", Firefox
"NetworkError when attempting to fetch resource", React Native "Network request
failed" — so all four are covered as a secondary net, and each is asserted in the
tests. A retryable error that *does* carry a status (a 503) is deliberately kept
separate: something answered, and said to come back later.

`src/lib/__tests__/auth-errors-test.ts` adds 15 tests, five of which exist purely
to prove the new first-position branch does **not** swallow bad credentials, the
unconfirmed-email constant, the mailer refusal, or a 429.

Suite: **248/248 across 15 suites**. `tsc --noEmit` clean, `eslint` clean on all
three files.

### A second, unrelated bug found on the way — `.env.local` beats `.env`

Verified in `node_modules/@expo/env/build/index.js`, whose own comment reads
*"Iterate over each dotenv file in lowest prio to highest prio order"*: the list
is `[.env.local, .env]` highest-first, then reversed and overwritten key by key.
**`.env.local` wins.** The startup line `env: load .env.local .env` is the tell.

`.env.local` held `EXPO_PUBLIC_CLAUDE_API_KEY=your_claude_api_key_here`. Since
`claude-client.ts` decides the Chat tab is configured on `.trim() !== ""`, a
placeholder counted as a real key: the tab skipped its own setup explanation and
called the API, failing with a 401 instead. Now blank.

**This corrects "Chat — `EXPO_PUBLIC_CLAUDE_API_KEY` is still empty" above**,
which was read off `.env` alone and was therefore true of the wrong file.

### When a working URL exists, it goes in five places

1. `.env`
2. `.env.local` — **and this one wins**, so editing `.env` alone changes nothing
3. Repo secret `EXPO_PUBLIC_SUPABASE_URL`, plus the anon key
4. `.env.production`, committed — the default a Vercel build reads
5. Restart Metro with `--clear`; env vars are read at bundle time

On (3): `488c9a0` made both values **defaults in `deploy.yml`**, so the published
site at `skku-global.github.io/Edgewise` is pointed at the dead ref too and is
broken in the same way until the project is restored under the same ref or a repo
secret overrides it. A secret of the same name still wins — that is the intended
rotation path, and it is the only one that does not require a commit.

Nothing in `src/` hardcodes the ref: `lib/supabase.ts` is env-only by design and
throws at import when unset. The only other copy is inside the committed `dist/`
bundle from the last export.

## The outage message nobody saw — 2026-09-01, commit `34bc244`

`c49c01f` wrote the message. This makes it reachable, and stops the console noise
that made the page feel broken in a different way.

### The message only fired if you submitted the form

`getSession()` **makes no network request in either common cold-load case.** With
nothing in storage `__loadSession` returns `{session: null, error: null}` outright;
a stored token still inside its expiry window is returned as-is. Both paths are
silent, so a first-time visitor to the published site got an ordinary, working-looking
sign-in screen and learned nothing until they typed a password and pressed the button.

The stale-token path *is* covered — `__loadSession` returns the retryable error
rather than throwing, once `accessTokenStillValid` fails — which is exactly the
path this machine was on, and why the message did appear here. That made the gap
invisible from the one browser it was tested in.

`src/lib/backend-reachable.ts` asks the host directly, on the signed-out path only.

**Any answer counts as reachable.** 401, 404, 500 — all of them prove DNS
resolved, which is the whole question. The bar is deliberately this low because
the message accuses the user's project of being paused or deleted; a false
positive is expensive and a false negative merely returns you to the old
behaviour.

**Two traps, both recorded in the file, because correct code looks like an
oversight here:**

1. The probe is `mode: 'no-cors'` so a CORS policy cannot be reported as an
   outage.
2. It therefore must **never inspect the response.** An opaque response reports
   `status: 0` even from a perfectly healthy host — verified live against
   `supabase.co`. Any `r.ok` or `status === 200` check would declare every
   backend on earth unreachable.

### Why the console held thirty errors, and what is achievable

Documented above as "about ten times per tick". The actual figure: `retryable`
sleeps `200 * 2^(attempt-1)` and keeps going while the next backoff still fits
inside `AUTO_REFRESH_TICK_DURATION_MS` (30s), so **each tick costs about eight
requests** — forever, since the session is never cleared on a retryable failure.

Stopping the ticker once does not hold. **`_onVisibilityChanged` calls
`_startAutoRefresh()` itself on every tab focus**, so a single `stopAutoRefresh()`
survives until the first tab switch and no further. The stop is re-asserted on a
20s interval that touches no network.

Recovery is driven by `AppState` rather than a timer: a timer would have to make
a request to learn anything, reintroducing the noise this removes. `AppState`
works on both platforms — react-native-web maps it onto document visibility.

**Two bursts survive and cannot be reached from outside the library:** one on
load, from `_recoverAndRefresh()` inside `_initialize()`, which runs before any
React code mounts, and one per tab focus from that same visibility handler. So
the honest end state is **~8 on load, ~8 per focus, and 0 in between**, against
~8 every 30s indefinitely. The repetition is what goes away.

The teardown **has** to call `startAutoRefresh()`. Leaving the ticker stopped
would mean no token refreshed again for the rest of the session — a far quieter
bug than the one being fixed, and a worse one.

### The test exists because both failure modes are invisible

A ticker that quietly restarts puts the storm back with nobody the wiser; a
ticker that never restarts kills refreshes silently. Neither shows up in any
other check, so `session-backend-test.tsx` pins both, plus a re-probe on
foreground that stays quiet while the host is still down.

It hung `jest` for eight minutes on the first run: the mounted provider was never
unmounted, so its 20s re-assert interval held the worker open. Teardown in
`afterEach` fixes it — worth knowing, because a leaked interval in a provider
test reads as a slow suite rather than a bug. (`--forceExit` prints its
open-handle warning whenever the flag is set, so that line is not evidence of
anything; the single file now exits on its own in 4.5s.)

Suite: **286/286 across 17 suites**, up from 248/15. `tsc --noEmit` clean,
`eslint` clean.

## The Vercel build had no credentials at all — 2026-09-02

`expo export -p web` failed on Vercel at `src/lib/supabase.ts:38`, the
module-scope throw, with both env vars reported missing. The stack ran
`session.tsx:54` → `account-button.tsx:24` → `app-tabs.web.tsx:26` →
`(app)/_layout.tsx:11`, then `Command "expo export -p web" exited with 1`.

Three facts explain it, and only together:

1. **`vercel.json` carries no env.** It has `buildCommand`, `outputDirectory`,
   `devCommand`, `framework`, `cleanUrls` — nothing else. The current property
   table for `vercel.json` no longer lists `build` or `env`, so the old
   `build.env` route is legacy; dashboard variables are the supported path.
2. **`deploy.yml`'s defaults are invisible to Vercel.** GitHub Actions env and
   Vercel env are separate systems. The two values committed at `deploy.yml:47`
   only ever reached the Pages build.
3. **Static rendering evaluates this module at build time.** That is why the
   *build* died instead of a page failing at runtime — the throw ran on the
   runner, inside `expo export`, with no browser involved.

So the deploy had never been configured, and nothing about the recent work
caused it. It would have failed identically on the first push.

### Why a committed `.env.production` rather than the dashboard

Both work. The file was chosen because it makes a fresh clone deploy without
anyone knowing a setup step exists, which is the same reason `488c9a0` put
defaults in `deploy.yml`.

It stays overridable. `@expo/env` states plainly that loading "won't override
existing environment variables defined in the system environment" — a real
variable set in Vercel's project settings beats the file, with no commit needed.
Same default-plus-override shape as the workflow, and the same rotation path.

Safe to commit for the same reason `deploy.yml` already commits them: every
`EXPO_PUBLIC_` value is compiled into the bundle in plain text and readable by
anyone with the app. Per-user Row Level Security is what separates one trader's
history from another's — not secrecy of a publishable key. `.gitignore` covers
`.env` and `.env*.local`, and neither pattern matches `.env.production`, so the
file tracks without a `.gitignore` change and the two real local files stay out.

### Proven by simulating the runner, not by pushing

`.env` and `.env.local` were moved aside so the tree held exactly what a Vercel
checkout holds — `.env.example` and `.env.production` — and the export was run to
`--output-dir C:/tmp/sim-dist`, away from the gitignored `dist/`. Both files were
restored in the same shell invocation, so a failed export could not leave them
moved.

It exported clean: 15 static routes, a 1.68 MB bundle, exit 0. The startup line
read `env: load .env.production` / `env: export EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY`.

The stronger evidence is in the bundle. Both credentials appear in it once each,
and the string `is not configured` appears **zero** times — Expo inlines
`process.env.EXPO_PUBLIC_*` as literals, so with both present the minifier can
fold `missing.length` to zero and delete the whole throw. An export that merely
skipped the throw at runtime would still carry that string. Its absence is proof
the values were known at build time.

### Two things this does not fix

**`EXPO_WEB_BASE_URL` must stay unset on Vercel.** `/Edgewise` is the Pages-only
subpath; `app.config.js:10` treats unset as serving from root, which is what
Vercel and the dev server need. Setting it there would break every asset path.

**The site will build and then show the outage banner.** The ref it points at
stopped resolving on 2026-09-01. A green deploy is not a working app until the
Supabase project is restored — that part is still hands-on-dashboard work, and no
build-side change can substitute for it.
