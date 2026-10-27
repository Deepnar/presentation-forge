# Presentation Forge handoff — 2026-10-27

Branch `v2`; push `origin/v2` only. V2-8I-5 is complete and independently accepted
at source `5cf5b5cff53c781291ba094163c68eb189bfbc66`, from I4 baseline
`8378a20a819de569ef7b10b747d7ba6c481f529e`. The separate
[decision](reviews/V2-8I-5-5cf5b5c.json) reviewed pushed packet `b0fa687`.
Read AGENTS, state, [contract](V2-8I-5-PLAN.md) and [evaluation](V2-8I-5-EVAL.md).
Source is frozen; later commits contain documentation/evidence only.

The human-approved bridge is Auto-only and disabled by default. Finite owner pickup
binds current account identity and existing budgets, settles known usage atomically,
retains unknown estimates, and delegates all turn/run effects to H/I2. Approved
execution requires no provider/secret lookup. No UI, HTTP wake, daemon, schema,
ledger or renderer change. No activation configuration or real API/local inference.

Required final tests: unit19/19, actual SQLite8/8 and CLI5/5, all0fail/skip/cancelled;
typecheck exited0. Directly affected governance36/36 also passed. Independent review
executed three new account-concurrency/cancellation/CLI-signal challenges,3/3pass,
0fail/skip/cancelled, separately from retained68 cases. All raw failures/corrections,
commands, counts and source hashes remain in docs/v2-8i-5-evidence. Shared I/O
pressure justified short serial headless checks only; no old bulk/browser/PG/build/
benchmark/native/render/GPU sweep ran. Unexecuted coverage is not green.

No root or reviewer test/worker remains. Temporary SQLite/loopback fixtures and
children closed; no persistent database/service slot was acquired. Original
untracked .agents/ and the two master/architecture prompt files remain untouched.
Historical/canonical artifact bytes and I4 generators/finishers were not touched.
Never resume those completed or retired helpers. I4's prior exact service is
absent/5544refused; pre-removal count/cause remain unavailable, accepted as an
operational provenance limit rather than certified cleanup. No service recreation.

Focused validation is the standing default in AGENTS/protocol: new/changed behavior
and affected boundaries, expand only for concrete risk or release requirements.
Known BYOK locale, inherited visual/native limits, single account-DB deployment,
unknown-usage retention, and unqualified live-provider behavior remain explicit.
No hard SQL deadline or atomic in-flight account revocation is claimed.

The later 2026-10-27 continuation prepared I6 in
[the roadmap entry](ROADMAP.md#assistant-authenticated-wake) and
[the bounded contract](V2-8I-6-PLAN.md). Entry HEAD be0e1af; plan814b89c is pushed.
The human then chose “Explicit wake endpoint (Recommended)”, authorizing scoped
implementation/offline validation, not activation, models or Assistant UI.
[Independent plan readiness](reviews/V2-8I-6-plan-814b89c.json) executed0tests and
requires a private sessions.user_id/account snapshot and rejection of late policy
opening after close/abort/deadline. Both are pinned before runtime code. No public
DTO→email→new account remapping. Explicit wake is an API action, not another human
button in the future Assistant. Accepted I5 source/state/gates remain unchanged
until I6 has implementation evidence and separate exact-source acceptance.

Root owns Git/test slots. Reuse the existing high-effort turn_contract_review for
later independent review; no new agents. Only docs/protocol checks ran during
planning. Follow the four focused new-behavior gates, retain actual failures and
counts, and stop after I6 acceptance/handoff. No dependent feature or deployment.
