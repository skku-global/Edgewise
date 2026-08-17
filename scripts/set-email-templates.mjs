/**
 * Branded auth email templates, applied through the Management API.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS
 * ---------------------------------------------------------------------------
 * A user received the confirmation email and reported that it contained no link.
 * It did. Supabase's default template is this, in full:
 *
 *     <h2>Confirm your email address</h2>
 *     <p>Follow the link below to confirm this email address and finish signing up.</p>
 *     <p><a href="...verify?token=...">Confirm email address</a></p>
 *
 * Three lines of unstyled text in which the only clickable thing is the phrase
 * "Confirm email address" -- nearly word for word the heading directly above it
 * and the subject line. Nothing looks like a button, so it reads as a repeated
 * label. The mail was delivered, the link worked, and the sign-up still died
 * there.
 *
 * So the templates are replaced with ones where the link cannot be missed:
 *
 *   1. A real button -- a table cell with a background colour, which is the only
 *      button construction that survives Outlook. `<a>` padding alone collapses
 *      there.
 *   2. **The full URL printed underneath as visible, selectable text.** This is
 *      the actual lesson from the bug: never let the only route through an email
 *      depend on the recipient recognising something as clickable. If the button
 *      does not render, is stripped, or simply is not noticed, the URL is right
 *      there to copy.
 *   3. The expiry stated in words, read from the project's own `mailer_otp_exp`
 *      rather than assumed, because "why did the link say it expired" is the next
 *      question after this one.
 *
 * Constraints these templates obey, all of them things that break email:
 *   - Inline styles only. Gmail drops <style> blocks in several contexts.
 *   - Tables for layout. No flexbox, no grid, no positioning.
 *   - No images, including for the wordmark. Remote images are blocked by default
 *     in most clients, and a broken logo makes an auth email look like phishing
 *     precisely when the recipient should trust it.
 *   - `<meta name="color-scheme">` so Gmail's dark mode does not invert the
 *     button into an unreadable fill.
 *
 * Colours come from src/constants/theme.ts and nowhere else: the palette is
 * locked, and an email is still the product.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   node scripts/set-email-templates.mjs --preview
 *       Write the rendered templates to .preview-emails/ and stop. Opens in a
 *       browser. Sends nothing, changes nothing, needs no token.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/set-email-templates.mjs --apply
 *       Apply all five to the project.
 *
 *   ... --apply --only=confirmation,recovery
 *       Apply a subset.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/set-email-templates.mjs --reset
 *       Hand every template back to Supabase's default.
 *
 * Nothing is written without --apply or --reset.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const MANAGEMENT_API = "https://api.supabase.com";
const PREVIEW_DIR = ".preview-emails";

/**
 * From src/constants/theme.ts. Duplicated rather than imported because that file
 * is TypeScript inside the app bundle and this is a plain Node script -- but the
 * values must not drift, so they are named after their tokens.
 */
const COLOR = {
  charcoal: "#14251C", // Brand.charcoal — headings, body text
  green: "#1F7A4C", // Brand.green — the button fill
  white: "#FFFFFF",
  textSecondary: "#57685E", // lightColors.textSecondary
  textTertiary: "#7F8B84", // lightColors.textTertiary
  border: "#E6EEE9", // lightColors.border
  bgSunken: "#F5F9F7", // lightColors.bgSunken — the page behind the card
  accentSoft: "#E8F4EE", // lightColors.accentSoft — the URL fallback panel
};

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
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const prefixed = args.find((arg) => arg.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : null;
};

