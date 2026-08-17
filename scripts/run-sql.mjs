/**
 * Run a .sql file against the project's database.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS EXISTS
 * ---------------------------------------------------------------------------
 * The migrations in this directory have to go in through the dashboard's SQL
 * editor — copy the file, paste it, press run, read the output, repeat. That is
 * fine once. It is not fine for `secure-rls.sql`, which is the change everything
 * else in this project is waiting on, because a paste that loses its last few
 * lines fails in a way nobody notices until the app misbehaves later.
 *
 * The Management API exposes the same endpoint the SQL editor uses, so the file
 * on disk is what runs, in one transaction-shaped request, with the result
 * printed.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   node scripts/run-sql.mjs scripts/secure-rls.sql
 *       Dry run. Prints the file's own header comments and what would be sent.
 *       Touches nothing.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/run-sql.mjs --confirm FILE...
 *       Actually runs them, in the order given, stopping at the first failure.
 *
 * A token comes from https://supabase.com/dashboard/account/tokens and is
 * account-wide — pass it for one run rather than storing it.
 *
 * ---------------------------------------------------------------------------
 * ORDER MATTERS
 * ---------------------------------------------------------------------------
 *   scripts/secure-rls.sql       then      scripts/enable-realtime.sql
 *
 * Not the other way round: turning on replication before the policies exist
 * broadcasts every row to every listener. And `secure-rls.sql` backfills
 * existing trades onto a real user, so it raises and rolls itself back if
 * `auth.users` is empty — sign up in the app first.
 */

import { readFileSync } from "node:fs";

const MANAGEMENT_API = "https://api.supabase.com";

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

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

const env = { ...parseEnvFile(".env"), ...process.env };

const args = process.argv.slice(2);
const confirm = args.includes("--confirm");
const files = args.filter((arg) => !arg.startsWith("--"));

if (files.length === 0) {
  fail(
    "Nothing to run.\n\n" +
      "    node scripts/run-sql.mjs scripts/secure-rls.sql            # dry run\n" +
      "    SUPABASE_ACCESS_TOKEN=sbp_... node scripts/run-sql.mjs \\\n" +
      "      --confirm scripts/secure-rls.sql scripts/enable-realtime.sql",
  );
}

const supabaseUrl = (env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
if (!supabaseUrl) {
  fail("EXPO_PUBLIC_SUPABASE_URL is not set.");
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
const accessToken = (env.SUPABASE_ACCESS_TOKEN ?? "").trim();

/**
 * The comment block these migration files open with. Printing it is the whole
 * safety review: every one of them explains what it changes and what it assumes
 * before it does anything.
 */
function headerOf(sql) {
  const lines = [];

  for (const line of sql.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" && lines.length === 0) continue;
    if (!trimmed.startsWith("--")) break;
    lines.push(trimmed.replace(/^--\s?/, ""));
  }

  return lines;
}

async function runSql(sql) {
  const response = await fetch(`${MANAGEMENT_API}/v1/projects/${projectRef}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    body: text ? safeJson(text) : null,
    raw: text,
  };
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

console.log(`\nProject ${projectRef}`);

const loaded = files.map((path) => {
  let sql;
  try {
    sql = readFileSync(path, "utf8");
  } catch {
    fail(`Cannot read ${path}`);
  }
  return { path, sql };
});

for (const { path, sql } of loaded) {
  const statements = sql.split(";").filter((chunk) => chunk.trim() && !/^\s*(--|\/\*)/.test(chunk));

  console.log(`\n${path}`);
  console.log("-".repeat(path.length));
  console.log(`  ${sql.length} chars, roughly ${statements.length} statements`);

  const header = headerOf(sql);
  if (header.length) {
    console.log("");
    for (const line of header.slice(0, 14)) {
      console.log(`  | ${line}`);
    }
    if (header.length > 14) {
      console.log(`  | … ${header.length - 14} more lines of header`);
    }
  }
}

if (!confirm) {
  console.log(
    "\nDry run — nothing was sent. Add --confirm (and SUPABASE_ACCESS_TOKEN) to run.\n",
  );
  process.exit(0);
}

if (!accessToken) {
  fail(
    "SUPABASE_ACCESS_TOKEN is not set, so --confirm has nothing to authenticate with.\n" +
      "  Get one at https://supabase.com/dashboard/account/tokens",
  );
}

for (const { path, sql } of loaded) {
  console.log(`\nRunning ${path} …`);

  const result = await runSql(sql);

  if (!result.ok) {
    // Print the server's own message rather than a summary: these are Postgres
    // errors, and the position and hint are the useful parts.
    console.error(`\n  FAILED (HTTP ${result.status})`);
    console.error(`  ${typeof result.body === "string" ? result.body : JSON.stringify(result.body, null, 2)}`);
    console.error(
      "\n  Nothing after this file was run. These migrations are written to be\n" +
        "  re-runnable, so fix the cause and run the same command again.\n",
    );
    process.exit(1);
  }

  console.log(`  OK (HTTP ${result.status})`);

  // Most DDL returns an empty array. A migration whose last statement is a
  // verification SELECT — secure-rls.sql section 8 is one — returns rows, and
  // those rows are the point.
  if (Array.isArray(result.body) && result.body.length > 0) {
    console.log(`\n  ${result.body.length} row(s) returned:\n`);
    console.log(
      JSON.stringify(result.body, null, 2)
        .split("\n")
        .map((line) => `    ${line}`)
        .join("\n"),
    );
  }
}

console.log("\nDone.\n");
