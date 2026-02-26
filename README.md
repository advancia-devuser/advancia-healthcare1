# Smart Wallets Quickstart (Next.js)

Use this template to get started with **embedded smart wallets** using [Alchemy Account Kit](https://www.alchemy.com/docs/wallets).

## ✨ Features

- Email, passkey & social login using pre‑built UI components
- Flexible, secure, and cheap smart accounts
- Gasless transactions powered by ERC-4337 Account Abstraction
- One‑click NFT mint (no ETH required)
- Server‑side rendering ready – session persisted with cookies
- TailwindCSS + shadcn/ui components, React Query, TypeScript

![Smart Wallet Quickstart](https://github.com/user-attachments/assets/2903fb78-e632-4aaa-befd-5775c60e1ca2)

## 📍 Network & Demo Contract

This quickstart is configured to run on **Arbitrum Sepolia** testnet, by default. A free demo NFT contract has been deployed specifically for this quickstart, allowing you to mint NFTs without any setup or deployment steps. The contract is pre-configured and ready to use out of the box.

## 🚀 Quick start

### Scaffold a new app

```bash
npm create next-app smart-wallets-quickstart -- --example https://github.com/alchemyplatform/smart-wallets-quickstart
cd smart-wallets-quickstart
```

### 🔧 Configure

Get your pre-configured API key and policy ID from the [Smart Wallets dashboard](https://dashboard.alchemy.com/services/smart-wallets/configuration) by viewing one of your configurations. You will get a default app, configuration, and sponsorship policy created for you to quickly start testing.

Once you have your keys, add them to your `.env.local` file.

```bash
cp .env.example .env.local      # create if missing
# add NEXT_PUBLIC_ALCHEMY_API_KEY=...
# add NEXT_PUBLIC_ALCHEMY_POLICY_ID=...
```

| Variable                        | Purpose                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_ALCHEMY_API_KEY`   | API key for your Alchemy [app](https://dashboard.alchemy.com/services/smart-wallets/configuration)          |
| `NEXT_PUBLIC_ALCHEMY_POLICY_ID` | Gas Manager policy ID for [sponsorship](https://dashboard.alchemy.com/services/smart-wallets/configuration) |

If instead you want to set up your own configurations from scratch you should:

1. Create a new Alchemy [app](https://dashboard.alchemy.com/apps)
2. Set up a new Smart Wallet [configruation](https://dashboard.alchemy.com/services/smart-wallets/configuration) for your app to specify login methods
3. Create a gas sponsorship [policy](https://dashboard.alchemy.com/services/gas-manager/configuration) for your app

Note: for production, you should [protect](https://www.alchemy.com/docs/wallets/resources/faqs#how-should-i-protect-my-api-key-and-policy-id-in-the-frontend) your API key and policy ID behind a server rather than exposing client side.

### Run your app

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), first **Login**, then try minting a new NFT.

Congrats! You've created a new smart wallet and sent your first sponsored transaction!

See what else you can do with [smart wallets](https://www.alchemy.com/docs/wallets/react/overview).

## 🗂 Project layout

```text
app/           # Next.js pages & components
components/ui/ # shadcn/ui primitives
lib/           # constants & helpers
config.ts      # Account Kit + Gas Sponsorship setup
tailwind.config.ts
```

## 🏗️ How it works

1. `config.ts` initializes Account Kit with your API key, chain, and Gas Sponsorship policy.
2. `Providers` wraps the app with `AlchemyAccountProvider` & React Query.
3. `LoginCard` opens the authentication modal (`useAuthModal`).
4. After login, `useSmartAccountClient` exposes the smart wallet.
5. `NftMintCard` uses `useSendUserOperation` to call `mintTo()` on the demo ERC‑721, with gas paid by the Paymaster.

## 📚 Docs & resources

- React Quickstart → [https://www.alchemy.com/docs/wallets/react/quickstart](https://www.alchemy.com/docs/wallets/react/quickstart)
- Gas Manager quickstart → [https://www.alchemy.com/docs/wallets/infra/quickstart](https://www.alchemy.com/docs/wallets/infra/quickstart)

## 🖥 Scripts

```bash
npm run dev     # start development server
npm run build   # production build
npm run start   # run production build
npm run lint    # lint code
```

## 🔐 Production security notes

- Set `ADMIN_PASSWORD_HASH` (bcrypt hash) for admin login. Plain `ADMIN_PASSWORD` is only a non-production fallback.
- Generate hash with:

```bash
npm run hash:admin -- 'your-strong-admin-password'
```

- Set `REDIS_REST_URL` and `REDIS_REST_TOKEN` to enable persistent rate limiting, nonce storage, and admin lockout state across instances.
- `REDIS_REST_URL` and `REDIS_REST_TOKEN` are validated as a pair (both required together; partial config fails in production).
- Keep `ADMIN_JWT_SECRET` and `USER_JWT_SECRET` strong and unique per environment.
- See `.env.example` for complete variable descriptions.

Post-deploy verification:

```bash
bash scripts/post-deploy-verify.sh https://your-domain.com
```

Optional admin positive-path validation:

```bash
ADMIN_PASSWORD='your-admin-password' ADMIN_TOTP='123456' bash scripts/post-deploy-verify.sh https://your-domain.com
```

GitHub Actions workflow:

- File: `.github/workflows/post-deploy-verify.yml`
- Trigger manually via `workflow_dispatch` or by `repository_dispatch` event type `post_deploy_verify`
- Required repo variable/secret: `STAGING_URL`
- Optional secrets for admin success-path check: `STAGING_ADMIN_PASSWORD`, `STAGING_ADMIN_TOTP`

Trigger `repository_dispatch` from terminal:

```bash
curl -X POST "https://api.github.com/repos/advancia-devuser/advancia-healthcare1/dispatches" -H "Accept: application/vnd.github+json" -H "Authorization: Bearer <GITHUB_TOKEN_WITH_REPO_SCOPE>" -d '{"event_type":"post_deploy_verify"}'
```

PowerShell equivalent:

```powershell
Invoke-RestMethod -Method Post -Uri "https://api.github.com/repos/advancia-devuser/advancia-healthcare1/dispatches" -Headers @{ Accept = "application/vnd.github+json"; Authorization = "Bearer <GITHUB_TOKEN_WITH_REPO_SCOPE>" } -Body '{"event_type":"post_deploy_verify"}'
```

Helper scripts (recommended):

```bash
GITHUB_TOKEN=<GITHUB_TOKEN_WITH_REPO_SCOPE> npm run trigger:post-deploy:dispatch
```

Dry-run preview (no API call):

```bash
bash scripts/trigger-post-deploy-verify.sh advancia-devuser advancia-healthcare1 post_deploy_verify --dry-run
```

```powershell
$env:GITHUB_TOKEN = "<GITHUB_TOKEN_WITH_REPO_SCOPE>"
npm run trigger:post-deploy:dispatch:ps
```

Test note: bash helper validation is enforced in Linux CI, while Windows environments validate the PowerShell helper path.

PowerShell dry-run preview:

```powershell
pwsh -File scripts/trigger-post-deploy-verify.ps1 -DryRun
```

CI workflow:

- File: `.github/workflows/ci-tests.yml`
- Runs on push/PR
- Splits `__tests__/env.test.ts` into its own job (`env-validation-tests`) and runs remaining tests in `unit-tests`
- Dependency audit workflow: `.github/workflows/dependency-audit.yml` (weekly + manual + package manifest changes on `main`; blocks only on high/critical)
- Triage reminder workflow: `.github/workflows/triage-reminder.yml` (hourly reminder comment for open `needs-triage` issues older than 24h)
- Triage auto-clear workflow: `.github/workflows/triage-auto-clear.yml` (removes `needs-triage` when owner + risk + domain labels are present)
- Label audit workflow: `.github/workflows/label-audit.yml` (runs on PRs, pushes to `main`, monthly schedule, and manual dispatch to verify required governance labels exist; set `LABEL_AUDIT_FAIL_ON_DRIFT=true` to fail on color/description drift, or override per manual run with `fail_on_drift` input)
	- Precedence: manual `fail_on_drift` input (if set) → `LABEL_AUDIT_FAIL_ON_DRIFT` repository variable → default `false`
	- Manual trigger examples: `gh workflow run label-audit.yml --repo advancia-devuser/advancia-healthcare1 -f fail_on_drift=true` or `-f fail_on_drift=false`
- Dependabot configuration: `.github/dependabot.yml` (weekly npm + GitHub Actions updates, grouped to reduce PR noise)
- Branch protection setup guide: `docs/branch-protection.md`
- Repository settings runbook: `docs/repository-settings-runbook.md`
- Release readiness checklist: `docs/release-readiness-checklist.md`
- Release sign-off template: `docs/release-signoff-template.md`
- Label glossary: `docs/label-glossary.md`
- Short PR description template: `docs/pr-description-short.md`
- PR template: `.github/pull_request_template.md`
- Issue templates: `.github/ISSUE_TEMPLATE/` (bug, security, change request)
- CODEOWNERS: `.github/CODEOWNERS`

### Dependency risk tracking (upstream)

As of 2026-02-26 (`npm audit`):

- `0` critical
- `0` high
- `6` moderate (all transitive and currently `fixAvailable: false`)

Current unresolved moderate packages:

- `@account-kit/react`
- `@solana/wallet-adapter-walletconnect`
- `@solana/wallet-adapter-wallets`
- `@walletconnect/solana-adapter`
- `@walletconnect/universal-provider`
- `lodash` (via walletconnect transitive chain)

Operational policy:

- Keep `@account-kit/*` on latest compatible versions.
- Recheck with `npm audit` on each dependency update PR.
- Remove this tracking note once upstream publishes fixable versions and the moderates clear.

## 🛂 License

MIT
