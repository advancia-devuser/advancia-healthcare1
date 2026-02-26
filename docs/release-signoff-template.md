# Release sign-off template

Use this template in PR descriptions or release notes for final approval.

## Release

- Target environment: 
- Planned window (UTC): 
- Release owner: 
- Rollback owner: 

## Pre-release checks

- [ ] `CI Tests / Env validation tests` is green
- [ ] `CI Tests / Unit/API tests (excluding env group)` is green
- [ ] `Dependency Audit / npm audit (high/critical gate)` is green
- [ ] `Docs Consistency / Validate docs/workflow sync` is green
- [ ] `docs/release-readiness-checklist.md` completed

## Security/dependency posture

- [ ] `npm audit` high = 0, critical = 0
- [ ] Any accepted moderate risks documented with owner and follow-up date

## Deployment verification

- [ ] `Post-Deploy Verify` executed against staging/target
- [ ] Health endpoint and auth/login path validated
- [ ] Admin path validated (if applicable)

## Rollback readiness

- [ ] Previous known-good SHA recorded
- [ ] Rollback path/command verified

## Final approvals

- [ ] Feature owner approved
- [ ] Platform owner approved
- [ ] Security/dependency owner approved (required for dependency-sensitive releases)

## Notes

- Exceptions/risk acceptance:
- Follow-up actions:
