# V2-7A evidence — unified workspace in real Chrome

Driver: `test/v2-edit-chrome-7a.test.js` (dashboard 5/5,
navigation 3/3, editor shell partial — see `docs/V2-7A-EVAL.md`
§9) against an isolated API + built `dist`. Each run overwrites
these files.

- `dashboard-empty.png` — first-run empty state with creation entry.
- `dashboard.png` — project cards (titles, slide counts, revisions).
- `editor-blank.png` — blank project opened in the unified shell.
- `editor-shell.png` — text edit, history dialog access, new rails.
- `editor-readonly.png` — read-only mode with export available.
- `editor-narrow.png` — 480px viewport with collapsed rails.
- `dashboard-hosted-anon.png` — signed-out hosted sign-in state
  (pending final pass).

Scene values (not screenshots alone) are asserted in the test:
project ids across navigation, revision numbers at every save,
wording before/after edits, history lengths, export slide counts,
and remount single-commit semantics.
