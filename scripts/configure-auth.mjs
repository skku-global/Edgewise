/**
 * Auth configuration: diagnose, and optionally fix.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS
 * ---------------------------------------------------------------------------
 * Three settings on the Supabase side decide whether the auth flows in this app
 * actually work, and all three fail *silently* when they are wrong:
 *
 *   1. Redirect URL allow-list. `emailRedirectTo` and `redirectTo` are only
 *      honoured if they match an entry in it. Anything else is quietly replaced
 *      by the Site URL — so the email arrives, the link works, and the user
 *      lands somewhere that is not this app. Nothing errors.
 *
 *   2. Confirm email. On by default. With it on, signing up returns no session
 *      and no one can sign in until they click a link — which is correct for
 *      production and painful for local development.
 *
 *   3. The mail server. Supabase's built-in one is not a mail server in the
 *      sense anyone expects: it delivers only to addresses belonging to members
 *      of the organisation that owns the project, and refuses everything else
 *      with "Email address not authorized". It is also capped at a couple of
 *      messages an hour. This is the single most common reason a Supabase app
 *      "sends no email" — the send was rejected, not lost.
 *
 * Reading these in the dashboard means four pages. Reading them here means one
 * command, and the fix is applied the same way it is checked.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   node scripts/configure-auth.mjs
 *       Diagnose. Needs no credentials beyond the .env this app already uses —
 *       the public /auth/v1/settings endpoint reports whether confirmation is on
 *       and which providers are enabled.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-auth.mjs
 *       Full diagnosis, including the redirect allow-list and SMTP, which are
 *       only visible through the Management API.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-auth.mjs --apply
 *       Add this app's redirect URLs to the allow-list. Additive: existing
 *       entries are kept.
 *
 *   ... --apply --skip-confirmation      Turn Confirm email OFF (development).
 *   ... --apply --require-confirmation   Turn it back ON (before shipping).
 *   ... --apply --smtp                   Point auth at real SMTP, read from
 *                                        SMTP_HOST / SMTP_PORT / SMTP_USER /
 *                                        SMTP_PASS / SMTP_SENDER.
 *
 * A personal access token comes from https://supabase.com/dashboard/account/tokens
 * It is account-wide and grants everything your dashboard login can do, so pass
 * it on the command line for one run rather than putting it in .env.
 *
 * Nothing is written without --apply.
 */

import { readFileSync } from "node:fs";

const MANAGEMENT_API = "https://api.supabase.com";

/**
 * The redirect targets this app actually uses, as wildcard patterns.
 *
 * `/**` rather than the bare origin because Supabase matches the whole URL: the
 * recovery link goes to `/reset-password`, and an allow-list holding only the
 * origin rejects it. 8081 is Metro's default; 19006 was the old Expo web port
 * and is included because a machine with 8081 already taken will land there.
 */
const REDIRECT_PATTERNS = [
  "http://localhost:8081/**",
  "http://localhost:19006/**",
  "edgewise://**",
];

/** Development default. Overridden by --site-url. */
const DEFAULT_SITE_URL = "http://localhost:8081";

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
    // values only — a '#' inside a password is part of the password.
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
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const prefixed = args.find((a) => a.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : null;
};

const apply = has("--apply");
const skipConfirmation = has("--skip-confirmation");
const requireConfirmation = has("--require-confirmation");
const configureSmtp = has("--smtp");
const siteUrl = valueOf("--site-url") ?? DEFAULT_SITE_URL;

/**
 * The display name recipients see. Separate from --smtp because changing it does
 * not need the credentials, and re-sending a working SMTP password just to
 * correct a label is a needless way to break sending.
 */
const senderName = valueOf("--sender-name");

if (skipConfirmation && requireConfirmation) {
  fail("--skip-confirmation and --require-confirmation are opposites. Pick one.");
}

