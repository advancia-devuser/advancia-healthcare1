# Repository settings runbook

Use this document to configure GitHub repository settings for `main` end-to-end.

## 1) Branch protection (main)

Apply the policy in:

- `docs/branch-protection.md`

Required status checks to add (exact names):

- `CI Tests / Env validation tests`
- `CI Tests / Unit/API tests (excluding env group)`
- `Dependency Audit / npm audit (high/critical gate)`
- `Docs Consistency / Validate docs/workflow sync`

Optional by environment/release flow:

- `Post-Deploy Verify / Verify staging deployment`

Optional for governance-strict repos:

- `Label Audit / Verify governance labels exist`

### Apply branch protection in ~60 seconds (UI)

1. Open GitHub repo → `Settings` → `Branches`.
1. Edit existing rule for `main` (or click `Add rule` with branch pattern `main`).
1. Enable branch protection options: `Require a pull request before merging`, `Require approvals` (minimum `1`), `Require review from Code Owners`, `Require status checks to pass before merging`, `Require branches to be up to date before merging`, `Require conversation resolution before merging`, and `Include administrators`.
1. Add required checks: `CI Tests / Env validation tests`, `CI Tests / Unit/API tests (excluding env group)`, `Dependency Audit / npm audit (high/critical gate)`, and `Docs Consistency / Validate docs/workflow sync`.
1. Optional for governance-strict repos: add `Label Audit / Verify governance labels exist`.
1. Save changes.

## 2) Required repository variables and secrets

### Verify variables/secrets in ~60 seconds (UI)

1. Open GitHub repo → `Settings`.
1. Open `Secrets and variables` → `Actions`.
1. In **Variables**, verify `STAGING_URL` exists.
1. In **Variables**, optionally set strict metadata enforcement: `LABEL_AUDIT_FAIL_ON_DRIFT=true` (or leave unset/`false` for warning-only drift reporting).
1. In **Secrets**, verify either `STAGING_URL` exists or the variable above is set.
1. In **Secrets**, verify optional admin checks if used: `STAGING_ADMIN_PASSWORD` and `STAGING_ADMIN_TOTP`.
1. Save any missing values, then run `Post-Deploy Verify` via `workflow_dispatch`.

### Required for post-deploy verification workflow

Workflow file: `.github/workflows/post-deploy-verify.yml`

Set at least one of:

- Repository variable: `STAGING_URL`
- Repository secret: `STAGING_URL`

Optional (enables admin positive-path checks in the same workflow):

- Repository secret: `STAGING_ADMIN_PASSWORD`
- Repository secret: `STAGING_ADMIN_TOTP`

Optional (strict governance metadata enforcement in `.github/workflows/label-audit.yml`):

- Repository variable: `LABEL_AUDIT_FAIL_ON_DRIFT=true`
- Manual override: when running `Label Audit` via `workflow_dispatch`, set input `fail_on_drift` to `true` or `false` for that run (leave empty to use repository variable/default)
- Audit summary includes `Drift mode source` so operators can confirm whether input, repository variable, or default determined enforcement

CLI quick set/unset (`gh`) from repo root:

```bash
gh variable set LABEL_AUDIT_FAIL_ON_DRIFT --body "true" --repo advancia-devuser/advancia-healthcare1
gh variable delete LABEL_AUDIT_FAIL_ON_DRIFT --repo advancia-devuser/advancia-healthcare1
```

PowerShell equivalent:

```powershell
gh variable set LABEL_AUDIT_FAIL_ON_DRIFT --body "true" --repo advancia-devuser/advancia-healthcare1
gh variable delete LABEL_AUDIT_FAIL_ON_DRIFT --repo advancia-devuser/advancia-healthcare1
```

Manual dispatch override via GitHub CLI (`gh`):

```bash
gh workflow run label-audit.yml --repo advancia-devuser/advancia-healthcare1 -f fail_on_drift=true
gh workflow run label-audit.yml --repo advancia-devuser/advancia-healthcare1 -f fail_on_drift=false
```

PowerShell (same commands):

```powershell
gh workflow run label-audit.yml --repo advancia-devuser/advancia-healthcare1 -f fail_on_drift=true
gh workflow run label-audit.yml --repo advancia-devuser/advancia-healthcare1 -f fail_on_drift=false
```

### Required for local/runtime app deployment

Environment template: `.env.example`

Production-critical:

- `DATABASE_URL`
- `ADMIN_PASSWORD_HASH`
- `ADMIN_JWT_SECRET`
- `USER_JWT_SECRET`

Recommended for multi-instance correctness:

- `REDIS_REST_URL`
- `REDIS_REST_TOKEN`

Feature-dependent variables (set only if feature is enabled):

- `RESEND_API_KEY`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `TEXTBELT_API_KEY`
- `NEXT_PUBLIC_TRANSAK_API_KEY`, `NEXT_PUBLIC_MOONPAY_API_KEY`, `NEXT_PUBLIC_RAMP_API_KEY`
- `HEALTH_ENCRYPTION_KEY` (or `ENCRYPTION_KEY` alias)

## 3) Automation configured in this repo

