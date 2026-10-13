# V2-6B evidence — durable history in real Chrome

Driver: `test/v2-edit-chrome-6b.test.js` (4/4) against an isolated
API + built `dist`. Each run overwrites these files.

- `history-three-versions.png` — three recoverable revisions after
  heading edit + duplicate-slide saves.
- `history-revisions.json` — the `/revisions` audit list (kinds,
  summaries, recoverability; no scene bytes).
- `history-list.png` — the Version History dialog over two versions.
- `history-preview.png` — rev-0 preview (slide headlines) with the
  restore control.
- `history-restored.png` — stage after restoring rev 0 as rev 2.
- `history-restore.json` — restored revision number + slide ids.
- `history-after-refresh.png` — restored state reopened after refresh.
- `history-stale.json` — the refused stale-restore shape (409,
  `stale-revision`, revision untouched).

Scene values (not screenshots alone) are asserted in the test:
slide ids and order, heading wording before/after restore, revision
numbers at every step, and the post-refresh post-restore edit.
