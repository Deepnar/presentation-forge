# The Presentation Forge app server + UI, for a home Linux box.
#
# The image ships the API (Express over src/) and the built UI (Vite output
# served by Express? — no, the UI is a separate dev server). For production the
# UI is static files; the API serves them. LibreOffice and Chrome are here
# because the pipeline rasterises decks and reports to previews (LibreOffice →
# PDF → PNG) and renders plate themes (headless Chrome).
#
# Build:   docker build -t presentation-forge .
# Run:     docker compose -f docker/docker-compose.app.yml up -d

FROM node:24-bookworm-slim

# LibreOffice for preview rasterisation, poppler for the PDF → PNG split,
# fonts for the typefaces the decks expect (a machine with only DejaVu renders
# every theme wrong).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-calc \
      libreoffice-impress \
      poppler-utils \
      fonts-dejavu \
      fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

# Headless Chrome for plate themes (a theme with tokens.plate.enabled renders
# its background via Chrome; the freeform slide type is all Chrome). The
# symlink lives at /usr/local/bin — src/plate.js resolves FORGE_CHROME there
# rather than the Debian path, or every plate render fails in the container.
RUN apt-get update && apt-get install -y --no-install-recommends \
      chromium \
    && ln -s /usr/bin/chromium /usr/local/bin/google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

ENV FORGE_CHROME=/usr/local/bin/google-chrome-stable \
    FORGE_CHROME_NO_SANDBOX=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY src ./src
COPY schema ./schema
COPY themes ./themes
COPY styles ./styles
COPY config ./config
COPY brand ./brand
COPY templates ./templates
COPY reference ./reference
COPY tools ./tools

# Build the UI and copy it in.
COPY app ./app
RUN npm ci && npx vite build --config app/web/vite.config.js && npm prune --omit=dev

# The stateful directories are volumes in docker-compose; env points at them.
ENV FORGE_DECKS_DIR=/data/decks \
    FORGE_THEMES_DIR=/app/themes \
    FORGE_BRAND_DIR=/data/brand \
    FORGE_CONFIG_DIR=/data/config \
    FORGE_PLATE_CACHE=/data/plate-cache \
    FORGE_API_PORT=5174

# Run as an unprivileged user (1001 — the base image's node user already owns
# 1000). The image's data dir lives on a named volume that the compose file
# must give this uid access to (see docker-compose.app.yml for the user:
# mapping). Chromium gets --no-sandbox from src/plate.js because the container
# is rootless anyway; the setuid sandbox needs root to exist.
RUN useradd --create-home --uid 1001 forge \
    && mkdir -p /data && chown -R forge:forge /data /app

USER forge

COPY --chown=forge:forge docker/entrypoint.sh /usr/local/bin/forge-entrypoint
RUN chmod +x /usr/local/bin/forge-entrypoint

VOLUME ["/data"]

EXPOSE 5174

ENTRYPOINT ["/usr/local/bin/forge-entrypoint"]
CMD ["node", "app/server/index.js"]