- CI tests: `.github/workflows/ci-tests.yml`
- Dependency audit gate: `.github/workflows/dependency-audit.yml`
- Needs-triage reminder: `.github/workflows/triage-reminder.yml`
- Needs-triage auto-clear: `.github/workflows/triage-auto-clear.yml`
- Label governance audit: `.github/workflows/label-audit.yml`
- Docs/workflow consistency gate: `.github/workflows/docs-consistency.yml`
- Post-deploy verification: `.github/workflows/post-deploy-verify.yml`
- Dependabot updates: `.github/dependabot.yml`

## 4) One-time setup checklist

- Enable branch protection for `main` using `docs/branch-protection.md`
- Add `STAGING_URL` (variable or secret)
- Optionally add `STAGING_ADMIN_PASSWORD` and `STAGING_ADMIN_TOTP`
- Optionally set `LABEL_AUDIT_FAIL_ON_DRIFT=true` for fail-on-drift governance mode
- Confirm Actions are enabled and workflows can run
- Trigger `Dependency Audit` via `workflow_dispatch` once to validate setup
- Trigger `Post-Deploy Verify` via `workflow_dispatch` once with staging URL configured

## 5) Ongoing operations

- Keep Dependabot PRs enabled and review weekly batch updates
- Treat high/critical dependency findings as merge blockers
- Revisit unresolved moderate advisories when upstream fixable versions are released
- Apply PR labels consistently using `docs/label-glossary.md`
- Ensure `needs-triage` items receive owner + initial severity/domain classification within `1 business day`
- Confirm reminder comments from `.github/workflows/triage-reminder.yml` are acted on and label is removed after triage
- For manual reminder checks, run `.github/workflows/triage-reminder.yml` with optional `workflow_dispatch` inputs: `issue_number` (target one issue) and `hours_threshold` (default `24`)
- Ensure `.github/workflows/triage-auto-clear.yml` can remove `needs-triage` once owner + risk + domain labels are set (domain examples: `bug`, `enhancement`, `security`, `dependencies`, `ci`, `docs`, `release`)
- For manual remediation, run `.github/workflows/triage-auto-clear.yml` with `workflow_dispatch` input `issue_number` to evaluate a specific issue on demand
  - Command example: `gh workflow run triage-auto-clear.yml --repo advancia-devuser/advancia-healthcare1 -f issue_number=123`
- Keep `.github/workflows/label-audit.yml` enabled for `pull_request` and `push` to `main`, and use monthly/manual runs for periodic governance audits

## 6) Troubleshooting (common failures)

### `Post-Deploy Verify / Verify staging deployment` fails immediately

- Symptom: workflow logs contain `STAGING_URL is not set in repo variables or secrets`.
- Likely cause: neither Actions variable nor secret `STAGING_URL` is configured.
- Fix: add `STAGING_URL` in `Settings` → `Secrets and variables` → `Actions`, then rerun.

### Branch protection blocks merge with missing required checks

- Symptom: PR shows one or more required checks as `Expected — Waiting for status to be reported`.
- Likely cause: required check name in branch rule does not exactly match workflow/job check name.
- Fix: copy exact names from `docs/branch-protection.md` and update branch rule required checks.

### `Dependency Audit / npm audit (high/critical gate)` fails

- Symptom: audit summary reports `high` or `critical` > `0`.
- Likely cause: newly introduced vulnerable dependency path.
- Fix: update direct dependencies first, then use safe `overrides` if needed; rerun audit and tests before merge.

### `Docs Consistency / Validate docs/workflow sync` fails

- Symptom: checker reports missing references or missing required files.
- Likely cause: docs/workflow file moved, renamed, or referenced path not updated.
- Fix: update docs links and required references, then run `npm run check:docs-sync` locally.

### `Triage Reminder` `workflow_dispatch` input validation fails

- Symptom: workflow reports invalid `issue_number` or `hours_threshold`.
- Likely cause: non-numeric/invalid manual input values.
- Fix: set `issue_number` to a positive integer and `hours_threshold` to a positive number (or leave defaults).
- Note: summary output includes skip counters for pull requests, non-open issues, and issues without `needs-triage` label.

Manual run examples:

```bash
gh workflow run triage-reminder.yml --repo advancia-devuser/advancia-healthcare1 -f issue_number=123 -f hours_threshold=24
gh workflow run triage-reminder.yml --repo advancia-devuser/advancia-healthcare1 -f hours_threshold=48
```

### `Label Audit / Verify governance labels exist` fails

- Symptom: workflow summary lists missing governance labels.
- Likely cause: labels were deleted/renamed in repository settings.
- Fix: recreate missing labels, then rerun the workflow.
- Optional strict metadata enforcement: set repository variable `LABEL_AUDIT_FAIL_ON_DRIFT=true` to fail when label color/description differs from canonical metadata.
- If `workflow_dispatch` input `fail_on_drift` is provided, it must be exactly `true` or `false` (empty means fallback to variable/default).

Quick restore using GitHub CLI (`gh`) from repo root:

