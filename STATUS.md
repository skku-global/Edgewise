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

## What is left

1. **Sign up through the UI with a real address and click the link.** The one
   step nothing here can do for you. Use an address you can open;
   `smitthy122@gmail.com` is proven deliverable. Now that Site URL points at
   8081 the link should land back in the app.
2. **Compile the EA** — `mt5/EdgewiseSync.mq5` has never been opened in
   MetaEditor (F7). Attach with `DryRun = true` and read the Experts tab.
3. **Chat** — `EXPO_PUBLIC_CLAUDE_API_KEY` is still empty, deliberately.
4. **A physical device** — browser only so far; the accelerometer restlessness
   flag is untested.
5. **Rotate the two credentials** used in this session (the Supabase PAT and the
   Resend API key). Both were pasted into a chat transcript. Neither was written
   to `.env` or committed.



