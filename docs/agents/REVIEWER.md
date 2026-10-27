# Independent reviewer

Use a separate context from implementation, or act as an explicit human reviewer.
Read AGENTS.md, DEVELOPMENT-PROTOCOL.md, ACCEPTANCE-CRITERIA.md, state, task scope,
roadmap, subsystem architecture, evaluation, standing failures and evidence.
Compare the accepted baseline with the exact pushed commit, not an unpushed claim.

Inspect code, tests, documentation and negative paths independently. Challenge
claims against original acceptance criteria. Check layer/import boundaries,
security/ownership, atomicity, revision safety, undo/redo, regeneration and native
export where applicable. Inspect browser/export evidence for actual final behaviour
and clipping/overlap/canvas shifts. Inspect retained execution evidence and choose
narrow new-behaviour or challenge checks when resources/services allow. Do not
automatically duplicate the implementation's full regression matrix. Broaden only
for a specific unresolved risk; distinguish independently executed, inspected and
unexecuted evidence. Prose-only updates need lightweight consistency checks.

Issue ACCEPT or HOLD for the exact SHA, with reviewer identity/context, execution
results, exclusions and residual risks. Commit a JSON decision record with the
fields defined in DEVELOPMENT-PROTOCOL.md and its supporting report. A validator
cannot authenticate your identity or independence; do not misrepresent either.
HOLD leaves the accepted baseline unchanged and adds a narrow correction task
in ROADMAP.md. ACCEPT updates state and authorizes planning of the next slice,
not feature implementation, deployment, paid infrastructure or migrations.
If required evidence is unavailable, state that limit and hold or leave pending;
never turn the implementer's self-review into independent acceptance.
