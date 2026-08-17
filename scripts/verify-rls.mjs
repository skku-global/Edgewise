/**
 * Prove per-user isolation empirically, with two real users and real requests.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS
 * ---------------------------------------------------------------------------
 * `secure-rls.sql` ran successfully and left the database wide open.
 *
 * It created four correct per-user policies on each table, and a legacy policy
 * named "Allow all access to trades" -- `to public using (true)` -- survived
 * beside them, because the migration's drop list guessed at the old names and
 * guessed wrong. Permissive policies are OR'd together, so that one policy
 * granted everything to everyone while eight policies in `pg_policies` looked
 * entirely reasonable. Reading the policy list is how the problem was missed.
 *
 * So this asks the database the question directly instead: two users, one row
 * each, four attempts to cross the boundary. Reading a row you should not see is
 * a failure; so is *silently* updating or deleting one, which RLS reports as
 * "0 rows affected" rather than as an error.
 *
 * Also checked, because both are load-bearing and neither is visible in the
 * policy list:
 *   - `user_id` defaults to `auth.uid()`. The app never sends the column, so if
 *     the default stops working every insert lands with a NULL owner and, being
 *     invisible to its own author, looks like the insert silently failed.
 *   - the anon key cannot read either table at all. That is the `revoke ... from
 *     anon` grant layer, which is checked before RLS and is what protects the
 *     tables from anyone holding the key shipped in the app bundle.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/verify-rls.mjs
 *
 *   --keep    Leave the two probe users behind for inspection. Off by default;
 *             normally they are deleted, which cascades to their trades.
 *
 * The token is needed for one thing only: fetching the project's service-role
 * key, which is what creates pre-confirmed users. Sign-up cannot be used instead
 * -- with email confirmation on it returns no session, so there is nothing to
 * make authenticated requests with.
 *
 * Read-only with respect to your data: it creates its own users, writes only
 * rows it owns, and deletes them again. It never touches existing rows.
 */

import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const MANAGEMENT_API = "https://api.supabase.com";

/**
 * Fixed, recognisable, and on a domain that exists. Fixed rather than random so
 * a crashed run leaves a known pair to clean up rather than an accumulating
 * pile; `create` deletes any leftovers first.
 */
const PROBE_USERS = [
  { label: "A", email: "rls-probe-a@skkuglobal.com" },
  { label: "B", email: "rls-probe-b@skkuglobal.com" },
];

function parseEnvFile(path) {
  const found = {};

  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return found;
  }

  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match) continue;

    let value = match[2].trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) {
      value = value.slice(1, -1);
    } else {
      value = value.replace(/\s+#.*$/, "");
    }

    found[match[1]] = value;
  }

  return found;
}

const env = { ...parseEnvFile(".env"), ...process.env };

const args = process.argv.slice(2);
const keep = args.includes("--keep");

