# Edgewise

A trading journal that treats your state of mind as data. Most journals log
what you traded; Edgewise logs how you felt while you traded it, then looks for
the pattern you cannot see yourself.

**Live: https://skku-global.github.io/Edgewise/** — sign up with any email.

## What it does

- **Dashboard** — equity curve, win rate, profit factor, and the day's mood.
- **Trades** — the full history, with tags, notes and a detail sheet per trade.
- **Calendar** — P/L per day, coloured, next to the mood you logged that day.
- **Reports** — breakdowns by instrument, by session, by tag, by day of week.
- **Chat** — a Claude-backed briefing that reads your own history and tells you
  what it notices. It gets your real numbers, not a summary.

## Two ways to get your MT5 history in

Brokers make this harder than it should be, so there are two paths and neither
needs you to hand over an account password to a third party:

1. **Import a report.** Export any MT5 history report to HTML and pick the file.
   `src/lib/mt5-report.ts` parses the terminal's own layout, aggregates deals
   into positions, and shows gross P/L, costs and net separately.
2. **Live sync.** `mt5/EdgewiseSync.mq5` is an Expert Advisor that signs in as
   you, aggregates closed positions and upserts them on
   `(user_id, source, external_id)`, so re-running it never duplicates a trade.
   Setup is in [`mt5/README.md`](mt5/README.md).

## Your data is yours

Every table is per-user Row Level Security, not filtered-in-the-client. That
distinction is the whole thing, so it is tested rather than asserted:
`scripts/verify-rls.mjs` creates two real users, gives each a trade, then has
one try to read, update, delete and re-own the other's row.

The subtle part it encodes: **a blocked write does not raise an error.** The row
simply falls outside the policy, so Postgres reports zero rows affected — which
is indistinguishable from success unless you ask for the row back. A test that
only checks for a thrown error would pass against a completely open table.

The Supabase publishable key ships in the bundle, as it does in every
client-side Supabase app. That is safe here *because* the RLS above is verified,
not because the key is hidden.

## Stack

Expo SDK 54 (React Native + `react-native-web`, one codebase for iOS, Android
and web) · Expo Router · Supabase (Postgres, auth, realtime) · Claude ·
`react-native-svg` for the charts, hand-drawn rather than pulled from a chart
library.

## Running it yourself

```bash
npm install
cp .env.example .env      # fill in your Supabase URL and publishable key
npx expo start
```

Then apply `scripts/secure-rls.sql` to your Supabase project and confirm it with
`node scripts/verify-rls.mjs`. `.env.example` documents every variable,
including why the Claude proxy is preferred over a bundled API key.

```bash
npm run typecheck
npm test
npm run lint
```

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`. Typecheck and the test suite gate it, so a red build never
reaches the live site.

Pages serves from a sub-path, so `expo.experiments.baseUrl` is `"/Edgewise"` —
without it every asset URL 404s. `.nojekyll` lives in `public/` rather than
being produced by a deploy flag, because Expo copies `public/` into `dist` on
every export, so no deploy path can forget it and let Jekyll strip `_expo/`.

## Status

Built and used against a live broker account. Web is the tested surface; the
native builds share the codebase but the accelerometer-based restlessness
signal has not been exercised on a physical device yet.
