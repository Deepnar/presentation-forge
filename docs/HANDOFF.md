# HANDOFF — settings redesign: presets + identity split

The profile-chip modal is now the ONE settings surface. Presets get full CRUD
without a chat; identity holds only the long-term facts (institution, guide).
Committed to `origin/main`. Servers left running: UI :5173, API :5174. Local
models untouched; cloud `deepseek-v4-flash` coded, `mimo-v2.5` visioned.

## 1. Settings = one surface (the profile modal)

- **`SettingsModal.jsx`** (new) is opened from the profile chip or the sidebar
  row. Three sections: **Account** (name/email, cloud status + model count +
  key save/test/remove + routing, logout behind the shared confirm), **Saved
  formats** (presets: create/edit/delete without any chat), **Identity**
  (institution name/short/department/university + guide name/designation,
  edited inline, plus the brand-marks upload kept).
- The old `views/Identity.jsx` is deleted. The sidebar "Identity" row is now
  "Settings" and opens the modal; `#/identity` is gone from the router (an old
  hash resolves to chat, like any unknown route). The HeaderBar's CLOUD button
  without a key points at Settings → Cloud, which still manages keys.

## 2. Presets — the reusable half, narrowed

- A preset now fixes: team (members + presenting), **maxSlides** (new), slides
  per member, density, theme, branding. It does NOT carry guide or academic
  anymore. `src/presets.js` sanitizes on save AND on list read, so old preset
  files with `guide`/`academic` migrate away on read.
- **`lib/presets.js`** (new) is a tiny pub/sub store shared by Settings and the
  briefing, so a format created in Settings shows up in "Use a saved format?"
  without a reload. "Save as preset…" from the briefing summary still works and
  writes through the same store.

## 3. Identity — long-term facts only

- `initialBriefing` no longer reads team/academic from config/identity.yaml;
  those are per-submission, asked in the chat, and frozen into each deck's
  `meta.yaml` as before. The guide pre-fills from identity.
- "Remember as defaults" is removed from the chat summary card — it wrote
  team/academic back into identity, exactly the coupling removed.
- **Migration decision: briefing-only.** Existing identity.yaml keeps
  institution + guide; stale team/academic blocks are dropped the next time
  identity is saved from Settings (the save writes only long-term fields). No
  default preset is seeded. Noted in ROADMAP.

## Verify (all green)

- `npm test` — 316 pass (added `test/briefing.test.js` for the preset/identity
  contract and new presets/router tests).
- `vite build` clean.
- CDP (headless Chrome): created "IE Preset" in Settings with no chat open →
  fresh chat's "Use a saved format?" listed it → picked → team pre-filled and
  fixed questions skipped to the title → Identity section showed only
  institution/guide (subject/year/semester/team absent) and saved to
  config/identity.yaml. `mimo-v2.5` confirmed all four screens render clean.

## Notes for the next session

- `config/identity.yaml` on this box was restored to its pre-test state
  (`institution.name: HACKED`); the CDP test account
  (`settings-redesign@forge.local`) and its presets were removed after verify.
- `ReportView`/`DeckDetail` still read `identity?.academic`/`team` as *fallbacks*
  when a deck/report has no meta snapshot — now they fall back to `{}` and the
  cover is sparse for ownerless decks, which is content, not a defect.
- The `docs/slide-type-audit.md` and report paths are untouched by this change;
  the renderer was never involved (identity merge is per-deck meta, unchanged).
