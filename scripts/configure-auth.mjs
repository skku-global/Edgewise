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
      "      c) --apply --smtp with a real provider, for delivery to anyone",
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

if (configureSmtp) {
  const host = (env.SMTP_HOST ?? "").trim();
  const port = (env.SMTP_PORT ?? "587").trim();
  const user = (env.SMTP_USER ?? "").trim();
  const pass = env.SMTP_PASS ?? "";
  const sender = (env.SMTP_SENDER ?? "").trim();

  if (!host || !user || !pass || !sender) {
    fail(
      "--smtp needs SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_SENDER.\n" +
        "  SMTP_SENDER is the from-address, and with most providers it has to be\n" +
        "  on a domain you have verified with them.\n\n" +
        "  Resend, for example:\n" +
        "    SMTP_HOST=smtp.resend.com SMTP_PORT=587 SMTP_USER=resend \\\n" +
        "    SMTP_PASS=re_... SMTP_SENDER=you@your-verified-domain \\\n" +
        "    SUPABASE_ACCESS_TOKEN=sbp_... node scripts/configure-auth.mjs --apply --smtp",
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

const after = await management("GET", `/v1/projects/${projectRef}/config/auth`);

heading("Now");
console.log(`  Site URL             ${after.site_url || "(not set)"}`);
console.log(`  Confirm email        ${after.mailer_autoconfirm ? "OFF" : "ON"}`);
console.log(`  Redirect URLs        ${(after.uri_allow_list ?? "").split(",").join("\n                       ")}`);
console.log(`  Custom SMTP host     ${after.smtp_host || "(none)"}`);
console.log(
  "\n  Rate limits for a new SMTP setup start at 30 emails an hour and are\n" +
    "  raised under Authentication -> Rate Limits.\n",
);
