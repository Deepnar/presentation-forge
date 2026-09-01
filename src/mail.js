import { connect } from "node:net";
import { connect as tlsConnect } from "node:tls";

/**
 * A minimal SMTP client — pulling nodemailer in for a handful of messages is
 * the kind of dependency the local-first project is built against. Node's
 * net/tls only; no framework.
 *
 * It began as "send an email on sweep day", to one address the operator set in
 * env. Password reset and address verification made the recipient a per-message
 * argument: FORGE_SMTP_TO is now only the sweep's destination, and `to` is what
 * every transactional message carries.
 *
 * Env config (all optional — with none set the helper is a silent no-op):
 *   FORGE_SMTP_HOST, FORGE_SMTP_PORT (default 587), FORGE_SMTP_USER,
 *   FORGE_SMTP_PASS, FORGE_SMTP_FROM, FORGE_SMTP_TO,
 *   FORGE_SMTP_SECURE=1  (implicit TLS on connect, port 465 style)
 *   FORGE_PUBLIC_URL     where the app answers, for the links in the messages
 *
 * On a plain connection the client upgrades via STARTTLS when the server
 * advertises it (the standard submission-port handshake, 587); servers that do
 * not offer STARTTLS still work over the plain socket. One recipient, one text
 * message — that is the entire job.
 */

const cfg = () => ({
  host: process.env.FORGE_SMTP_HOST ?? "",
  port: Number(process.env.FORGE_SMTP_PORT ?? 587),
  user: process.env.FORGE_SMTP_USER ?? "",
  pass: process.env.FORGE_SMTP_PASS ?? "",
  from: process.env.FORGE_SMTP_FROM ?? "",
  to: process.env.FORGE_SMTP_TO ?? "",
  secure: process.env.FORGE_SMTP_SECURE === "1",
});

/**
 * Whether outbound mail can be sent at all. Deliberately says nothing about
 * FORGE_SMTP_TO: that address is the sweep's destination, and a box that can
 * reach an SMTP server can send a reset to whoever asked for one.
 *
 * This predicate is load-bearing beyond mail. Address verification is only
 * enforced where a verification message can actually be delivered — an install
 * with no SMTP verifies accounts on creation, because the alternative is a box
 * that locks out every account it creates and offers no way back.
 */
export function mailConfigured() {
  const c = cfg();
  return Boolean(c.host && c.from && c.user && c.pass);
}

/** The sweep's fixed recipient, which is a separate question from whether mail
 *  works at all. */
export function sweepMailConfigured() {
  return mailConfigured() && Boolean(cfg().to);
}

/**
 * Where this install answers, for the links inside a message. A reset link that
 * points at localhost is useless in an inbox, so the operator sets
 * FORGE_PUBLIC_URL; the CORS allow-list is the next best guess, since it is
 * already the browser origin the API expects to be called from.
 */
