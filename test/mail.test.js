import { test } from "node:test";
import assert from "node:assert/strict";
import { sendMail } from "../src/mail.js";

const CERT = process.cwd() + "/test/fixtures";
const CERT_KEY = CERT + "/smtp-key.pem";
const CERT_PEM = CERT + "/smtp-cert.pem";

// The in-process cert must exist for a TLS handshake. Generated once here; if
// missing the STARTTLS test skips rather than failing the whole suite.
import { mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

function ensureCert() {
  if (existsSync(CERT_KEY) && existsSync(CERT_PEM)) return true;
  try {
    mkdirSync(CERT, { recursive: true });
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "rsa:2048", "-nodes",
      "-keyout", CERT_KEY, "-out", CERT_PEM, "-days", "2",
      "-subj", "/CN=localhost",
    ], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * A single-connection SMTP test server. `starttls` decides whether EHLO
 * advertises the upgrade; every command is pushed to `commands` so the test
 * can assert the client's dialogue order.
 */
async function startSmtp({ starttls }) {
  const { createServer } = await import("node:net");
  const tls = await import("node:tls");
  const { readFileSync } = await import("node:fs");
  const key = readFileSync(CERT_KEY);
  const cert = readFileSync(CERT_PEM);
  const server = createServer();
  const commands = [];

  server.on("connection", (raw) => {
    let buf = "";
    let auth = 0;
    let socket = raw;
    const send = (l) => socket.write(l + "\r\n");

    const dialogue = (chunk) => {
      buf += chunk.toString("utf8");
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        commands.push(line);
        if (line.startsWith("EHLO")) {
          send("250-localhost");
          send("250-PIPELINING");
          send(starttls ? "250 STARTTLS" : "250 OK");
        } else if (line === "STARTTLS") {
          send("220 2.0.0 Ready to start TLS");
          const enc = new tls.TLSSocket(raw, {
            isServer: true, cert, key, requestCert: false,
          });
          enc.removeListener("data", dialogue);
          enc.on("data", dialogue);
          socket = enc;
        } else if (line.startsWith("AUTH LOGIN")) {
          send("334 VXNlcm5hbWU6");
        } else if (auth === 0) {
          auth = 1;
          send("334 UGFzc3dvcmQ6");
        } else if (auth === 1) {
          auth = 2;
          send("235 2.7.0 Authentication successful");
        } else if (line.startsWith("MAIL FROM")) {
          send("250 2.1.0 Ok");
        } else if (line.startsWith("RCPT TO")) {
          send("250 2.1.5 Ok");
        } else if (line === "DATA") {
          send("354 End");
        } else if (line === ".") {
          send("250 2.0.0 Queued");
        } else if (line === "QUIT") {
          send("221 Bye");
          socket.destroy();
        }
      }
    };
    socket.on("data", dialogue);
    send("220 localhost ESMTP test");
  });

  const port = await new Promise((res) => server.listen(0, "127.0.0.1", () => res(server.address().port)));
  return { server, port, commands };
}

function withEnv(port) {
  const prev = {};
  const set = {
    FORGE_SMTP_HOST: "127.0.0.1",
    FORGE_SMTP_PORT: String(port),
    FORGE_SMTP_USER: "tester",
    FORGE_SMTP_PASS: "secret",
    FORGE_SMTP_FROM: "sweep@example.com",
    FORGE_SMTP_TO: "owner@example.com",
    FORGE_SMTP_SECURE: "0",
  };
  for (const [k, v] of Object.entries(set)) { prev[k] = process.env[k]; process.env[k] = v; }
  return () => { for (const [k, v] of Object.entries(set)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } };
}

test("sendMail negotiates STARTTLS and authenticates on port 587", async (t) => {
  if (!ensureCert()) return t.skip("openssl unavailable — cannot build test cert");
  const { server, port, commands } = await startSmtp({ starttls: true });
  const restore = withEnv(port);
  try {
    const r = await sendMail({ subject: "Sweep", body: "All good" });
    assert.equal(r.sent, true);
    // The client must have upgraded to TLS before AUTH — the signature of a
    // working STARTTLS handshake.
    const starttlsAt = commands.indexOf("STARTTLS");
    const authAt = commands.findIndex((c) => c.startsWith("AUTH"));
    assert.ok(starttlsAt > -1, "client sent STARTTLS");
    assert.ok(authAt > starttlsAt, "AUTH happened after the TLS upgrade");
    assert.ok(commands.includes("MAIL FROM:<sweep@example.com>"));
    assert.ok(commands.includes("RCPT TO:<owner@example.com>"));
    assert.ok(commands.includes("QUIT"));
  } finally {
    restore();
    await new Promise((r) => server.close(r)).catch(() => {});
  }
});

test("sendMail falls back to plain AUTH when STARTTLS is not offered", async (t) => {
  const { server, port, commands } = await startSmtp({ starttls: false });
  const restore = withEnv(port);
  try {
    const r = await sendMail({ subject: "Sweep", body: "All good" });
    assert.equal(r.sent, true);
    assert.ok(!commands.includes("STARTTLS"), "no STARTTLS attempted when unoffered");
    assert.ok(commands.findIndex((c) => c.startsWith("AUTH")) > -1);
  } finally {
    restore();
    await new Promise((r) => server.close(r)).catch(() => {});
  }
});