const supabaseUrl = (env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const anonKey = (env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const accessToken = (env.SUPABASE_ACCESS_TOKEN ?? "").trim();

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (!supabaseUrl || !anonKey) {
  fail("EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY must be set in .env.");
}

if (!accessToken) {
  fail(
    "SUPABASE_ACCESS_TOKEN is not set. It is needed to read the service-role key,\n" +
      "  which is what creates the pre-confirmed probe users.\n" +
      "  Get one at https://supabase.com/dashboard/account/tokens",
  );
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

/**
 * A test that cannot fail proves nothing, so every check is recorded and the
 * exit code reflects the tally. `expected` reads as the security property in
 * plain words, since that is what a reader needs when one goes red.
 */
const results = [];

function check(name, passed, expected, got) {
  results.push({ name, passed, expected, got });
  console.log(`  ${passed ? "pass" : "FAIL"}  ${name}`);
  if (!passed) {
    console.log(`        expected ${expected}`);
    console.log(`        got      ${got}`);
  }
}

async function management(method, path, body) {
  const response = await fetch(`${MANAGEMENT_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) {
    fail(`Management API ${method} ${path} failed (HTTP ${response.status}).\n  ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

/** REST/auth request as whoever `token` is. `token` = anonKey means anonymous. */
async function rest(method, path, { token, body, prefer } = {}) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: anonKey,
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();

  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  return { status: response.status, body: json };
}

console.log(`\nRLS verification — project ${projectRef}`);

// ---------------------------------------------------------------------------
// The service-role key. Never printed: it bypasses RLS entirely.
// ---------------------------------------------------------------------------
const apiKeys = await management("GET", `/v1/projects/${projectRef}/api-keys`);
const serviceKey = apiKeys.find((key) => key.name === "service_role")?.api_key;

if (!serviceKey) {
  fail(
    "No service_role key came back from the Management API. This project may use\n" +
      "  the newer publishable/secret key scheme; create a secret key in the\n" +
      "  dashboard and this script can be pointed at it.",
  );
}

async function admin(method, path, body) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  if (!response.ok) {
    fail(`Admin API ${method} ${path} failed (HTTP ${response.status}).\n  ${text}`);
  }
  return text ? JSON.parse(text) : {};
}

// ---------------------------------------------------------------------------
// Two confirmed users, signed in.
// ---------------------------------------------------------------------------
console.log("\nSetting up two probe users");

const existing = await admin("GET", "/auth/v1/admin/users?per_page=200");

/**
 * A different password per run. If one of these accounts is ever left behind by
 * a crash, its password is not recoverable from this file.
 */
function password() {
  return `Probe-${randomUUID()}`;
}

const users = [];

for (const probe of PROBE_USERS) {
  const stale = (existing.users ?? []).find((user) => user.email === probe.email);
  if (stale) {
    await admin("DELETE", `/auth/v1/admin/users/${stale.id}`);
    console.log(`  removed a leftover ${probe.email}`);
  }

  const pass = password();

  // email_confirm skips the mail round trip entirely, so this neither sends a
  // message nor risks a bounce against the sending domain's reputation.
  const created = await admin("POST", "/auth/v1/admin/users", {
    email: probe.email,
    password: pass,
    email_confirm: true,
  });

  const signIn = await rest("POST", "/auth/v1/token?grant_type=password", {
    token: anonKey,
    body: { email: probe.email, password: pass },
  });

  if (signIn.status !== 200 || !signIn.body?.access_token) {
    fail(
      `Could not sign in as ${probe.email} (HTTP ${signIn.status}).\n` +
        `  ${JSON.stringify(signIn.body)}`,
    );
  }

  users.push({ ...probe, id: created.id, token: signIn.body.access_token });
  console.log(`  user ${probe.label}  ${probe.email}  ${created.id}`);
}

const [alice, bob] = users;

let failedEarly = false;

try {
  // -------------------------------------------------------------------------
  // Each user inserts one trade, without sending user_id.
  // -------------------------------------------------------------------------
  console.log("\nInsert, and the auth.uid() default");

  const trades = {};

  for (const user of users) {
    const inserted = await rest("POST", "/rest/v1/trades", {
      token: user.token,
      prefer: "return=representation",
      body: {
        pair: "EURUSD",
        direction: "long",
        entry_price: 1.1,
        exit_price: 1.2,
        size: 1,
        setup_type: `rls-probe-${user.label}`,
        notes: `RLS verification, user ${user.label}. Safe to delete.`,
      },
    });

    if (inserted.status !== 201 || !Array.isArray(inserted.body) || !inserted.body[0]) {
      fail(
        `User ${user.label} could not insert (HTTP ${inserted.status}).\n` +
          `  ${JSON.stringify(inserted.body)}\n` +
          "  If this is a NOT NULL violation on user_id, the `default auth.uid()`\n" +
          "  in secure-rls.sql section 1 is missing — the app never sends the column.",
      );
    }

    const row = inserted.body[0];
    trades[user.label] = row.id;

    check(
      `user ${user.label}'s insert is owned by user ${user.label}`,
      row.user_id === user.id,
      `user_id ${user.id} (from the column default)`,
      `user_id ${row.user_id}`,
    );
  }

  // -------------------------------------------------------------------------
  // The boundary. Bob against Alice's row, four ways.
  // -------------------------------------------------------------------------
  console.log("\nIsolation — user B against user A's trade");

  const bobSees = await rest("GET", "/rest/v1/trades?select=id,setup_type", { token: bob.token });
  const visible = Array.isArray(bobSees.body) ? bobSees.body : [];

  check(
    "user B's list contains only user B's trade",
    visible.length === 1 && visible[0].id === trades.B,
    `exactly 1 row, id ${trades.B}`,
    `${visible.length} row(s): ${JSON.stringify(visible)}`,
  );

  const bobReadsAlice = await rest("GET", `/rest/v1/trades?select=id&id=eq.${trades.A}`, {
    token: bob.token,
  });

  check(
    "user B cannot read user A's trade by id",
    Array.isArray(bobReadsAlice.body) && bobReadsAlice.body.length === 0,
    "0 rows",
    JSON.stringify(bobReadsAlice.body),
  );

  // A blocked write is not an error -- the row simply falls outside USING, so
  // nothing matches and the response is an empty set. Indistinguishable from
  // success unless the returned representation is inspected, which is why this
  // asks for it.
  const bobUpdatesAlice = await rest("PATCH", `/rest/v1/trades?id=eq.${trades.A}`, {
    token: bob.token,
    prefer: "return=representation",
    body: { notes: "written by user B — this must never appear" },
  });

  check(
    "user B cannot update user A's trade",
    Array.isArray(bobUpdatesAlice.body) && bobUpdatesAlice.body.length === 0,
    "0 rows affected",
    JSON.stringify(bobUpdatesAlice.body),
  );

  const bobDeletesAlice = await rest("DELETE", `/rest/v1/trades?id=eq.${trades.A}`, {
    token: bob.token,
    prefer: "return=representation",
  });

  check(
    "user B cannot delete user A's trade",
    Array.isArray(bobDeletesAlice.body) && bobDeletesAlice.body.length === 0,
    "0 rows affected",
    JSON.stringify(bobDeletesAlice.body),
  );

  // Belt and braces: confirm A's row is genuinely still there and unedited,
  // rather than trusting that the two empty responses above meant no effect.
  const aliceRereads = await rest("GET", `/rest/v1/trades?select=id,notes&id=eq.${trades.A}`, {
    token: alice.token,
  });
  const aliceRow = Array.isArray(aliceRereads.body) ? aliceRereads.body[0] : null;

  check(
    "user A's trade survived, with its notes intact",
    Boolean(aliceRow) && aliceRow.notes?.includes("user A"),
    "the row still present, notes unchanged",
    JSON.stringify(aliceRereads.body),
  );

  // -------------------------------------------------------------------------
  // Ownership cannot be reassigned. WITH CHECK on the UPDATE policy is the only
  // thing stopping a user from handing their row to somebody else.
  // -------------------------------------------------------------------------
  console.log("\nOwnership");

  const bobSteals = await rest("PATCH", `/rest/v1/trades?id=eq.${trades.B}`, {
    token: bob.token,
    prefer: "return=representation",
    body: { user_id: alice.id },
  });

  check(
    "user B cannot reassign their own trade to user A",
    bobSteals.status === 403 ||
      (Array.isArray(bobSteals.body) && bobSteals.body.length === 0),
    "refused (403) or 0 rows affected",
    `HTTP ${bobSteals.status} ${JSON.stringify(bobSteals.body)}`,
  );

  // -------------------------------------------------------------------------
  // The anon key, which ships inside the app bundle and is public by design.
  // -------------------------------------------------------------------------
  console.log("\nThe anon key");

  for (const table of ["trades", "moods"]) {
    const anonReads = await rest("GET", `/rest/v1/${table}?select=id&limit=5`, { token: anonKey });
    const empty = Array.isArray(anonReads.body) && anonReads.body.length === 0;

    check(
      `anon cannot read ${table}`,
      anonReads.status === 401 || anonReads.status === 403 || empty,
      "401/403, or an empty set",
      `HTTP ${anonReads.status} ${JSON.stringify(anonReads.body)}`,
    );
  }
} catch (error) {
  failedEarly = true;
  console.error(`\n  Aborted: ${error?.message ?? error}`);
} finally {
  // Always, including after a failure: leaving working credentials behind for
  // two accounts would be a worse outcome than any test result.
  if (keep) {
    console.log("\n  --keep given, so the probe users remain. Delete them when done:");
    for (const user of users) console.log(`    ${user.email}  ${user.id}`);
  } else {
    console.log("\nCleaning up");
    for (const user of users) {
      await admin("DELETE", `/auth/v1/admin/users/${user.id}`);
      console.log(`  deleted ${user.email} (its trades cascade)`);
    }
  }
}

const failures = results.filter((result) => !result.passed);

console.log(`\n${results.length - failures.length}/${results.length} checks passed`);

if (failures.length || failedEarly) {
  console.error(
    "\n  Per-user isolation is NOT in force. Re-run scripts/secure-rls.sql, and if\n" +
      "  it reports success while these checks still fail, list the live policies:\n" +
      "    select tablename, policyname, roles, qual from pg_policies\n" +
      "     where schemaname = 'public' and tablename in ('trades','moods');\n" +
      "  A single permissive policy granted to `public` with `using (true)` is\n" +
      "  enough to cancel every correct policy beside it.\n",
  );
  process.exit(1);
}

console.log(
  "\n  Isolation holds: each user sees only their own trades, cannot read, edit or\n" +
    "  delete anyone else's, cannot give a row away, and the anon key reads\n" +
    "  nothing. Verified against the live database, not inferred from the policy\n" +
    "  list.\n",
);
