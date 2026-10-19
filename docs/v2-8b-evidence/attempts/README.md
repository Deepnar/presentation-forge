# Development attempts

These are development diagnostics, not execution evidence for the frozen source.
Final exact-source matrix output is indexed separately.

- Initial fail-first: runtime import unavailable (new behavior did not exist).
- Initial contract: AJV unique-object comparison failed on null-prototype cloned
  grants. Safe JSON cloning now precedes plain-data normalization and validation.
- First boundary pass: AJV was not yet in the agent dependency contract. The
  Node-only schema loader and AJV dependency are now explicitly recorded; package
  direction assertions remain intact.
- Multi-step fixture initially supplied a string tombstone; the scene contract
  requires an object. The fixture was corrected to `{id, semanticRef}`. Production
  validation was preserved.
- One schema-copy test draft had an extra closing parenthesis; corrected before
  behavioral execution. No runtime behavior changed for this syntax repair.
- A preliminary command named a nonexistent schema test. The corrected explicit
  drift-test command and later full inventory cover the actual file.
- PostgreSQL execution exposed pooled-client error listeners accumulating across
  transactions. Checkout listeners are now removed on release, including cold
  schema initialization; repeat transactions and warning observation passed.

The final development-only combined runtime run passed 67/67 before source freeze.
These repeats are excluded from final distinct totals. No failure was hidden by
weakening a behavior assertion or treating a missing backend as success.
