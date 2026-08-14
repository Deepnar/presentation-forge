import { connect } from "node:net";
import { connect as tlsConnect } from "node:tls";

/**
 * A minimal SMTP client — the whole app needs is "send an email on sweep day",
 * and pulling nodemailer in for one message is the kind of dependency the
 * local-first project is built against. Node's net/tls only; no framework.
 *
 * Env config (all optional — with none set the helper is a silent no-op):
 *   FORGE_SMTP_HOST, FORGE_SMTP_PORT (default 587), FORGE_SMTP_USER,
 *   FORGE_SMTP_PASS, FORGE_SMTP_FROM, FORGE_SMTP_TO,
 *   FORGE_SMTP_SECURE=1  (implicit TLS on connect, port 465 style)
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

export function mailConfigured() {
  const c = cfg();
  return Boolean(c.host && c.from && c.to && c.user && c.pass);
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
export function sendMail({ subject, body } = {}) {
  const c = cfg();
  if (!mailConfigured()) return Promise.resolve({ sent: false, reason: "SMTP not configured" });

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
      { code: 250, send: () => `RCPT TO:<${c.to}>` },
      { code: 250, send: () => "DATA" },
      { code: 354, send: () => {
          const data =
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
