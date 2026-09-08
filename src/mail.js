import { connect } from "node:net";
import { connect as tlsConnect } from "node:tls";

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
  return Boolean(c.host && c.from && c.user && c.pass);
}

export function sweepMailConfigured() {
  return mailConfigured() && Boolean(cfg().to);
}

export function linkBase() {
  const explicit = (process.env.FORGE_PUBLIC_URL ?? "").trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const origin = (process.env.FORGE_UI_ORIGIN ?? "").split(",")[0].trim();
  if (origin) return origin.replace(/\/+$/, "");
  return "http://localhost:5173";
}

function offersStartTls(reply) {
  return /STARTTLS/i.test(reply);
}

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
        socket.write(payload.endsWith("\r\n") ? payload : payload + "\r\n");
      }
      step++;
      if (step >= steps.length) finish(null, {});
    };
    socket.on("data", onData);
  });
}

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
