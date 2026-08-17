/**
 * SMTP pre-flight: prove the credentials work before Supabase depends on them.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT EXISTS
 * ---------------------------------------------------------------------------
 * Supabase reports nothing useful when its SMTP settings are wrong. A bad
 * password, a sender on an unverified domain, a blocked port — all of them look
 * identical from inside the app: sign up, no email, no error. This project has
 * already lost a long stretch to exactly that class of failure.
 *
 * So: talk to the mail server directly, over the same port and with the same
 * credentials Supabase is about to be given, and print the entire conversation.
 * If a message lands, the SMTP half is proven and any later failure is Supabase's
 * configuration rather than the provider. If it does not, the server says why in
 * its own words, on the line where it happened.
 *
 * Worth testing separately from the provider's HTTP API: the API can work
 * perfectly while SMTP is unusable, because a network that permits 443 may still
 * block 465. That is a common ISP and corporate-firewall default.
 *
 * ---------------------------------------------------------------------------
 * USAGE
 * ---------------------------------------------------------------------------
 *   SMTP_HOST=smtp.resend.com SMTP_USER=resend SMTP_PASS=re_... \
 *   SMTP_SENDER=no-reply@example.com \
 *   node scripts/smtp-check.mjs --to=you@example.com
 *
 *   --port=587    Use STARTTLS on 587 instead of implicit TLS on 465. Try this
 *                 if 465 times out; a timeout there is a blocked port, not a
 *                 credential problem.
 *   --quiet       Only report the outcome, not the whole exchange.
 *
 * With no --to, it sends to `delivered@resend.dev`, which is Resend's delivery
 * simulator: it proves the server accepted the message but reaches no inbox. Use
 * a real address to prove the whole path.
 *
 * Nothing here is read by the app, and the password is masked in all output.
 */

import { connect as tlsConnect } from "node:tls";
import { connect as netConnect } from "node:net";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

/** Long enough for a slow TLS handshake, short enough to notice a dead port. */
const TIMEOUT_MS = 20_000;

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

function mask(value) {
  if (!value) return "(not set)";
  const text = String(value);
  return text.length <= 6 ? "*".repeat(text.length) : `${text.slice(0, 3)}…${text.slice(-2)}`;
}

const env = { ...parseEnvFile(".env"), ...process.env };

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const prefixed = args.find((arg) => arg.startsWith(`${flag}=`));
  return prefixed ? prefixed.slice(flag.length + 1) : null;
};

const host = (env.SMTP_HOST ?? "").trim();
const user = (env.SMTP_USER ?? "").trim();
const pass = env.SMTP_PASS ?? "";
const sender = (env.SMTP_SENDER ?? "").trim();
const senderName = env.SMTP_SENDER_NAME ?? "Edgewise";

const port = Number(valueOf("--port") ?? env.SMTP_PORT ?? 465);
const recipient = (valueOf("--to") ?? "delivered@resend.dev").trim();
const quiet = has("--quiet");

if (!host || !user || !pass || !sender) {
  fail(
    "Needs SMTP_HOST, SMTP_USER, SMTP_PASS and SMTP_SENDER.\n\n" +
      "    SMTP_HOST=smtp.resend.com SMTP_USER=resend SMTP_PASS=re_... \\\n" +
      "    SMTP_SENDER=no-reply@your-domain \\\n" +
      "    node scripts/smtp-check.mjs --to=you@your-domain",
  );
}

if (!Number.isInteger(port) || port <= 0) {
  fail(`--port must be a port number. Got ${JSON.stringify(valueOf("--port"))}.`);
}

/**
 * Port 465 is implicit TLS: the socket is encrypted from the first byte. 587 and
 * 25 start in the clear and are upgraded with STARTTLS. Getting this backwards
 * hangs rather than erroring, because each side is waiting for the other to
 * speak a protocol it is not speaking.
 */
const implicitTls = port === 465 || port === 2465;