export function linkBase() {
  const explicit = (process.env.FORGE_PUBLIC_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const origin = (process.env.FORGE_UI_ORIGIN ?? "").split(",")[0].trim();
  if (origin) return origin.replace(/\/+$/, "");
  return "http://localhost:5173";
}

/** Whether a multiline EHLO reply advertises STARTTLS. */
function offersStartTls(reply) {
  return /STARTTLS/i.test(reply);
}

/**
 * The SMTP dialogue: banner (220), EHLO, optional STARTTLS upgrade + a second
 * EHLO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT. `step` counts accepted
 * responses so far; the send function at that index produces the next command.
 *
 * Step layout:
 *   0  banner    220 -> EHLO
 *   1  EHLO      250 -> STARTTLS (if plain + advertised) else AUTH LOGIN
 *   2  STARTTLS  220 -> (upgrade here, send EHLO, advance to 3)
 *   3  EHLO#2    250 -> AUTH LOGIN
 *   4  AUTH      334 -> user  (b64)
 *   5  PASS      334 -> pass  (b64)
 *   6  LOGIN     235 -> MAIL FROM
 *   7  MAIL      250 -> RCPT TO
 *   8  RCPT      250 -> DATA
 *   9  DATA      354 -> message body + "."
 *  10  BODY      250 -> QUIT
 *  11  QUIT      221 -> done
 */
export function sendMail({ subject, body, to } = {}) {
  const c = cfg();
  const rcpt = String(to ?? c.to ?? "").trim();
  if (!mailConfigured()) return Promise.resolve({ sent: false, reason: "SMTP not configured" });
  if (!rcpt) return Promise.resolve({ sent: false, reason: "no recipient" });

  return new Promise((resolve, reject) => {
    let socket = c.secure
      ? tlsConnect({ host: c.host, port: c.port })
      : connect(c.port, c.host);

    let finished = false;
    const finish = (err, ok) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      err ? reject(err) : resolve({ sent: true, ...ok });
    };
    const onError = (err) => finish(err);
    socket.setTimeout(25_000);
    socket.on("timeout", () => finish(new Error("SMTP timeout")));
    socket.on("error", onError);

    const steps = [
      { code: 220, send: () => "EHLO presentation-forge" },
      { code: 250, send: null }, // set by onData: STARTTLS or AUTH LOGIN
      { code: 220, send: null }, // STARTTLS go-ahead — upgraded in onData
      { code: 250, send: () => "AUTH LOGIN" },
      { code: 334, send: () => Buffer.from(c.user).toString("base64") },
      { code: 334, send: () => Buffer.from(c.pass).toString("base64") },
      { code: 235, send: () => `MAIL FROM:<${c.from}>` },
      { code: 250, send: () => `RCPT TO:<${rcpt}>` },
      { code: 250, send: () => "DATA" },
      { code: 354, send: () => {
          const data =
            `From: ${c.from}\r\n` +
            `To: ${rcpt}\r\n` +
            `Subject: ${subject}\r\n` +
            `MIME-Version: 1.0\r\n` +
            `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
            `${body}\r\n.\r\n`;
          return data;
        } },
      { code: 250, send: () => "QUIT" },
      { code: 221, send: null },
    ];

    let step = 0;
    let startedTls = false;
    let buffer = "";
    // A multiline reply (EHLO advertises its capabilities on 250-… continuation
    // lines) must be accumulated as a whole before the state machine advances;
    // checking only the final line would miss a STARTTLS offer on an earlier one.
    let reply = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      let m;
      while ((m = buffer.match(/^(\d{3})([ -])([^\r\n]*)(?:\r?\n)/))) {
        buffer = buffer.slice(m[0].length);
        reply += m[3] + "\n";
        if (m[2] === " ") break; // final line of a (possibly multiline) response
      }
      if (!m || m[2] !== " ") return; // still mid-multiline
      const code = Number(m[1]);
      const complete = reply;
      reply = "";
      const expected = steps[step];
      if (!expected) return finish(new Error(`SMTP unexpected response ${code}`));
      if (code !== expected.code) return finish(new Error(`SMTP ${code} (expected ${expected.code})`));

      // Step 1: decide the path after the first EHLO. Plain + STARTTLS offered
      // -> upgrade; otherwise (TLS already up, or the server has no STARTTLS)
      // go straight to auth.
      if (step === 1) {
        if (!c.secure && !startedTls && offersStartTls(complete)) {
          socket.write("STARTTLS\r\n");
          step = 2;
        } else {
          socket.write("AUTH LOGIN\r\n");
          step = 4;
        }
        return;
      }

      // Step 2: the server accepted STARTTLS. Wrap the live socket in TLS,
      // re-attach handlers, and send the required post-upgrade EHLO. The TLS
      // layer replays buffered plaintext into the encrypted stream.
      if (step === 2) {
        startedTls = true;
        const plain = socket;
        plain.removeListener("data", onData);
        plain.removeListener("error", onError);
        socket = tlsConnect({ socket: plain, servername: c.host, rejectUnauthorized: false });
        socket.setTimeout(25_000);
        socket.on("timeout", () => finish(new Error("SMTP timeout")));
        socket.on("error", onError);
        socket.on("data", onData);
        socket.write("EHLO presentation-forge\r\n");
        step = 3;
        return;
      }

      if (expected.send) {
        const payload = expected.send();
        // Every SMTP command line must end CRLF; the DATA payload already
        // carries its own terminators, so only append when missing.
        socket.write(payload.endsWith("\r\n") ? payload : payload + "\r\n");
      }
      step++;
      if (step >= steps.length) finish(null, {});
    };
    socket.on("data", onData);
  });
}

/** Plain-text email body for a sweep: what will be deleted, when, by whom. */
export function sweepMailBody({ deleted = [], willDelete = [], olderThanDays }) {
  const lines = [];
  if (willDelete.length) {
    lines.push(`The monthly sweep on ${new Date().toDateString()} will delete decks older than ${olderThanDays} days unless marked keep:`);
    for (const d of willDelete) lines.push(`  - ${d.title} (${d.slug})`);
  }
  if (deleted.length) {
    lines.push(`\nDeleted this run:`);
    for (const d of deleted) lines.push(`  - ${d.title} (${d.slug})`);
  }
  lines.push(`\nDownloaded decks are kept locally; the server only holds recent work.`);
  return lines.join("\n");
}

/* ------------------------------------------------------- transactional mail */

/**
 * The two messages an account can be sent about itself. Both are plain text on
 * purpose: this client sends one part, and a reset link that arrives as legible
 * text in every mail reader is worth more than a styled one that arrives as a
 * blob in some of them.
 *
 * The link carries the token in the URL fragment, not the query string. A
 * fragment is never sent to the server, never lands in an access log, and is
 * not forwarded in a Referer header when the page loads its own assets — the
 * app reads it in the browser and POSTs it back over TLS. It is also already
 * how this SPA routes.
 */
export function resetMail({ name, token, minutes }) {
  const link = `${linkBase()}/#/reset/${token}`;
  return {
    subject: "Reset your Presentation Forge password",
    body:
      `Hello ${name},\n\n` +
      `Someone asked to reset the password for this account. Open the link\n` +
      `below within ${minutes} minutes to choose a new one:\n\n` +
      `  ${link}\n\n` +
      `The link works once. If you did not ask for this, ignore this message —\n` +
      `your password has not changed and nobody was told the address exists.\n\n` +
      `— Presentation Forge\n`,
  };
}

export function verifyMail({ name, token, hours }) {
  const link = `${linkBase()}/#/verify/${token}`;
  return {
    subject: "Confirm your email for Presentation Forge",
    body:
      `Hello ${name},\n\n` +
      `Confirm this address to start generating. The link is good for\n` +
      `${hours} hours:\n\n` +
      `  ${link}\n\n` +
      `Until it is confirmed the account can sign in and look around, but\n` +
      `cannot create or generate anything.\n\n` +
      `If you did not sign up, ignore this message — the account cannot be\n` +
      `used without confirming this address.\n\n` +
      `— Presentation Forge\n`,
  };
}
