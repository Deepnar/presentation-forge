# V2-8H plan readiness review

**READY_FOR_POLICY_DECISION** for proposed plan
`9ead920004a6c6b83678ccc25852ad69d05395fe`.
Reviewer/context: `/root/native_id_review`, separate from plan author `/root`.
Accepted product baseline remains
`45c2c4c84581f41d1b2ef4ca61d15c067b8562a9`.

This is a planning review, **not implementation acceptance or human data-policy
approval**. The proposed owner-only, project-linked visible-chat retention policy
and its rolling-lifetime alternative remain a human decision in
[the canonical roadmap entry](../ROADMAP.md#assistant-turn-approval-contract).

The revised [contract](../V2-8H-EVAL.md) resolves the concrete plan findings:

- Automatic recovery requires zero dispatched exchanges in the entire turn.
  Lost volatile continuation after any dispatch requires user action, preserving
  known usage without automatic history reconstruction, retry or rebilling.
- Exact content/metadata/record limits, fixed cumulative counters and bounded
  cross-generation settlement slots prevent indefinite tombstones. Clear removes
  conversation/proposal copies, preserves existing run/history authority and
  usage admission, and cannot permanently exhaust a project through old row counts.
- Required generation/revision inputs fence cleared requests. Decisions replay
  their committed outcome after ownership/generation checks and before new
  expiry/revision checks. Approval/enqueue and cancel/clear use internal transaction
  seams rather than nested public runtime calls, with composed pre-commit guards.
- Immutable preparation, approval and execution deadline relationships are stated.
  One preparing/awaiting-decision turn, expiring leases and turn fences bound
  concurrency. Storage capacity is reserved before dispatch independently of
  provider output-token admission; usage/status reconciliation remains possible
  at capacity. New reply/plan bounds preserve the existing provider/parser limits.
- The browser remains the authoring workspace; Microsoft PowerPoint qualification
  applies to exports. The scene, command engine and existing run cursor remain
  authoritative. Assistant/search/creation integration remains separately scoped.

No remaining concrete plan finding blocks presenting the retention choice. The
proposal explicitly withholds implementation permission and preserves the later
implementation inventory and exact-source independent-review gates.

Verification was source/prose and read-only Git inspection only. Product/test/
tooling/schema source is unchanged from the accepted product baseline. **Zero
tests, database operations, provider calls, local inference, services, builds,
browsers or benchmarks** executed for this plan review. No user data, historical
archives or original untracked paths were changed. Only this report and its JSON
record were added; state and product acceptance were not altered.
