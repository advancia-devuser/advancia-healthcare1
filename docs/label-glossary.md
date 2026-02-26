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

Triage SLA for `needs-triage`:

- Assign an owner within `1 business day`.
- Set severity/domain classification within `1 business day`.
- Remove `needs-triage` once owner + initial classification are set.

## Risk labels

- `risk:low` — low-risk change; standard review path.
- `risk:medium` — non-trivial behavior/config impact, requires focused review and validation.
- `risk:high` — potentially user-impacting or security-sensitive change; requires explicit owner sign-off.

## Usage guidance

- Apply at least one **domain** label to every PR.
- Apply `release` for release PRs.
- Apply one risk label (`risk:medium` or `risk:high`) when risk exceeds low.
- Keep labels additive and explicit; avoid using `release` as a substitute for domain labels.

## Canonical metadata (for restore automation)

Use this mapping when recreating labels after accidental deletion/rename.

| Label | Color | Description |
| --- | --- | --- |
| `security` | `d73a4a` | Security hardening and vulnerability remediation |
| `ci` | `1d76db` | CI/CD workflow and automation changes |
| `dependencies` | `0366d6` | Dependency/version and lockfile updates |
| `docs` | `0e8a16` | Documentation and runbook updates |
| `release` | `5319e7` | Release planning, sign-off, and readiness |
| `needs-triage` | `fbca04` | Requires owner assignment and initial classification |
| `risk:low` | `0e8a16` | Low-risk change |
| `risk:medium` | `fbca04` | Medium-risk change |
| `risk:high` | `d73a4a` | High-risk or security-sensitive change |
