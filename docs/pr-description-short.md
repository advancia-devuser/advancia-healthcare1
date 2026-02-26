# PR Description (Short)

## Title

Harden auth persistence and admin security; add CI/governance automation

## Summary

- Migrated auth abuse controls to persistent-capable logic (Redis REST when configured, fallback otherwise).
- Hardened admin login with bcrypt hash-first validation, production guardrails, progressive lockout, and `Retry-After`.
- Switched sensitive routes to persistent limiter + one-time nonce flow.
- Added centralized env validation (`ADMIN_PASSWORD_HASH` in prod; Redis URL/token pair validation).
- Added operational scripts for post-deploy verification, dispatch triggering (bash + PowerShell, dry-run), and admin hash generation.
- Added CI/governance assets: test-split workflow, post-deploy workflow, CODEOWNERS, PR/issue templates, branch-protection guide.
- Expanded tests (env validation + dispatch helper dry-run + persistent limiter coverage).

## Validation

- Local tests: **28 passed, 0 failed**.

## Required env updates

- `ADMIN_PASSWORD_HASH`
- `REDIS_REST_URL` + `REDIS_REST_TOKEN` (if using Redis-backed persistence)
- Existing JWT secrets remain required (`ADMIN_JWT_SECRET`, `USER_JWT_SECRET`)

## Rollout checklist

- [ ] Set/rotate production secrets
- [ ] Confirm branch protection requires CI checks + code owner review
- [ ] Run post-deploy verify script on staging/prod
- [ ] Monitor auth/login lockout metrics after release