function log(direction, text) {
  if (quiet) return;
  for (const line of text.split(/\r?\n/).filter(Boolean)) {
    console.log(`  ${direction} ${line}`);
  }
}

/**
 * Reads SMTP replies off a socket. A reply can span several lines and arrive in
 * any number of chunks; it is finished when a line begins with three digits
 * followed by a space (a hyphen there means more lines follow).
 */
function makeReader(socket) {
  let buffer = "";
  let waiter = null;
  let failure = null;

  const settle = () => {
    if (!waiter) return;

    if (failure) {
      const { reject, timer } = waiter;
      clearTimeout(timer);
      waiter = null;
      reject(failure);
      return;
    }

    const lines = buffer.split(/\r?\n/).filter(Boolean);
    if (lines.length === 0) return;
    if (!/^\d{3} /.test(lines[lines.length - 1])) return;

    const { resolve, timer } = waiter;
    clearTimeout(timer);
    waiter = null;
    buffer = "";
    resolve(lines);
  };

  socket.on("data", (chunk) => {
    buffer += chunk.toString("utf8");
    settle();
  });

  socket.on("error", (error) => {
    failure = error;
    settle();
  });

  socket.on("close", () => {
    if (!failure) failure = new Error("the server closed the connection");
    settle();
  });

  return function read() {
    return new Promise((resolve, reject) => {
      waiter = {
        resolve,
        reject,
        timer: setTimeout(() => {
          waiter = null;
          reject(new Error(`no reply within ${TIMEOUT_MS / 1000}s`));
        }, TIMEOUT_MS),
      };
      settle();
    });
  };
}

