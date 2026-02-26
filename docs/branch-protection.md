# Branch protection baseline (main)

Use this as the minimum policy for `main` in GitHub repository settings.

## Recommended protection rules

- Require a pull request before merging
- Require at least 1 approving review
- Require review from Code Owners
- Dismiss stale approvals when new commits are pushed
- Require conversation resolution before merge
- Require status checks to pass before merge
- Require branches to be up to date before merging
- Include administrators
- Do not allow force pushes
- Do not allow deletions

## Required status checks

Set these as required checks (exact names):

- `Env validation tests`
- `Unit/API tests (excluding env group)`

If you use staged deployment validation, also require this check for release branches/environments:

- `Verify staging deployment`

## GitHub settings path

`Settings` → `Branches` → `Branch protection rules` → `Add rule` (or edit existing for `main`).

## Quick setup checklist (main)

- Branch name pattern: `main`
- Enable **Require a pull request before merging**
  - Enable **Require approvals** (minimum `1`)
  - Enable **Require review from Code Owners**
  - Enable **Dismiss stale pull request approvals when new commits are pushed**
- Enable **Require status checks to pass before merging**
  - Required checks:
    - `Env validation tests`
    - `Unit/API tests (excluding env group)`
  - Enable **Require branches to be up to date before merging**
- Enable **Require conversation resolution before merging**
- Enable **Include administrators**
- Disable force pushes and deletions

## Optional stricter settings

- Require linear history
- Require signed commits
- Restrict who can push to matching branches
- Restrict who can dismiss pull request reviews

## Notes

- Code owner review depends on `.github/CODEOWNERS` being present and valid.
- `Verify staging deployment` is from `.github/workflows/post-deploy-verify.yml` and depends on `STAGING_URL` being configured.
- If you make it required but `STAGING_URL` is missing, merges will block.