```bash
labels=(
  "security|d73a4a|Security hardening and vulnerability remediation"
  "ci|1d76db|CI/CD workflow and automation changes"
  "dependencies|0366d6|Dependency/version and lockfile updates"
  "docs|0e8a16|Documentation and runbook updates"
  "release|5319e7|Release planning, sign-off, and readiness"
  "needs-triage|fbca04|Requires owner assignment and initial classification"
  "risk:low|0e8a16|Low-risk change"
  "risk:medium|fbca04|Medium-risk change"
  "risk:high|d73a4a|High-risk or security-sensitive change"
)

for entry in "${labels[@]}"; do
  IFS='|' read -r label color description <<< "$entry"
  gh label create "$label" --repo advancia-devuser/advancia-healthcare1 --color "$color" --description "$description" || true
done
```

PowerShell equivalent:

```powershell
$labels = @(
  @{ Name = 'security'; Color = 'd73a4a'; Description = 'Security hardening and vulnerability remediation' },
  @{ Name = 'ci'; Color = '1d76db'; Description = 'CI/CD workflow and automation changes' },
  @{ Name = 'dependencies'; Color = '0366d6'; Description = 'Dependency/version and lockfile updates' },
  @{ Name = 'docs'; Color = '0e8a16'; Description = 'Documentation and runbook updates' },
  @{ Name = 'release'; Color = '5319e7'; Description = 'Release planning, sign-off, and readiness' },
  @{ Name = 'needs-triage'; Color = 'fbca04'; Description = 'Requires owner assignment and initial classification' },
  @{ Name = 'risk:low'; Color = '0e8a16'; Description = 'Low-risk change' },
  @{ Name = 'risk:medium'; Color = 'fbca04'; Description = 'Medium-risk change' },
  @{ Name = 'risk:high'; Color = 'd73a4a'; Description = 'High-risk or security-sensitive change' }
)

foreach ($label in $labels) {
  gh label create $label.Name --repo advancia-devuser/advancia-healthcare1 --color $label.Color --description $label.Description 2>$null
}
```

## 7) CI first-response playbook

| Failing check | Likely owner | First local command |
| --- | --- | --- |
| `CI Tests / Env validation tests` | Backend/platform engineer | `npx jest --config jest.config.cjs --runInBand __tests__/env.test.ts` |
| `CI Tests / Unit/API tests (excluding env group)` | Feature owner of changed code | `npm test` |
| `Dependency Audit / npm audit (high/critical gate)` | Dependency/security owner | `npm audit --json` |
| `Docs Consistency / Validate docs/workflow sync` | Docs/DevEx owner | `npm run check:docs-sync` |
| `Label Audit / Verify governance labels exist` (if required) | Repo admin / DevEx owner | Run `.github/workflows/label-audit.yml` via `workflow_dispatch` and restore missing labels |
| `Post-Deploy Verify / Verify staging deployment` | Release/platform owner | `bash scripts/post-deploy-verify.sh <STAGING_URL>` |

When a PR is blocked by required checks, use this order:

1. Open failing check summary and copy first actionable error line.
1. If `CI Tests` failed, reproduce locally with `npm test`, then fix test or fixture regressions and rerun until green.
1. If `Dependency Audit` failed, run `npm audit --json`, address high/critical findings first, then rerun tests.
1. If `Docs Consistency` failed, run `npm run check:docs-sync` and add missing links/references reported by the script.
1. If optional `Label Audit` is required and failed, run `.github/workflows/label-audit.yml` manually, restore missing labels, and if strict metadata is enabled align mismatched color/description (or unset `LABEL_AUDIT_FAIL_ON_DRIFT`).
1. If `Post-Deploy Verify` failed, confirm `STAGING_URL` exists in repo Actions variable/secret and rerun the workflow.
1. Push fix branch and confirm all required checks are green before merge.

## 8) Escalation triggers and handoff package

Escalate to **platform owner** when:

- A required workflow fails repeatedly after two clean reruns.
- Branch protection checks are stuck in `Expected` state due to check-name drift.
- Post-deploy verification fails after confirming `STAGING_URL` is present.

Escalate to **security/dependency owner** when:

- `Dependency Audit` reports `high` or `critical` vulnerabilities.
- A vulnerability fix requires major-version upgrades or risk acceptance.

Include this handoff package in the escalation note:

- PR link and commit SHA.
- Failing check name and run URL.
- First failing log lines (copy/paste).
- Commands run locally and their outputs summary.
- What was already attempted (rerun count, dependency updates, config checks).

## 9) Severity SLA targets

| Severity | Initial acknowledgment | Containment/fix target | Owner |
| --- | ---: | ---: | --- |
| Critical | 1 hour | Same business day | Security + Platform |
| High | 4 hours | 1 business day | Security/Dependency owner |
| Moderate | 1 business day | Planned in next dependency cycle | Dependency owner |
| Low | 2 business days | Backlog / opportunistic | Feature or dependency owner |

Notes:

- SLA targets are operational goals; use judgment for holidays and release freezes.
- Any severity affecting production auth/session integrity should be treated at least as `high`.

## 10) Release gate

Before shipping, run through:

- `docs/release-readiness-checklist.md`
- `docs/release-signoff-template.md`
