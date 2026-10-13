# V2-6C evidence — hosted persistence in real Chrome

Driver: `test/v2-edit-chrome-6c.test.js` (3/3) against an isolated
API (PostgreSQL backend) + built `dist`. Each run overwrites these
files; the test database is dropped afterward.

- `hosted-history.png` — Version History dialog over three hosted
  revisions (create/save/rename).
- `hosted-restored.png` — stage after restoring rev 0 as rev 3 on
  the hosted backend.
- `hosted-flow.json` — project id, restored revision, slide count.
- `hosted-after-restart.png` — reopened state after killing and
  restarting the API process against the same database.
- `hosted-conflict.png` — two-session loser showing the conflict
  banner instead of overwriting.
- `hosted-conflict.json` — kept revision after the refused write.

Scene values (not screenshots alone) are asserted in the test:
revision numbers at every step, wording before/after restore and
restart, history length, export slide count, and the 409-kept
revision after the two-session race.