function openSocket() {
  return new Promise((resolve, reject) => {
    const socket = implicitTls
      ? tlsConnect({ host, port, servername: host })
      : netConnect({ host, port });

    const timer = setTimeout(() => {
      socket.destroy();
      reject(
        new Error(
          `could not reach ${host}:${port} within ${TIMEOUT_MS / 1000}s.\n` +
            "  A timeout at this stage is the port being blocked, not a bad\n" +
            "  password — many ISPs and office networks drop outbound 465. Try\n" +
            "  --port=587, which uses STARTTLS and is blocked less often.",
        ),
      );
    }, TIMEOUT_MS);

    socket.once(implicitTls ? "secureConnect" : "connect", () => {
      clearTimeout(timer);
      resolve(socket);
    });

    socket.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

function upgrade(socket) {
  return new Promise((resolve, reject) => {
    const secure = tlsConnect({ socket, servername: host }, () => resolve(secure));
    secure.once("error", reject);
  });
}

function send(socket, text) {
  log("→", text);
  socket.write(`${text}\r\n`);
}

/** Throws with the server's own words, which are more precise than any summary. */
function expect(lines, codes, what) {
  log("←", lines.join("\n"));

  const code = Number(lines[lines.length - 1].slice(0, 3));
  if (codes.includes(code)) return code;

  throw new Error(`${what} was refused.\n  The server said: ${lines.join(" / ")}`);
}

const b64 = (text) => Buffer.from(text, "utf8").toString("base64");

function buildMessage() {
  const date = new Date().toUTCString().replace("GMT", "+0000");
  const id = randomUUID();

  const body =
    "This is a pre-flight check from scripts/smtp-check.mjs.\r\n" +
    "\r\n" +
    "If you are reading it in a real inbox, Edgewise's mail path works end to\r\n" +
    "end: credentials, sender domain, port and TLS. Nothing else to do.\r\n";

  return [
    `From: ${senderName} <${sender}>`,
    `To: ${recipient}`,
    `Subject: Edgewise SMTP pre-flight`,
    `Date: ${date}`,
    `Message-ID: <${id}@${sender.split("@")[1]}>`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="utf-8"',
    "",
    body,
  ]
    .join("\r\n")
    // Dot-stuffing: a line that is just "." would end the DATA block early.
    .replace(/\r\n\./g, "\r\n..");
}

console.log(`\nSMTP pre-flight — ${host}:${port} (${implicitTls ? "implicit TLS" : "STARTTLS"})`);
console.log(`  user      ${user}`);
console.log(`  password  ${mask(pass)}`);
console.log(`  from      ${senderName} <${sender}>`);
console.log(`  to        ${recipient}`);
console.log("");

let socket;

try {
  socket = await openSocket();

  let read = makeReader(socket);

  expect(await read(), [220], "The greeting");

  send(socket, "EHLO edgewise.local");
  expect(await read(), [250], "EHLO");

  if (!implicitTls) {
    send(socket, "STARTTLS");
    expect(await read(), [220], "STARTTLS");

    socket = await upgrade(socket);
    read = makeReader(socket);

    // The upgraded connection starts a fresh session, so EHLO again.
    send(socket, "EHLO edgewise.local");
    expect(await read(), [250], "EHLO after STARTTLS");
  }

  send(socket, "AUTH LOGIN");
  expect(await read(), [334], "AUTH LOGIN");

  send(socket, b64(user));
  expect(await read(), [334], "The username");

  // Never logged, unlike every other line in this exchange.
  if (!quiet) console.log("  → (password, base64)");
  socket.write(`${b64(pass)}\r\n`);
  expect(await read(), [235, 200], "Authentication");

  send(socket, `MAIL FROM:<${sender}>`);
  expect(await read(), [250], `MAIL FROM:<${sender}>`);

  send(socket, `RCPT TO:<${recipient}>`);
  expect(await read(), [250, 251], `RCPT TO:<${recipient}>`);

  send(socket, "DATA");
  expect(await read(), [354], "DATA");

  if (!quiet) console.log("  → (message headers and body)");
  socket.write(`${buildMessage()}\r\n.\r\n`);
  expect(await read(), [250], "The message");

  send(socket, "QUIT");
  // The server may close before replying to QUIT, which is not a failure.
  await read().catch(() => {});

  socket.destroy();

  console.log(`\n  Accepted. ${host} took the message from ${sender}.`);

  if (recipient.endsWith("@resend.dev")) {
    console.log(
      "\n  That was a simulator address, so it reached no inbox — it proves the\n" +
        "  credentials, sender and transport, which is what Supabase needs. To\n" +
        "  prove the whole path, run it again with --to=<your real address>.\n",
    );
  } else {
    console.log(
      `\n  Check ${recipient}. If it arrives, every part of the mail path works and\n` +
        "  any remaining failure is Supabase's configuration rather than the\n" +
        "  provider. If it does not arrive within a few minutes, look at the\n" +
        "  provider's own delivery log before changing anything here.\n",
    );
  }
} catch (error) {
  socket?.destroy();

  const message = error?.message ?? String(error);

  console.error(`\n  FAILED: ${message}\n`);

  // The three failures worth naming, because each has a specific cause that is
  // not obvious from the server's reply on its own.
  if (/Authentication/i.test(message)) {
    console.error(
      "  With Resend the username is the literal word `resend` for every account,\n" +
        "  and the password is the API key itself — not your dashboard password.\n" +
        "  Confirm the key still exists at https://resend.com/api-keys.\n",
    );
  } else if (/MAIL FROM|RCPT TO/i.test(message)) {
    console.error(
      "  Usually the sender's domain is not verified with the provider. Resend\n" +
        "  also refuses any recipient other than your own account address while\n" +
        "  the from-address is on `resend.dev`.\n" +
        "  Check with: node scripts/setup-resend.mjs\n",
    );
  } else if (/ECONNREFUSED|ETIMEDOUT|no reply|closed the connection/i.test(message)) {
    console.error(
      `  Nothing wrong with the credentials — ${host}:${port} did not complete a\n` +
        "  conversation. If you used 465, try --port=587; if 587, try --port=2587.\n" +
        "  Resend accepts 25, 465, 587, 2465 and 2587.\n",
    );
  }

  process.exit(1);
}
