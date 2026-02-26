## Summary

- What changed:
- Why it changed:
- Risk level (low/medium/high):

## Scope

- [ ] Backend/API
- [ ] Frontend/UI
- [ ] Auth/Security
- [ ] Infra/CI/CD
- [ ] Docs only

## Security checklist

- [ ] No plaintext secrets added to code, logs, or docs
- [ ] Auth/session changes reviewed for cookie/JWT behavior
- [ ] Rate-limit/abuse protections preserved or improved
- [ ] `ADMIN_PASSWORD_HASH` requirement in production respected
- [ ] Redis env pair (`REDIS_REST_URL` + `REDIS_REST_TOKEN`) handled correctly

## Testing

- [ ] Local tests pass (`npm test`)
- [ ] Env validation tests pass (`__tests__/env.test.ts`)
- [ ] New/changed behavior covered by tests where practical
- [ ] Manual sanity checks performed (if applicable)

Test evidence (paste relevant output):

```text

```

## Deployment / rollback

- [ ] Backward compatibility considered
- [ ] Required env vars documented/updated
- [ ] Rollback steps identified

## Post-deploy verification

- [ ] Ran `bash scripts/post-deploy-verify.sh https://<target-domain>`
- [ ] Required checks green in CI (`CI Tests / Env validation tests`, `CI Tests / Unit/API tests (excluding env group)`, `Dependency Audit / npm audit (high/critical gate)`, `Docs Consistency / Validate docs/workflow sync`)
- [ ] If governance-strict branch protection is enabled, `Label Audit / Verify governance labels exist` is green
- [ ] If enabled, staging verification check green (`Post-Deploy Verify / Verify staging deployment`)

## Release sign-off (release PRs)

- [ ] Completed `docs/release-signoff-template.md` and attached to this PR (or linked equivalent release notes)

## Labels

- [ ] Added at least one domain label (e.g., `dependencies`, `security`, `ci`, `docs`)
- [ ] If this is a release PR, added `release`
- [ ] If risk is medium/high, added `risk:medium` or `risk:high`

## References

- Branch protection policy: `docs/branch-protection.md`
- Repository settings runbook: `docs/repository-settings-runbook.md`
- Release readiness checklist: `docs/release-readiness-checklist.md`
- Release sign-off template: `docs/release-signoff-template.md`
- Label glossary: `docs/label-glossary.md`
- CI workflow: `.github/workflows/ci-tests.yml`
- Post-deploy workflow: `.github/workflows/post-deploy-verify.yml`
