#!/usr/bin/env node

import { createServer } from "node:net";
import { appendFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.FORGE_MAILSINK_PORT ?? 2525);
const FILE = process.env.FORGE_MAILSINK_FILE ?? path.join(tmpdir(), "forge-mailsink.jsonl");

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
  let authStep = 0;

  const say = (line) => socket.write(`${line}\r\n`);

  socket.setEncoding("utf8");
  say("220 forge-mailsink ready");

  socket.on("data", async (chunk) => {
    buffer += chunk;

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
