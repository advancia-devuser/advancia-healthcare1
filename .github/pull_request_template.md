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
- [ ] Required checks green in CI (`Env validation tests`, `Unit/API tests (excluding env group)`)
- [ ] If enabled, staging verification check green (`Verify staging deployment`)

## References

- Branch protection policy: `docs/branch-protection.md`
- CI workflow: `.github/workflows/ci-tests.yml`
- Post-deploy workflow: `.github/workflows/post-deploy-verify.yml`
