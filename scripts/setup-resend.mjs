/**
 * Resend domain setup: add a sending domain, print its DNS records, verify it.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS
 * ---------------------------------------------------------------------------
 * Auth email in this app is blocked on one thing: Supabase's built-in mail
 * server delivers only to addresses belonging to members of the project's
 * organisation and refuses every other one, silently, with "Email address not
 * authorized". Real SMTP is the fix and Resend is the provider (free, no
 * approval step, 100/day against roughly two an hour).
 *
 * Resend will not send to anyone but your own account address until you have a
 * verified domain, and `onboarding@resend.dev` is not a way around that — it
 * 403s any other recipient. So a domain has to be added and verified first, and
 * that is what this does.
 *
 * The dashboard can do it too. This exists because the DNS records are long,
 * exact, easy to mistype, and the failure mode is a domain that sits at
 * `pending` for three days before turning to `failed` with no explanation. Here
 * the records are printed once, in the shape a DNS panel wants, and the verify
 * step reports per-record status so a single wrong record is obvious.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   RESEND_API_KEY=re_... node scripts/setup-resend.mjs
 *       List the domains on the account and their status. Read-only.
 *
 *   RESEND_API_KEY=re_... node scripts/setup-resend.mjs --domain=example.com --add
 *       Add the domain and print the DNS records to create. Safe to re-run: if
 *       the domain already exists it prints that one's records instead of
 *       creating a second.
 *
 *   RESEND_API_KEY=re_... node scripts/setup-resend.mjs --domain=example.com
 *       Show that domain's records and the status of each. Read-only.
 *
 *   RESEND_API_KEY=re_... node scripts/setup-resend.mjs --domain=example.com --verify
 *       Ask Resend to check DNS now, then poll until it settles.
 *
 * An API key comes from https://resend.com/api-keys. Pass it for a single run
 * rather than storing it — it can send mail as your domain.
 *
 * ---------------------------------------------------------------------------
 * WHY TRACKING IS TURNED OFF
 * ---------------------------------------------------------------------------
 * The domain is created with open and click tracking disabled. That removes two
 * optional DNS records, but the real reason is correctness: click tracking
 * rewrites every link in the email to route through a Resend redirect, and the
 * links this app sends are single-use auth tokens. A corporate link scanner or
 * antivirus that pre-fetches a rewritten URL would spend the token before the
 * user ever clicks it, and the confirmation would fail with no way to tell why.
 *
 * ---------------------------------------------------------------------------
 * AFTERWARDS
 * ---------------------------------------------------------------------------
 * Once the domain reads `verified`, point Supabase at it:
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... SMTP_HOST=smtp.resend.com SMTP_PORT=465 \
 *   SMTP_USER=resend SMTP_PASS=re_... SMTP_SENDER=no-reply@example.com \
 *   node scripts/configure-auth.mjs --apply --smtp
 */

import { readFileSync } from "node:fs";

const RESEND_API = "https://api.resend.com";

/** How long to wait for DNS to be seen, before saying "run --verify again". */
const POLL_ATTEMPTS = 24;
const POLL_INTERVAL_MS = 5_000;

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

    // Strip one layer of matching quotes, and an inline comment on unquoted
    // values only — a '#' inside a key is part of the key.
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

