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

### Apply branch protection in ~60 seconds (UI)

1. Open GitHub repo → `Settings` → `Branches`.
2. Edit existing rule for `main` (or click `Add rule` with branch pattern `main`).
3. Enable:
	- `Require a pull request before merging`
	- `Require approvals` (minimum `1`)
	- `Require review from Code Owners`
	- `Require status checks to pass before merging`
	- `Require branches to be up to date before merging`
	- `Require conversation resolution before merging`
	- `Include administrators`
4. Add required checks:
	- `CI Tests / Env validation tests`
	- `CI Tests / Unit/API tests (excluding env group)`
	- `Dependency Audit / npm audit (high/critical gate)`
	- `Docs Consistency / Validate docs/workflow sync`
5. Save changes.

## 2) Required repository variables and secrets

### Verify variables/secrets in ~60 seconds (UI)

1. Open GitHub repo → `Settings`.
2. Open `Secrets and variables` → `Actions`.
3. In **Variables**, verify at least one staging target is present:
	- `STAGING_URL`
4. In **Secrets**, verify either `STAGING_URL` exists or the variable above is set.
5. In **Secrets**, verify optional admin checks if used:
	- `STAGING_ADMIN_PASSWORD`
	- `STAGING_ADMIN_TOTP`
6. Save any missing values, then run `Post-Deploy Verify` via `workflow_dispatch`.

### Required for post-deploy verification workflow

Workflow file: `.github/workflows/post-deploy-verify.yml`

Set at least one of:

- Repository variable: `STAGING_URL`
- Repository secret: `STAGING_URL`

Optional (enables admin positive-path checks in the same workflow):

- Repository secret: `STAGING_ADMIN_PASSWORD`
- Repository secret: `STAGING_ADMIN_TOTP`

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
- Docs/workflow consistency gate: `.github/workflows/docs-consistency.yml`
- Post-deploy verification: `.github/workflows/post-deploy-verify.yml`
- Dependabot updates: `.github/dependabot.yml`

## 4) One-time setup checklist

- Enable branch protection for `main` using `docs/branch-protection.md`
- Add `STAGING_URL` (variable or secret)
- Optionally add `STAGING_ADMIN_PASSWORD` and `STAGING_ADMIN_TOTP`
- Confirm Actions are enabled and workflows can run
- Trigger `Dependency Audit` via `workflow_dispatch` once to validate setup
- Trigger `Post-Deploy Verify` via `workflow_dispatch` once with staging URL configured

## 5) Ongoing operations

- Keep Dependabot PRs enabled and review weekly batch updates
- Treat high/critical dependency findings as merge blockers
- Revisit unresolved moderate advisories when upstream fixable versions are released

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

## 7) CI first-response playbook

| Failing check | Likely owner | First local command |
|---|---|---|
| `CI Tests / Env validation tests` | Backend/platform engineer | `npx jest --config jest.config.cjs --runInBand __tests__/env.test.ts` |
| `CI Tests / Unit/API tests (excluding env group)` | Feature owner of changed code | `npm test` |
| `Dependency Audit / npm audit (high/critical gate)` | Dependency/security owner | `npm audit --json` |
| `Docs Consistency / Validate docs/workflow sync` | Docs/DevEx owner | `npm run check:docs-sync` |
| `Post-Deploy Verify / Verify staging deployment` | Release/platform owner | `bash scripts/post-deploy-verify.sh <STAGING_URL>` |

When a PR is blocked by required checks, use this order:

1. Open failing check summary and copy first actionable error line.
2. If `CI Tests` failed:
	- Reproduce locally with `npm test`.
	- Fix test or update test fixture; rerun until green.
3. If `Dependency Audit` failed:
	- Run `npm audit --json`.
	- Address high/critical findings first, rerun tests.
4. If `Docs Consistency` failed:
	- Run `npm run check:docs-sync`.
	- Add missing links/references reported by script.
5. If `Post-Deploy Verify` failed:
	- Confirm `STAGING_URL` exists in repo Actions variable/secret.
	- Rerun workflow after updating missing values.
6. Push fix branch and confirm all required checks are green before merge.

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
