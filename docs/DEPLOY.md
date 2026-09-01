# Deploying the hosted site

The hosted product is **Auto (shared gateway) + BYOK**. Ollama stays in the
repository for people who clone it and run their own models; it is not part of
this deployment and `FORGE_HOSTED=1` disables it entirely.

## What the workload actually needs

This is not a serverless application and no amount of rewriting makes it one.

| Requirement | Why |
|---|---|
| A long-running container | Generation is a multi-minute SSE stream: plan, then one model call per slide, then critic, coherence, render and rasterise. |
| ~2 GB RAM, 4 GB comfortable | LibreOffice and Chromium are the spikes. A 512 MB free tier cannot convert a deck. |
| A writable persistent disk | `decks/<slug>/` trees and a SQLite file. A deck with previews is 5–15 MB. |
| Ability to run system binaries | `soffice`, `pdftoppm`, `chromium`. |

Anything that gives you those runs this. Anything that does not, cannot —
Vercel, Netlify, and Cloudflare Workers are all out, and porting the UI to
Next.js would not change a single line of the above.

## Where to host it free

**Oracle Cloud Always Free, ARM (Ampere A1).** The one genuinely free tier that
clears the bar. Since 15 June 2026 the allowance is **2 OCPU / 12 GB RAM**
(halved from 4/24, with no announcement), plus 200 GB of block storage — still
several times what this needs. The image builds for arm64.

Two things to know going in:

- ARM capacity is frequently exhausted in popular regions. "Out of capacity" on
  instance creation is normal; retry, or pick a less busy region at signup,
  because the home region cannot be changed afterwards.
- An Always Free account can be reclaimed if idle. This app running with a
  healthcheck is not idle.

If ARM is unavailable and you do not want to wait, the honest fallback is a
small paid VPS (Hetzner CX22 is about €4/month). Everything below applies
unchanged.

## Setup

### 1. The instance

Create an **Ampere A1 Compute** instance, Ubuntu 24.04, 2 OCPU / 12 GB, with a
50 GB+ boot volume. Add your SSH key.

Open 80 and 443 in **both** places — Oracle has two layers and forgetting the
second is the usual reason a fresh instance is unreachable:

```bash
# 1. VCN security list: add ingress rules for TCP 80 and 443 from 0.0.0.0/0
#    (Networking -> Virtual Cloud Networks -> your VCN -> Security Lists)
# 2. The instance's own firewall:
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```

### 2. Docker

```bash
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
```

### 3. The app

```bash
git clone https://github.com/Deepnar/presentation-forge.git
cd presentation-forge/docker
cp ../.env.example .env
```

Fill in `.env`. The three that are not optional:

```bash
openssl rand -base64 48   # -> FORGE_KEY_PEPPER
openssl rand -hex 32      # -> SEARXNG_SECRET
                          # -> FORGE_DOMAIN, your hostname
```

`FORGE_KEY_PEPPER` is enforced: hosted mode refuses to start without it rather
than fall back to the development constant, which is published in this
repository and would make per-user key encryption decorative.

Point your domain's A record at the instance's public IP, then:

```bash
docker compose -f docker-compose.app.yml --profile tls up -d --build
```

The first build takes a while — it downloads 27 font families and installs
LibreOffice and Chromium. Caddy gets a Let's Encrypt certificate on first
request.

### 4. First boot

Sign in with `FORGE_ADMIN_EMAIL`. If that address had no account, one is seeded
from `FORGE_ADMIN_PASSWORD`; if it already existed, it is promoted to admin.

Then, in the app:

- **Settings → Deployment mode** should read HOSTED.
- **Admin → System** confirms the gateway, SearXNG and outbound email are
  reachable, and leads with the report template's state.
- Upload the institutional `.docx` template, from that same panel. Reports
  render by injecting content into a donor document, and the repository ships
  none (it carries third-party names). Until one is uploaded, decks work
  normally and anything that would produce a report refuses up front, before
  spending a research pass and a model run on a document it cannot draw. The
  server also says so on stdout at boot.

**Configure SMTP before you invite anybody.** It is optional to the code and not
optional to a real user:

- Without it **there is no password reset**. Someone who forgets their password
  and did not sign in with Google is locked out permanently — nothing in the app
  can help them, and the only fix is an admin editing the database.
- Without it **addresses are never confirmed**. New accounts are marked verified
  the moment they are created, because a gate whose only key is an email nobody
  can send is a locked door with no handle. With SMTP set, an unconfirmed
  account can sign in, browse and hold its own Cloud key, but cannot create or
  generate anything.
- Set `FORGE_PUBLIC_URL` alongside it. The links inside those messages are built
  from it, and a reset link pointing at `localhost` is useless in an inbox.

Accounts that already exist when this ships are grandfathered as confirmed, so
upgrading a running box does not lock out the people on it.

## Operating it

**Registration is open by default.** That is what you want for a public site,
but it means anyone can consume CPU and disk. The controls:

- `FORGE_AUTO_*` caps what one account may spend on the shared gateway.
- `FORGE_SWEEP_DAYS=30` deletes decks after a month of inactivity. On a free
  tier this is not optional — at 5–15 MB per deck, without it the disk fills.
- `FORGE_OPEN_REGISTRATION=0` closes signup entirely if it gets abused.

**Storage is the constraint that will bite first**, not CPU. Watch it:

```bash
docker exec forge_app du -sh /data/decks /data/plate-cache
```

**Backups.** Everything that matters is in one volume:

```bash
docker run --rm -v docker_forge_data:/data -v "$PWD:/backup" \
  alpine tar czf /backup/forge-$(date +%F).tar.gz -C /data .
```

**Updating.**

```bash
git pull && docker compose -f docker-compose.app.yml --profile tls up -d --build
```

The volume is untouched by a rebuild, so decks, accounts, brand marks and the
donor template all survive.

## Why TLS is not optional here

The session cookie that authenticates deck rasters and downloads is only marked
`Secure` on an HTTPS request. Deck previews and `.pptx` downloads load in `<img>`
and `<a download>` tags, which cannot carry an `Authorization` header, so the
cookie is their only credential. Serving over plain HTTP means that credential
travels in the clear on every image request.
