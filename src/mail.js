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
 *   FORGE_SMTP_SECURE=1  (implicit TLS on connect; default is plain + AUTH)
 *
 * Plain SMTP with AUTH LOGIN, one recipient, one text message. That is the
 * entire job; a real mail server (or provider's submission port) handles the
 * rest.
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

/**
 * The SMTP dialogue is: wait for banner (220), EHLO, AUTH LOGIN (334),
 * base64 user (334), base64 pass (235), MAIL FROM (250), RCPT TO (250),
 * DATA (354), then the message body + "." (250), QUIT (221). Each step waits
 * for a complete response line; the response code tells us what to send next.
 */
export function sendMail({ subject, body } = {}) {
  const c = cfg();
  if (!mailConfigured()) return Promise.resolve({ sent: false, reason: "SMTP not configured" });

  return new Promise((resolve, reject) => {
    const socket = c.secure
      ? tlsConnect({ host: c.host, port: c.port })
      : connect(c.port, c.host);

    let finished = false;
    const finish = (err, ok) => {
      if (finished) return;
      finished = true;
      socket.destroy();
      err ? reject(err) : resolve({ sent: true, ...ok });
    };
    socket.setTimeout(25_000);
    socket.on("timeout", () => finish(new Error("SMTP timeout")));

    // The ordered list of things to send, one per accepted response line.
    const steps = [
      { code: 220, send: () => "EHLO presentation-forge" },
      { code: 334, send: () => "AUTH LOGIN" },
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
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("utf8");
      // Only act on a complete single-line response (final code, not a
      // multiline continuation like "250-..."). SMTP servers here reply one
      // line at a time for this dialogue.
      const m = buffer.match(/^(\d{3})\s[^\r\n]*\r?\n/);
      if (!m) return;
      buffer = "";
      const code = Number(m[1]);
      const expected = steps[step];
      if (!expected) return finish(new Error(`SMTP unexpected response ${code}`));
      if (code !== expected.code) return finish(new Error(`SMTP ${code} (expected ${expected.code})`));
      if (expected.send) socket.write(expected.send());
      step++;
      if (step >= steps.length) finish(null, {});
    };
    socket.on("data", onData);
    socket.on("error", (err) => finish(err));
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
