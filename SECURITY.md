# Security policy

## Supported versions

Security fixes are made on the latest `0.1.x` release and the default branch.
Older snapshots are not maintained. Self-hosters should follow new releases and
rebuild their containers when an update is published.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/Deepnar/presentation-forge/security/advisories/new).
Do not open a public issue or discussion before a fix is available.

Include the affected version, installation mode, reproduction steps, impact and
any suggested mitigation. Remove API keys, session tokens, personal data and
private deck content from screenshots and logs.

Useful reports include authentication or authorization bypasses, cross-account
deck access, API-key exposure, unsafe upload or path handling, remote code
execution, and container defaults that expose private data. Provider billing
questions without a software vulnerability belong in Support, not in a security
advisory.

This is a small maintainer-run project and cannot promise a response SLA. A
report will be acknowledged and investigated as capacity permits; please allow
time for a coordinated fix before public disclosure.

## Self-hosting boundary

The root Compose bundle binds to localhost and is designed for a private
machine. Internet exposure requires the controls in [docs/DEPLOY.md](docs/DEPLOY.md),
including TLS, secure secrets, SMTP and an explicit retention policy. Operators
are responsible for host security, access control, backups, provider accounts
and keeping their deployment updated.
