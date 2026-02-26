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

## 2) Required repository variables and secrets

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
