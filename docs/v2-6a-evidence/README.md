# V2-6A Chrome evidence

Real-Chrome captures from `test/v2-edit-chrome-6a.test.js` (5/5, isolated
API on port 5271 with a scratch CONFIG + database, static dist on 5258).
Each file is written by the suite itself — what the test asserted is what
the image shows.

- `saved.png` — first explicit save of the fixture deck. Toolbar pill
  reads **Saved · rev 0**; the `?project=` deep link tracks the new id.
  The pill reflects the confirmed PUT response, never engine success.
- `recovered-banner.png` — fresh page on `?project=<id>` offers
  “Last project … is saved on this machine” with Reopen/Dismiss.
  Nothing auto-loads; navigation is explicit.
- `reopened.png` — the reopened deck: identical slide ids and order
  (asserted byte-deep by slide id list), ready to edit.
- `project-list.png` — Projects dialog: stored rows with slide count
  and durable revision, Save-current-as-project, per-row Open/Rename,
  and two-step Delete (arming never removes anything — asserted by a
  200 status between arm and confirm).
- `conflict.png` — two editors on one project: A saved rev 1, B's save
  on the stale base is refused with “based on 0, stored is 1”. B's
  “Opening — B stale” wording stays on the slide; the stored rev 1 is
  untouched (asserted by re-GET).
