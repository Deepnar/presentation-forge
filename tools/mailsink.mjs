#!/usr/bin/env node
/**
 * A local SMTP server that accepts everything and delivers nothing.
 *
 * The auth flows — address verification and password reset — are the part of
 * the product that cannot be exercised without outbound mail, and a dev box has
 * none. `mailConfigured()` is load-bearing beyond sending: with no SMTP the app
 * marks new accounts verified on creation, so the verification path is not just
 * untested locally, it does not run at all. That is why those flows were built
 * and never watched.
 *
 * This is the missing half. It speaks exactly the dialogue `src/mail.js` sends
 * — banner, EHLO, AUTH LOGIN, MAIL FROM, RCPT TO, DATA, QUIT — advertises no
 * STARTTLS so the client stays on the plain socket, and accepts any credential.
 * Each message is appended to a JSONL file and summarised on stdout with any
 * link it contains, because the link is the whole point: a reset or
 * confirmation is a URL somebody has to click.
 *
 *   node tools/mailsink.mjs                 # or: npm run mailsink
 *   npm run dev:mail                        # api + web + sink, wired together
 *
 * Env: FORGE_MAILSINK_PORT (2525), FORGE_MAILSINK_FILE (a JSONL path in tmp).
 *
 * It is a test double and says so: no TLS, no auth, no delivery, bound to
 * loopback only. Never run it anywhere it could be reached.
 */

import { createServer } from "node:net";
import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.FORGE_MAILSINK_PORT ?? 2525);
const FILE = process.env.FORGE_MAILSINK_FILE ?? path.join(tmpdir(), "forge-mailsink.jsonl");

/** Split a captured DATA payload into its headers and body. */
function parseMessage(raw) {
  const [head, ...rest] = raw.split(/\r?\n\r?\n/);
  const headers = {};
  for (const line of head.split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) headers[m[1].toLowerCase()] = m[2];
  }
  const body = rest.join("\n\n");
  return { headers, body };
}

const server = createServer((socket) => {
  let buffer = "";
  let inData = false;
  let data = "";
  let envelope = { from: null, to: null };
  // AUTH LOGIN is three round trips: the challenge, the username, the password.
  // Counting them is the only way to know which 334 to answer with — both
  // credential lines are opaque base64 and look identical from here.
  let authStep = 0;

  const say = (line) => socket.write(`${line}\r\n`);

  socket.setEncoding("utf8");
  say("220 forge-mailsink ready");

  socket.on("data", async (chunk) => {
    buffer += chunk;

    // DATA mode is terminated by a lone dot on its own line, not by a command.
    if (inData) {
      const end = buffer.indexOf("\r\n.\r\n");
      const endBare = end === -1 ? buffer.indexOf("\n.\n") : -1;
      const at = end !== -1 ? end : endBare;
      if (at === -1) return;
      data += buffer.slice(0, at);
      buffer = buffer.slice(at + (end !== -1 ? 5 : 3));
      inData = false;

      const { headers, body } = parseMessage(data);
      const record = {
        at: new Date().toISOString(),
        from: envelope.from,
        to: envelope.to,
        subject: headers.subject ?? "",
        body,
      };
      data = "";
      await appendFile(FILE, `${JSON.stringify(record)}\n`, "utf8").catch(() => {});
      const links = body.match(/https?:\/\/\S+/g) ?? [];
      console.log(`mail -> ${record.to} | ${record.subject}`);
      for (const l of links) console.log(`  link: ${l}`);
      say("250 OK queued");
      return;
    }

    let idx;
    while ((idx = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, idx).replace(/\r$/, "");
      buffer = buffer.slice(idx + 1);
      const verb = line.split(/\s+/)[0].toUpperCase();

      // No STARTTLS in the EHLO reply: src/mail.js only upgrades when the
      // server offers it, so staying quiet keeps the whole exchange readable.
      if (verb === "EHLO" || verb === "HELO") { say("250-forge-mailsink"); say("250 AUTH LOGIN PLAIN"); }
      else if (authStep === 1) { authStep = 2; say("334 UGFzc3dvcmQ6"); }   // "Password:"
      else if (authStep === 2) { authStep = 0; say("235 Authenticated"); }  // any credential passes
      else if (verb === "AUTH") { authStep = 1; say("334 VXNlcm5hbWU6"); }  // "Username:"
      else if (verb === "MAIL") { envelope.from = (line.match(/<(.*)>/) ?? [])[1] ?? null; say("250 OK"); }
      else if (verb === "RCPT") { envelope.to = (line.match(/<(.*)>/) ?? [])[1] ?? null; say("250 OK"); }
      else if (verb === "DATA") { inData = true; say("354 End data with <CR><LF>.<CR><LF>"); }
      else if (verb === "QUIT") { say("221 Bye"); socket.end(); }
      else if (verb === "RSET") { envelope = { from: null, to: null }; say("250 OK"); }
      else if (verb === "NOOP") say("250 OK");
      else say("500 unrecognised");
    }
  });

  socket.on("error", () => { /* a client that hangs up mid-dialogue is fine */ });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`  mail  smtp://127.0.0.1:${PORT} (sink — accepts everything, delivers nothing)`);
  console.log(`        messages: ${FILE}`);
});
