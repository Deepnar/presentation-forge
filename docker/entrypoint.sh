#!/bin/sh
# First-boot seeding for the volume-backed directories. On a fresh volume
# /data/config is empty, but the app's fallback templates (identity.example.yaml,
# models.yaml) ship in the image at /app/config. Copy the committed templates
# in only when the target is missing — never overwrite user data across a
# redeploy. brand/ gets the same treatment via the neutral placeholder pass,
# so a fresh volume has a working institutional mark.
set -eu

# Config: seed the committed templates into the volume once.
if [ -d /app/config ] && [ -d /data ]; then
  mkdir -p /data/config /data/decks /data/brand /data/brand/logos /data/reference /data/plate-cache
  for f in /app/config/*.yaml; do
    [ -e "$f" ] || continue
    name=$(basename "$f")
    if [ ! -e "/data/config/$name" ]; then
      cp "$f" "/data/config/$name"
    fi
  done
fi

# Neutral placeholder marks, so a fresh volume renders working chrome instead of
# warning about a missing crest on every slide. Skipped once real marks exist.
if [ -d /data/brand ] && [ -z "$(ls -A /data/brand/logos 2>/dev/null)" ]; then
  node tools/make-placeholder-brand.mjs || true
  node tools/prep-brand.mjs || true
fi

# /data/reference holds the report donor .docx. It is uploaded by an admin at
# runtime (Settings) because the template is gitignored and never in the image.

exec "$@"
