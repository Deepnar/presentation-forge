# Presentation Forge handoff —2026-10-26

Branch v2; push only origin/v2. AcceptedI3baseline2ba82cb and its separate decision
remain unchanged. Active I4 corrected source is8378a20a819de569ef7b10b747d7ba6c481f529e.
Read AGENTS, state, [I4 evaluation](V2-8I-4-EVAL.md) and
[corrected runbook](v2-8i-4-corrected-evidence/RUNBOOK.md). Fresh corrected focus48/48 and198bulkfiles2570/2570 pass,0fail/skip/cancelled;
remaining7gates are pending. independent source/helper delta is READY for8378a20/packetaa33b22
(17helper/20source/147retired artifact hashes verified). Fresh180.561s qualification/preparation passed;7659historical files/253PPTXs
plus5canonical originals were snapshotted/verified. Full corrected coordinator is
ACTIVE underroot (out/v2-8i-4-corrected-validation/coordinator.json/log; terminal
log coordinator-terminal.log). It runs all50finite jobs, each bounded/serial with
fresh resource admission. Browser7A is active. Do not start another coordinator
or touch the database slot. Root owns Git/test/database/Git slots. Reuse existing `/root/turn_contract_review` at
high effort only; no extra agents.

Source175's35jobs/231primary files2899passes plus47focused overlaps are RETIRED,
not transferred. A raw SQLite malformed UTF-8 probe failed0/1 despite shelloverall0
from a following cat. A real14-case oracle reproduced13pass/1fail. SQLite now
selects capped BLOB metadata then fatal-decodes into the same text rows; invalid
bytes fail privately and valid U+FFFD/BOM survive. An intermediate BOM false-refusal
(23/24) was corrected in the discovery input decoder. Corrected development24/24,
governance35/35 and snapshot/adoption guards12/12 pass; full gates remain pending.

Original source175 rawlogs/helper/plan/ownership and fresh screenshots/seven PPTXs
are preserved under docs/v2-8i-4-evidence/attempts/175a016 (including frozen-tree).
All7423historical files/246PPTXs+5canonical original bytes were restored/verified
before correction. Do not rerun source175 coordinator/prepare/finisher/cleanup.
New full source/helper/evidence namespace is docs/v2-8i-4-corrected-evidence;
scratch out/v2-8i-4-corrected-validation. Need fresh quiet qualification, full new
all-original snapshots and all238primary files/nine gates/4distinct native flows.
Never retag prior passes. Browser/Vite/build remain bounded serial; locale separate.

The one exclusive ownedI4 PostgreSQL15.18 service remains live, ID
e08ed2564f60da2fd9fffca5d57229d2f111640689a242f97f06d5a04ba571ce,
loopback5544. It was explicitly adopted for corrected8378a20 with original ownership
bytes/hash, exact identity/resources/listener and actualemptycatalog saved/fsynced
in corrected source-correction-adoption.json/owned-postgres.json. No second service
was created, old ownership untouched. New prepare requires --resume-owned-preparation
--prepare-only and has no creation path. After source/helper readiness, qualify
fresh180s then prepare with fresh30s admission/new snapshots. All slots remainroot;
no independent test/acceptance yet. Final cleanup only after all gates and explicit
reviewer DB release: save/fsync ACTUAL0catalog then one exact-ID stop/fresh verification.

Preserve `.agents/` and the two existing untracked master/architecture prompt files.
No real API/local inference, UI/provider/scheduler/retention change, deployment,
migration, index or SDK is in scope. Stop after complete I4 acceptance/cleanup and
pushed handoff. Future work only in the roadmap.