const apply = has("--apply");
const reset = has("--reset");
const preview = has("--preview");
const only = (valueOf("--only") ?? "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}

if (apply && reset) {
  fail("--apply and --reset are opposites. Pick one.");
}

const supabaseUrl = (env.EXPO_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
const accessToken = (env.SUPABASE_ACCESS_TOKEN ?? "").trim();

if (!supabaseUrl) {
  fail("EXPO_PUBLIC_SUPABASE_URL is not set. Copy .env.example to .env and fill it in.");
}

const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

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

/** 3600 -> "1 hour". Stated in the email so an expired link is self-explaining. */
function humanDuration(seconds) {
  const value = Number(seconds);
  if (!Number.isFinite(value) || value <= 0) return "a short while";
  if (value < 120) return `${Math.round(value)} seconds`;
  if (value < 3600) return `${Math.round(value / 60)} minutes`;

  const hours = value / 3600;
  const rounded = Math.round(hours * 10) / 10;
  return rounded === 1 ? "1 hour" : `${rounded} hours`;
}

/**
 * Builds one email.
 *
 * `heading`/`body` are the human copy. `action` is the button label. `note` is an
 * optional line under the URL panel -- used for "if you did not ask for this",
 * which belongs on password recovery and nowhere else.
 */
function template({ heading, body, action, note }) {
  // The Go template variable, left for Supabase to substitute. It appears three
  // times: the button href, the visible URL text, and that text's own href.
  const url = "{{ .ConfirmationURL }}";

  const font =
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- light only: Gmail's dark mode otherwise recolours the button fill and the
     text on it independently, which can land on unreadable. -->
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${heading}</title>
</head>
<body style="margin:0; padding:0; background-color:${COLOR.bgSunken}; -webkit-font-smoothing:antialiased;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${COLOR.bgSunken};">
<tr>
<td align="center" style="padding:32px 16px;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px; margin:0 auto;">

    <!-- Wordmark. Text, not an image: a blocked logo makes an auth mail look forged. -->
    <tr>
      <td align="center" style="padding:0 0 24px 0; font-family:${font}; font-size:15px; font-weight:700; letter-spacing:1.5px; text-transform:uppercase; color:${COLOR.charcoal};">
        Edgewise
      </td>
    </tr>

    <tr>
      <td style="background-color:${COLOR.white}; border:1px solid ${COLOR.border}; border-radius:14px; padding:36px 32px;">

        <h1 style="margin:0 0 12px 0; font-family:${font}; font-size:22px; line-height:30px; font-weight:700; color:${COLOR.charcoal};">
          ${heading}
        </h1>

        <p style="margin:0 0 28px 0; font-family:${font}; font-size:15px; line-height:24px; color:${COLOR.textSecondary};">
          ${body}
        </p>

        <!-- The button. A background-coloured <td> rather than a padded <a>,
             because Outlook ignores padding on inline elements and would render
             the label as bare text -- the very failure this replaces. -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td align="center" bgcolor="${COLOR.green}" style="border-radius:10px;">
              <a href="${url}" style="display:inline-block; padding:14px 28px; font-family:${font}; font-size:15px; font-weight:600; line-height:20px; color:${COLOR.white}; text-decoration:none; border-radius:10px;">
                ${action}
              </a>
            </td>
          </tr>
        </table>

        <!-- The URL in full, as text.
             The whole reason this template exists: the previous one offered a
             single hyperlink whose wording read like a heading, and a real
             recipient concluded the email had no link in it. A visible address
             cannot be mistaken for a label, and still works when the button is
             stripped, unstyled, or simply overlooked. -->
        <p style="margin:28px 0 8px 0; font-family:${font}; font-size:13px; line-height:20px; color:${COLOR.textSecondary};">
          Or copy and paste this address into your browser:
        </p>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="background-color:${COLOR.accentSoft}; border-radius:8px; padding:12px 14px;">
              <a href="${url}" style="font-family:${font}; font-size:12px; line-height:18px; color:${COLOR.green}; text-decoration:underline; word-break:break-all;">${url}</a>
            </td>
          </tr>
        </table>

        <p style="margin:24px 0 0 0; font-family:${font}; font-size:13px; line-height:20px; color:${COLOR.textTertiary};">
          This link expires in ${humanDuration(env.__OTP_EXP)} and can be used once.${note ? ` ${note}` : ""}
        </p>

      </td>
    </tr>

    <tr>
      <td align="center" style="padding:24px 8px 0 8px; font-family:${font}; font-size:12px; line-height:18px; color:${COLOR.textTertiary};">
        Edgewise &mdash; your trading journal
      </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>`;
}

/**
 * The five emails Supabase sends that carry a link. The notification templates
 * (password changed, email changed, MFA enrolled) carry none, so the defaults are
 * fine and are left alone.
 */
const TEMPLATES = {
  confirmation: {
    subjectField: "mailer_subjects_confirmation",
    contentField: "mailer_templates_confirmation_content",
    subject: "Confirm your email address",
    heading: "Confirm your email address",
    body: "Tap the button below to confirm this address and finish setting up your Edgewise account.",
    action: "Confirm my email address",
  },
  recovery: {
    subjectField: "mailer_subjects_recovery",
    contentField: "mailer_templates_recovery_content",
    subject: "Reset your password",
    heading: "Reset your password",
    body: "We received a request to reset your Edgewise password. Tap the button below to choose a new one.",
    action: "Choose a new password",
    // Entity-encoded rather than literal, here and in the footer: this HTML is
    // handed to Supabase, which sends it, and there is no way from here to
    // guarantee the charset header it puts on the message. `&mdash;` cannot be
    // mangled; a raw em dash arrives as a replacement character if anything in
    // that chain disagrees about encoding.
    note: "If you did not request this, ignore this email &mdash; your password will not change.",
  },
  magic_link: {
    subjectField: "mailer_subjects_magic_link",
    contentField: "mailer_templates_magic_link_content",
    subject: "Your sign-in link",
    heading: "Sign in to Edgewise",
    body: "Tap the button below to sign in. No password needed.",
    action: "Sign in to Edgewise",
  },
  email_change: {
    subjectField: "mailer_subjects_email_change",
    contentField: "mailer_templates_email_change_content",
    subject: "Confirm your new email address",
    heading: "Confirm your new email address",
    // Secure email change is on for this project, so this goes to both the old
    // and the new address and each must be confirmed. Naming the new address
    // makes it obvious which mailbox is being read.
    body: "Tap the button below to confirm <strong style=\"color:#14251C;\">{{ .NewEmail }}</strong> as the email address for your Edgewise account.",
    action: "Confirm this address",
  },
  invite: {
    subjectField: "mailer_subjects_invite",
    contentField: "mailer_templates_invite_content",
    subject: "You've been invited to Edgewise",
    heading: "You've been invited",
    body: "You've been invited to create an Edgewise account. Tap the button below to accept and set a password.",
    action: "Accept the invitation",
  },
};

const names = only.length ? only : Object.keys(TEMPLATES);

for (const name of names) {
  if (!TEMPLATES[name]) {
    fail(`Unknown template "${name}". Choose from: ${Object.keys(TEMPLATES).join(", ")}`);
  }
}

console.log(`\nEdgewise auth email templates — project ${projectRef}`);

/**
 * The expiry printed in the copy is read from the project, not hardcoded, so the
 * sentence cannot quietly become a lie after someone changes the setting.
 */
if (accessToken) {
  const config = await management("GET", `/v1/projects/${projectRef}/config/auth`);
  env.__OTP_EXP = config.mailer_otp_exp;
  console.log(`  link lifetime  ${humanDuration(config.mailer_otp_exp)} (mailer_otp_exp)`);
} else {
  env.__OTP_EXP = 3600;
  console.log("  link lifetime  assuming 1 hour (no token, so the project was not read)");
}

const built = names.map((name) => ({
  name,
  ...TEMPLATES[name],
  html: template(TEMPLATES[name]),
}));

if (preview) {
  mkdirSync(PREVIEW_DIR, { recursive: true });

  console.log(`\nPreviews written to ${PREVIEW_DIR}/`);

  for (const item of built) {
    const path = `${PREVIEW_DIR}/${item.name}.html`;

    // Substituted only in the preview, so the button and the URL panel are both
    // clickable-looking and reviewable. The applied template keeps the variable.
    const rendered = item.html
      .replace(/\{\{ \.ConfirmationURL \}\}/g, `${supabaseUrl}/auth/v1/verify?token=EXAMPLE&type=${item.name}&redirect_to=http://localhost:8081/`)
      .replace(/\{\{ \.NewEmail \}\}/g, "new-address@example.com");

    writeFileSync(path, rendered, "utf8");
    console.log(`  ${path}`);
  }

  console.log("\n  Open them in a browser. Nothing was sent and nothing changed.\n");
  process.exit(0);
}

if (!apply && !reset) {
  console.log(`\n  ${built.length} template(s) ready: ${names.join(", ")}`);
  console.log("\n  --preview  write them to disk and look at them first");
  console.log("  --apply    write them to the project");
  console.log("  --reset    hand them back to Supabase's defaults\n");
  process.exit(0);
}

if (!accessToken) {
  fail(
    "SUPABASE_ACCESS_TOKEN is not set.\n" +
      "  Get one at https://supabase.com/dashboard/account/tokens",
  );
}

const patch = {};

if (reset) {
  // Empty string is how the API is told to fall back to the built-in default;
  // null is rejected.
  for (const item of built) {
    patch[item.contentField] = "";
    patch[item.subjectField] = "";
  }
  console.log(`\nResetting ${built.length} template(s) to the Supabase default`);
} else {
  for (const item of built) {
    patch[item.contentField] = item.html;
    patch[item.subjectField] = item.subject;
    console.log(`  ${item.name.padEnd(14)} "${item.subject}" — button "${item.action}"`);
  }
}

await management("PATCH", `/v1/projects/${projectRef}/config/auth`, patch);

/**
 * Same eventual consistency as every other field on this endpoint: a GET straight
 * after the PATCH can return the old value. Poll, and say so plainly if it never
 * settles rather than printing a stale read as though it were current.
 */
let settled = false;

for (let attempt = 1; attempt <= 6; attempt += 1) {
  const current = await management("GET", `/v1/projects/${projectRef}/config/auth`);

  settled = built.every((item) =>
    reset
      ? !String(current[item.contentField] ?? "").includes("Edgewise")
      : String(current[item.contentField] ?? "").includes("Or copy and paste this address"),
  );

  if (settled) break;
  if (attempt < 6) await new Promise((resolve) => setTimeout(resolve, 1_500));
}

if (!settled) {
  console.log(
    "\n  Applied, but the read-back does not show it yet. This endpoint is\n" +
      "  eventually consistent, so it is very likely fine — re-run with no flags\n" +
      "  in a moment to confirm before assuming otherwise.\n",
  );
  process.exit(0);
}

console.log(
  reset
    ? "\n  Done. Supabase's own templates are in use again.\n"
    : "\n  Done, and read back from the project.\n\n" +
        "  Sign up with an address you can open. The email now leads with a green\n" +
        "  button and repeats the full URL underneath as text, so there is no way\n" +
        "  to receive it and find nothing to click.\n\n" +
        "  Note the rate limit while testing: one email per 60 seconds to any\n" +
        "  single address, 30 an hour overall. A refusal inside that window looks\n" +
        "  exactly like no email at all.\n",
);
