# Release readiness checklist

Use this checklist before promoting a build to staging/production.

## 1) Required checks are green

- `CI Tests / Env validation tests`
- `CI Tests / Unit/API tests (excluding env group)`
- `Dependency Audit / npm audit (high/critical gate)`
- `Docs Consistency / Validate docs/workflow sync`

If applicable for deployment flow:

- `Post-Deploy Verify / Verify staging deployment`

If governance-strict branch protection is enabled:

- `Label Audit / Verify governance labels exist`

## 2) Security and dependency posture

- `npm audit` has `0` high and `0` critical findings.
- Any open moderate findings are documented and tracked as upstream/no-fix where applicable.
- No unresolved security exceptions were introduced in this release.

## 3) Runtime configuration sanity

- Repository Actions variable or secret `STAGING_URL` is set.
- Required production secrets are present in target environment:
  - `DATABASE_URL`
  - `ADMIN_PASSWORD_HASH`
  - `ADMIN_JWT_SECRET`
  - `USER_JWT_SECRET`
- Recommended multi-instance settings are present:
  - `REDIS_REST_URL`
  - `REDIS_REST_TOKEN`

## 4) Deployment verification

- Trigger `Post-Deploy Verify` after deploy.
- Confirm health and key auth paths are successful.
- If admin path checks are enabled, verify `STAGING_ADMIN_PASSWORD` / `STAGING_ADMIN_TOTP` secrets are set.

## 5) Rollback readiness

- Previous known-good release SHA is recorded.
- Rollback command/path is known by release owner.
- Owner and escalation contacts are identified for the release window.

## 6) Sign-off

- Feature owner sign-off
- Platform owner sign-off
- Security/dependency owner sign-off (for dependency-sensitive releases)
