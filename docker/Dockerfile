# The Presentation Forge app server + UI.
#
# One container serves both: Express hosts the API and the built Vite bundle, so
# a deployment is a single process on a single port. LibreOffice, Poppler and
# Chromium are here because the pipeline rasterises decks and reports to
# previews (LibreOffice -> PDF -> PNG) and renders plate themes (headless
# Chrome). None of that is optional — they are how the product produces output.
#
# Build:   docker build -f docker/Dockerfile -t presentation-forge .
# Run:     docker compose -f docker/docker-compose.app.yml up -d
#
# Builds for arm64 as well as amd64, because the free-tier hosts worth using
# (Oracle Ampere) are ARM.

FROM node:24-bookworm-slim AS build

WORKDIR /app

# Dependencies first so a source-only change reuses the layer.
COPY package.json package-lock.json ./
RUN npm ci

COPY app ./app
RUN npx vite build --config app/web/vite.config.js

# The typefaces every theme is designed around. This runs at BUILD time and its
# output is copied into the runtime image: a machine with only DejaVu and
# Liberation renders all 38 themes with substituted fonts, which is invisible in
# the .pptx (font names are just strings there) and wrong in every server-side
# preview PNG and every plate background — i.e. wrong in everything the user
# actually looks at in the app.
COPY tools ./tools
RUN node tools/install-fonts.mjs


FROM node:24-bookworm-slim

# LibreOffice for preview rasterisation, poppler for the PDF -> PNG split,
# fontconfig so the downloaded typefaces are indexed, and Chromium for plate
# themes (a theme with tokens.plate.enabled renders its background via Chrome;
# the freeform slide type is all Chrome).
RUN apt-get update && apt-get install -y --no-install-recommends \
      libreoffice-writer \
      libreoffice-calc \
      libreoffice-impress \
      poppler-utils \
      fontconfig \
      fonts-dejavu \
      fonts-liberation \
      chromium \
    && ln -s /usr/bin/chromium /usr/local/bin/google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# src/plate.js resolves FORGE_CHROME at /usr/local/bin rather than the Debian
# path, or every plate render fails in the container. The container has neither
# the setuid sandbox nor user namespaces, so Chromium runs with --no-sandbox.
ENV FORGE_CHROME=/usr/local/bin/google-chrome-stable \
    FORGE_CHROME_NO_SANDBOX=1

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src ./src
COPY schema ./schema
COPY themes ./themes
COPY styles ./styles
COPY config ./config
COPY templates ./templates
COPY tools ./tools
COPY README.md ./README.md

# Built UI and the fonts, from the build stage.
COPY --from=build /app/app/web/dist ./app/web/dist
COPY app/server ./app/server
COPY app/web/index.html ./app/web/index.html
COPY --from=build /root/.local/share/fonts/presentation-forge /usr/local/share/fonts/presentation-forge
RUN fc-cache -f \
    && fc-match "Inter" | grep -qi inter \
    || (echo "FATAL: theme fonts did not install — every preview would render with substituted type" && exit 1)

# The stateful directories are volumes in docker-compose; env points at them.
# FORGE_REFERENCE_DIR is on the volume too: the institutional .docx the report
# renderer needs is gitignored and not in the build context, so it has to be
# uploadable at runtime rather than baked in.
ENV FORGE_DECKS_DIR=/data/decks \
    FORGE_THEMES_DIR=/app/themes \
    FORGE_BRAND_DIR=/data/brand \
    FORGE_CONFIG_DIR=/data/config \
    FORGE_REFERENCE_DIR=/data/reference \
    FORGE_PLATE_CACHE=/data/plate-cache \
    FORGE_API_PORT=5174 \
    NODE_ENV=production

# Run as an unprivileged user (1001 — the base image's node user already owns
# 1000). The named volume must give this uid access; see the compose file's
# `user:` mapping.
RUN useradd --create-home --uid 1001 forge \
    && mkdir -p /data && chown -R forge:forge /data /app

USER forge

COPY --chown=forge:forge docker/entrypoint.sh /usr/local/bin/forge-entrypoint
RUN chmod +x /usr/local/bin/forge-entrypoint

VOLUME ["/data"]

EXPOSE 5174

ENTRYPOINT ["/usr/local/bin/forge-entrypoint"]
CMD ["node", "app/server/index.js"]