const supabaseUrl = (env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const anonKey = (env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
const accessToken = (env.SUPABASE_ACCESS_TOKEN ?? "").trim();

if (!supabaseUrl) {
  fail("EXPO_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

/** `https://abcdefgh.supabase.co` -> `abcdefgh`. */
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

function heading(text) {
  console.log(`\n${text}\n${"-".repeat(text.length)}`);
}

function mask(value) {
  if (!value) return "(not set)";
  const text = String(value);
  return text.length <= 6 ? "*".repeat(text.length) : `${text.slice(0, 3)}…${text.slice(-2)}`;
}

async function readPublicSettings() {
  if (!anonKey) {
    return null;
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
    headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` },
  });

  if (!response.ok) {
    console.log(`  could not read /auth/v1/settings (HTTP ${response.status})`);
    return null;
  }

  return response.json();
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
    // 401 here is almost always a token that was revoked or never had the
    // dashboard scopes, and the API's own message says so more precisely than a
    // guess would.
    fail(`Management API ${method} ${path} failed (HTTP ${response.status}).\n  ${text}`);
  }

  return text ? JSON.parse(text) : {};
}

console.log(`\nEdgewise auth configuration — project ${projectRef}`);

heading("Public settings (no credentials needed)");

const settings = await readPublicSettings();

if (settings) {
  const autoconfirm = settings.mailer_autoconfirm === true;

  console.log(`  Confirm email        ${autoconfirm ? "OFF" : "ON"}`);
  console.log(`  Signups              ${settings.disable_signup ? "DISABLED" : "enabled"}`);
  console.log(`  Email provider       ${settings.external?.email ? "enabled" : "disabled"}`);

  if (!autoconfirm) {
    console.log(
      "\n  With Confirm email ON, sign-up returns no session and nobody can\n" +
        "  sign in until they click the emailed link. That is correct for\n" +
        "  production. For local work, --apply --skip-confirmation turns it off.",
    );
  }
} else {
  console.log("  skipped (EXPO_PUBLIC_SUPABASE_ANON_KEY not set)");
}

if (!accessToken) {
  heading("Redirect allow-list and SMTP");
  console.log(
    "  Not readable without a personal access token. Run again as:\n\n" +
      "    SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-auth.mjs\n\n" +
      "  Get one at https://supabase.com/dashboard/account/tokens\n",
  );

  heading("What has to be true for email links to land in this app");
  for (const pattern of REDIRECT_PATTERNS) {
    console.log(`  ${pattern}`);
  }
  console.log(
    "\n  must all be listed under Authentication -> URL Configuration ->\n" +
      "  Redirect URLs. Anything not listed is silently replaced by the Site\n" +
      "  URL, which is why a link can 'work' and still go nowhere useful.\n",
  );

  process.exit(0);
}

heading("Auth config (Management API)");

const config = await management("GET", `/v1/projects/${projectRef}/config/auth`);

const allowList = (config.uri_allow_list ?? "")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

console.log(`  Site URL             ${config.site_url || "(not set)"}`);
console.log(`  Confirm email        ${config.mailer_autoconfirm ? "OFF" : "ON"}`);
console.log(`  Redirect URLs        ${allowList.length ? allowList.join("\n                       ") : "(none)"}`);
console.log(`  Custom SMTP host     ${config.smtp_host || "(none — using the built-in server)"}`);
if (config.smtp_host) {
  console.log(`  SMTP user            ${mask(config.smtp_user)}`);
  console.log(`  SMTP sender          ${config.smtp_admin_email || "(not set)"}`);
}
console.log(`  Email OTP lifetime   ${config.mailer_otp_exp ?? "?"}s`);

const missing = REDIRECT_PATTERNS.filter((pattern) => !allowList.includes(pattern));

heading("Diagnosis");

const problems = [];

if (missing.length) {
  problems.push(
    `Redirect URLs missing: ${missing.join(", ")}\n` +
      `    Until these are listed, confirmation and recovery links redirect to\n` +
      `    the Site URL instead of back into the app.`,
  );
}

if (!config.smtp_host) {
  problems.push(
    "No custom SMTP. The built-in mail server only delivers to addresses\n" +
      "    belonging to members of this project's organisation — every other\n" +
      "    address is refused with 'Email address not authorized', and the cap\n" +
      "    is roughly two messages an hour.\n" +
      "    Fix it one of three ways:\n" +
      "      a) sign up using the email on your own Supabase account (works now)\n" +
      "      b) --apply --skip-confirmation, so sign-up needs no email at all\n" +
      "      c) --apply --smtp with a real provider, for delivery to anyone.\n" +
      "         Resend is the shortest: free, no approval step, 100/day, and its\n" +
      "         Supabase guide gives smtp.resend.com:465, user `resend`, password\n" +
      "         = the API key. It does require a domain you can add DNS records\n" +
      "         to; onboarding@resend.dev is test-only and will not substitute.",
  );
}

if (problems.length === 0) {
  console.log("  Nothing to fix. Redirects are allow-listed and SMTP is configured.");
} else {
  problems.forEach((problem, index) => console.log(`  ${index + 1}. ${problem}\n`));
}

if (!apply) {
  console.log("Run again with --apply to fix the redirect allow-list.\n");
  process.exit(0);
}

heading("Applying");

const patch = {};

if (missing.length) {
  patch.uri_allow_list = [...allowList, ...missing].join(",");
  console.log(`  redirect URLs   + ${missing.join(", ")}`);
}

if (!config.site_url || config.site_url !== siteUrl) {
  patch.site_url = siteUrl;
  console.log(`  site URL        ${config.site_url || "(not set)"} -> ${siteUrl}`);
}

if (skipConfirmation && !config.mailer_autoconfirm) {
  patch.mailer_autoconfirm = true;
  console.log("  confirm email   ON -> OFF");
}

if (requireConfirmation && config.mailer_autoconfirm) {
  patch.mailer_autoconfirm = false;
  console.log("  confirm email   OFF -> ON");
}

if (senderName && config.smtp_sender_name !== senderName) {
  patch.smtp_sender_name = senderName;
  console.log(`  sender name     ${config.smtp_sender_name || "(not set)"} -> ${senderName}`);
}

if (configureSmtp) {
  const host = (env.SMTP_HOST ?? "").trim();
  const port = (env.SMTP_PORT ?? "465").trim();
  const user = (env.SMTP_USER ?? "").trim();
  const pass = env.SMTP_PASS ?? "";
  const sender = (env.SMTP_SENDER ?? "").trim();

  if (!host || !user || !pass || !sender) {
    fail(
      "--smtp needs SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_SENDER.\n" +
        "  SMTP_SENDER is the from-address, and with most providers it has to be\n" +
        "  on a domain you have verified with them.\n\n" +
        "  Resend, whose own Supabase guide specifies port 465:\n" +
        "    SMTP_HOST=smtp.resend.com SMTP_PORT=465 SMTP_USER=resend \\\n" +
        "    SMTP_PASS=re_... SMTP_SENDER=no-reply@your-verified-domain \\\n" +
        "    SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-auth.mjs --apply --smtp",
    );
  }

  // Worth stopping for. `onboarding@resend.dev` looks like a way to skip domain
  // verification, and it is not: Resend accepts it only when the recipient is
  // your own account address and 403s every other one. Applied here it would
  // trade one silent-refusal problem for an identical one.
  if (/@resend\.dev$/i.test(sender)) {
    fail(
      `SMTP_SENDER is ${sender}, which cannot send to anyone but your own Resend\n` +
        "  account address — every other recipient comes back 403. That is the same\n" +
        "  failure the built-in Supabase mailer already has.\n\n" +
        "  Add a domain at https://resend.com/domains, verify it, then use an\n" +
        "  address on it (no-reply@your-domain). Nothing was changed.",
    );
  }

  patch.smtp_host = host;
  patch.smtp_port = port;
  patch.smtp_user = user;
  patch.smtp_pass = pass;
  patch.smtp_admin_email = sender;
  patch.smtp_sender_name = env.SMTP_SENDER_NAME ?? "Edgewise";

  console.log(`  SMTP            ${host}:${port} as ${mask(user)}, from ${sender}`);
}

if (Object.keys(patch).length === 0) {
  console.log("  nothing to change.\n");
  process.exit(0);
}

await management("PATCH", `/v1/projects/${projectRef}/config/auth`, patch);

/**
 * The config endpoint is eventually consistent: a GET issued immediately after a
 * successful PATCH regularly returns the *old* values. Reading once and printing
 * it is worse than not printing it at all, because unchanged output next to
 * "Applying" reads as a silently failed write — which is exactly the class of
 * problem this script exists to eliminate.
 *
 * So poll until the values we sent come back, and if they never do, say that
 * plainly rather than showing a stale snapshot as if it were current.
 */
async function readBackUntilApplied() {
  const expected = Object.entries(patch).filter(([key]) => key !== "smtp_pass");

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const current = await management("GET", `/v1/projects/${projectRef}/config/auth`);
    const settled = expected.every(([key, value]) => String(current[key]) === String(value));

    if (settled || attempt === 6) {
      return { config: current, settled };
    }

    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }

  // Unreachable: the loop returns on its final attempt.
  return { config: {}, settled: false };
}

const { config: after, settled } = await readBackUntilApplied();

heading("Now");
console.log(`  Site URL             ${after.site_url || "(not set)"}`);
console.log(`  Confirm email        ${after.mailer_autoconfirm ? "OFF" : "ON"}`);
console.log(`  Redirect URLs        ${(after.uri_allow_list ?? "").split(",").join("\n                       ")}`);
console.log(`  Custom SMTP host     ${after.smtp_host || "(none)"}`);
if (after.smtp_host) {
  console.log(`  SMTP sender          ${after.smtp_admin_email || "(not set)"} as "${after.smtp_sender_name ?? ""}"`);
}

if (!settled) {
  console.log(
    "\n  The values above do not yet match what was just sent. This endpoint is\n" +
      "  eventually consistent, so it is very likely already applied and simply\n" +
      "  not visible yet — run this script again with no flags to confirm before\n" +
      "  assuming anything went wrong.",
  );
}

console.log(
  `\n  Sending is capped at ${after.rate_limit_email_sent ?? "?"} emails an hour, and at one per\n` +
    `  ${after.smtp_max_frequency ?? "?"} seconds to any single address — a second attempt inside that\n` +
    "  window is refused, which looks identical to no email at all. Both are\n" +
    "  under Authentication -> Rate Limits.\n",
);
