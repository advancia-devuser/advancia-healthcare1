# Label glossary

Use these labels consistently on PRs/issues for triage and reporting.

## Domain labels

- `dependencies` — package upgrades, lockfile updates, dependency policy/config changes.
- `security` — auth hardening, vulnerability remediation, secrets/config security posture.
- `ci` — workflow changes, branch protection/check behavior, automation reliability.
- `docs` — documentation-only or documentation-heavy changes.

## Release labels

- `release` — release preparation, release notes/sign-off, deployment readiness work.

## Triage labels

- `needs-triage` — new issue/PR requires initial owner assignment and severity/domain classification.

## Risk labels

- `risk:medium` — non-trivial behavior/config impact, requires focused review and validation.
- `risk:high` — potentially user-impacting or security-sensitive change; requires explicit owner sign-off.

## Usage guidance

- Apply at least one **domain** label to every PR.
- Apply `release` for release PRs.
- Apply one risk label (`risk:medium` or `risk:high`) when risk exceeds low.
- Keep labels additive and explicit; avoid using `release` as a substitute for domain labels.