function heading(text) {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const env = { ...parseEnvFile(".env"), ...process.env };

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const prefixed = args.find((arg) => arg.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : null;
};

const apiKey = (env.RESEND_API_KEY ?? env.SMTP_PASS ?? "").trim();
const add = has("--add");
const verify = has("--verify");
const region = valueOf("--region") ?? "us-east-1";

// Accept a bare address as well as a domain: pasting `no-reply@example.com` when
// asked for a domain is the obvious slip, and the intent is unambiguous.
const domainArg = (valueOf("--domain") ?? "").trim().toLowerCase().replace(/^.*@/, "");

if (!apiKey) {
  fail(
    "RESEND_API_KEY is not set.\n\n" +
      "    RESEND_API_KEY=re_... node scripts/setup-resend.mjs\n\n" +
      "  Create one at https://resend.com/api-keys (Sending access is enough for\n" +
      "  sending, but adding a domain needs Full access).",
  );
}

if (!/^re_/.test(apiKey)) {
  console.log("\n  Note: Resend keys normally begin `re_`. Continuing anyway.");
}

async function resend(method, path, body) {
  const response = await fetch(`${RESEND_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  const parsed = text ? safeJson(text) : {};

  if (!response.ok) {
    // Resend's own message is more precise than a guess. 401 is a bad or revoked
    // key; 422 on create is usually a domain already on another team.
    const detail = typeof parsed === "string" ? parsed : (parsed.message ?? JSON.stringify(parsed));
    fail(`Resend ${method} ${path} failed (HTTP ${response.status}).\n  ${detail}`);
  }

  return parsed;
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * DNS panels disagree about whether the host field is relative to the zone or
 * absolute, and pasting an absolute name into a panel that appends the zone
 * produces `send.example.com.example.com` — which verifies as nothing and is
 * invisible until you read the record back. Resend returns most names relative
 * and the tracking one absolute, so normalise to relative and print the
 * absolute form alongside it.
 */
function relativeName(name, domain) {
  if (name === domain) return "@";
  const suffix = `.${domain}`;
  return name.endsWith(suffix) ? name.slice(0, -suffix.length) : name;
}

function printRecords(domain) {
  const records = domain.records ?? [];

  if (records.length === 0) {
    console.log("  (Resend returned no records for this domain)");
    return;
  }

  console.log(
    "  Add these to your DNS. The Name column is relative to the zone, which is\n" +
      "  what most panels want — if yours shows the full hostname instead, use the\n" +
      "  value in brackets.\n",
  );

  for (const [index, record] of records.entries()) {
    const host = relativeName(record.name, domain.name);
    const absolute = host === "@" ? domain.name : `${host}.${domain.name}`;

    console.log(`  ${index + 1}. ${record.record ?? "record"}  [${record.status ?? "?"}]`);
    console.log(`     Type      ${record.type}`);
    console.log(`     Name      ${host}    (${absolute})`);
    console.log(`     Value     ${record.value}`);
    if (record.priority !== undefined && record.priority !== null) {
      console.log(`     Priority  ${record.priority}`);
    }
    console.log(`     TTL       ${record.ttl ?? "Auto"}`);
    console.log("");
  }

  const hasTxt = records.some((record) => record.type === "TXT");
  if (hasTxt) {
    console.log(
      "  The TXT values arrive with surrounding double quotes. Some panels want\n" +
        "  them, most add their own — if a TXT record will not verify, try it both\n" +
        "  ways before assuming anything else is wrong.\n",
    );
  }

  const hasMx = records.some((record) => record.type === "MX");
  if (hasMx) {
    console.log(
      "  The MX record is on the `send` subdomain, not the root, so it does not\n" +
        "  touch wherever your normal mail already goes.\n",
    );
  }
}

function statusNote(status) {
  switch (status) {
    case "verified":
      return "Ready to send.";
    case "not_started":
      return "Records added to Resend but never checked. Run again with --verify.";
    case "pending":
      return "Resend is looking for the records. DNS can take minutes to hours.";
    case "partially_verified":
      return "Sending or receiving is verified, the other is not. Sending is the one this app needs.";
    case "failed":
      return "Resend could not find the records within 72 hours. Re-check them, then --verify again.";
    case "temporary_failure":
      return "Was verified, and a record has stopped resolving. Resend retries for 72 hours.";
    default:
      return "";
  }
}

async function findDomain(name) {
  const list = await resend("GET", "/domains");
  const domains = Array.isArray(list) ? list : (list.data ?? []);
  return domains.find((domain) => domain.name?.toLowerCase() === name) ?? null;
}

console.log("\nResend domain setup");

// ---------------------------------------------------------------------------
// No --domain: just report what is on the account.
// ---------------------------------------------------------------------------
if (!domainArg) {
  const list = await resend("GET", "/domains");
  const domains = Array.isArray(list) ? list : (list.data ?? []);

  heading("Domains on this account");

  if (domains.length === 0) {
    console.log(
      "  None.\n\n" +
        "  Until one is verified, Resend will only deliver to your own account\n" +
        "  address, which is the same limitation the built-in Supabase mailer\n" +
        "  already has. Add one:\n\n" +
        "    RESEND_API_KEY=re_... node scripts/setup-resend.mjs \\\n" +
        "      --domain=your-domain.com --add\n",
    );
    process.exit(0);
  }

  for (const domain of domains) {
    console.log(`  ${domain.name}    ${domain.status}    ${domain.region ?? ""}`);
    const note = statusNote(domain.status);
    if (note) console.log(`    ${note}`);
  }

  console.log(
    "\n  Pass --domain=<name> to see its DNS records, or --domain=<name> --verify\n" +
      "  to have Resend check them now.\n",
  );
  process.exit(0);
}

// ---------------------------------------------------------------------------
// --add: create it, unless it is already there.
// ---------------------------------------------------------------------------
let domain = await findDomain(domainArg);

if (add) {
  if (domain) {
    console.log(`\n  ${domainArg} is already on this account — not creating a second.`);
  } else {
    // open_tracking / click_tracking off deliberately: see the header. Link
    // rewriting and single-use auth tokens are a bad combination.
    domain = await resend("POST", "/domains", {
      name: domainArg,
      region,
      open_tracking: false,
      click_tracking: false,
    });
    console.log(`\n  Created ${domain.name} in ${domain.region ?? region}.`);
    console.log("  Open and click tracking are off, so there are no tracking records to add.");
  }
} else if (!domain) {
  fail(
    `${domainArg} is not on this Resend account.\n\n` +
      "  Add it with:\n" +
      `    RESEND_API_KEY=re_... node scripts/setup-resend.mjs --domain=${domainArg} --add`,
  );
}

// The list endpoint omits `records`, so always read the domain back by id.
domain = await resend("GET", `/domains/${domain.id}`);

heading(`${domain.name} — ${domain.status}`);
const note = statusNote(domain.status);
if (note) console.log(`  ${note}\n`);

printRecords(domain);

// ---------------------------------------------------------------------------
// --verify: trigger a check, then poll.
// ---------------------------------------------------------------------------
if (!verify) {
  if (domain.status !== "verified") {
    console.log(
      "  Once the records are live, ask Resend to check them:\n\n" +
        `    RESEND_API_KEY=re_... node scripts/setup-resend.mjs --domain=${domain.name} --verify\n`,
    );
  }
  process.exit(0);
}

if (domain.status === "verified") {
  console.log("  Already verified — nothing to check.\n");
} else {
  heading("Verifying");

  await resend("POST", `/domains/${domain.id}/verify`);
  console.log("  Asked Resend to check DNS. This resets the status to `pending`.\n");

  let current = domain;
  let settled = false;

  for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt += 1) {
    await sleep(POLL_INTERVAL_MS);
    current = await resend("GET", `/domains/${current.id}`);

    const elapsed = Math.round((attempt * POLL_INTERVAL_MS) / 1000);
    console.log(`  ${String(elapsed).padStart(3)}s  ${current.status}`);

    if (current.status !== "pending") {
      settled = true;
      break;
    }
  }

  console.log("");

  if (!settled) {
    console.log(
      "  Still pending after a couple of minutes, which is normal — DNS changes\n" +
        "  are not instant and Resend keeps checking for 72 hours. Nothing is\n" +
        "  wrong yet. Run the same command again in a while.\n",
    );
  }

  // Per-record status is the useful part of a failure: one record showing
  // `not_started` while the rest are verified points straight at the typo.
  const stragglers = (current.records ?? []).filter((record) => record.status !== "verified");

  if (stragglers.length && current.status !== "verified") {
    console.log("  Records not yet verified:\n");
    for (const record of stragglers) {
      console.log(
        `    ${record.record ?? record.type}  ${relativeName(record.name, current.name)}  [${record.status}]`,
      );
    }
    console.log("");
  }

  domain = current;
}

// ---------------------------------------------------------------------------
// Verified: say exactly what to run next.
// ---------------------------------------------------------------------------
if (domain.status === "verified" || domain.status === "partially_verified") {
  heading("Next");
  console.log(
    `  ${domain.name} can send. Point Supabase auth at it — pick any address on\n` +
      "  the domain as the sender; it does not need a mailbox behind it, though a\n" +
      "  real one is kinder if anyone replies.\n\n" +
      "    SUPABASE_ACCESS_TOKEN=sbp_... SMTP_HOST=smtp.resend.com SMTP_PORT=465 \\\n" +
      `    SMTP_USER=resend SMTP_PASS=re_... SMTP_SENDER=no-reply@${domain.name} \\\n` +
      "    node scripts/configure-auth.mjs --apply --smtp\n\n" +
      "  That also adds this app's redirect URLs to the allow-list, without which\n" +
      "  the emailed links land on the Site URL instead of the reset screen.\n",
  );
}
