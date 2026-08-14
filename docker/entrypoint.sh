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
  mkdir -p /data/config /data/decks /data/brand /data/plate-cache
  for f in /app/config/*.yaml; do
    [ -e "$f" ] || continue
    name=$(basename "$f")
    if [ ! -e "/data/config/$name" ]; then
      cp "$f" "/data/config/$name"
    fi
  done
fi

# Decks and plate cache are created lazily by the app; nothing to seed.

exec "$@"
