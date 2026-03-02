# Smart Wallets App - Production Deployment Guide

## Deployment Readiness Checklist

### Completed Prerequisites

- [x] Build system optimized (Next.js 15.5.12)
- [x] All ENOENT errors resolved
- [x] WalletConnect shimmed and documented (see `lib/shims/walletconnect/keyvaluestorage.ts`)
- [x] Environment secrets generated
- [x] Database migrations ready
- [x] 840+ tests passing
- [x] Vercel configuration complete
- [x] Alchemy webhook processing implemented
- [x] Withdrawal signing with viem implemented
- [x] Standalone server copy script created

### Production Deployment Steps

#### 1. Repository Setup

```bash
# Initialize git (if not already done)
git init
git add .
git commit -m "Production ready: Smart Wallets app with Account Kit"

# Push to GitHub
git remote add origin <YOUR_GITHUB_REPO_URL>
git push -u origin main
```

#### 2a. Vercel Deployment (Recommended)

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy to Vercel
vercel --prod

# Link project to existing Vercel project (if applicable)
vercel --prod --confirm
```

#### 2b. Standalone / Docker Deployment

```bash
# Build and prepare standalone server
npm run build:standalone

# Run the standalone server
npm run start:standalone
# or: node .next/standalone/server.js

# Docker deployment
docker build -t smart-wallets-app .
docker run -p 3000:3000 --env-file .env smart-wallets-app
```

#### 3. Environment Variables (Production)

**Required variables for Vercel / Production:**

| Variable | Description |
| --- | --- |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Alchemy API key for blockchain access |
| `NEXT_PUBLIC_ALCHEMY_POLICY_ID` | Gas sponsorship policy ID |
| `NEXT_PUBLIC_CHAIN_ID` | Target chain (421614 = Arb Sepolia) |
| `DATABASE_URL` | Production PostgreSQL connection string |
| `USER_JWT_SECRET` | JWT secret for user authentication |
| `ADMIN_JWT_SECRET` | JWT secret for admin authentication |
| `ENCRYPTION_KEY` | AES encryption key (32 hex bytes) |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anonymous key |
| `ALCHEMY_WEBHOOK_SECRET` | Token for Alchemy webhook verification |
| `CRON_SECRET` | Bearer token for cron job authentication |

**Optional (for on-chain withdrawals):**

| Variable | Description |
| --- | --- |
| `HOT_WALLET_PRIVATE_KEY` | Private key (0x-prefixed hex) for the hot wallet that signs withdrawals. Without this, withdrawals are simulated. |

#### 4. Database Configuration

```bash
# Deploy migrations to production
npm run db:deploy

# Generate Prisma client for production
npm run db:generate
```

#### 5. Alchemy Webhook Setup

1. Go to [Alchemy Dashboard](https://dashboard.alchemy.com/) > Notify > Webhooks
2. Create an **Address Activity** webhook
3. Set the webhook URL to: `https://<your-domain>/api/webhooks/alchemy`
4. Set the **Auth Token** to match your `ALCHEMY_WEBHOOK_SECRET` env var
5. Add your users' smart account addresses to the webhook's monitored addresses

#### 6. Post-Deployment Verification

```bash
# Check health endpoint
curl https://<your-domain>/api/health

# Verify webhook endpoint
curl https://<your-domain>/api/webhooks/alchemy

# Verify admin dashboard
curl https://<your-domain>/admin

# Test authentication flow
# Visit: https://<your-domain>
```

### Production Configuration

#### Performance Optimizations

- [x] Next.js standalone output configured
- [x] Image optimization enabled
- [x] Webpack bundle optimization
- [x] Middleware security configured

#### Security Features

- [x] JWT authentication (user + admin)
- [x] Admin password hashing (bcrypt)
- [x] Environment variable encryption (AES-256)
- [x] CORS configuration
- [x] Rate limiting middleware
- [x] Webhook signature verification (Alchemy)
- [x] Cron job bearer auth

#### Monitoring & Cron Jobs

| Cron Path | Schedule | Purpose |
| --- | --- | --- |
| `/api/cron/deposits` | Every 30 min | Detect incoming deposits via Alchemy |
| `/api/cron/withdrawals` | Hourly at :05 | Process approved withdrawals on-chain |
| `/api/cron/notifications` | Hourly at :10 | Send pending notifications |
| `/api/cron/health-reminders` | Daily 8 AM | Health card reminders |
| `/api/cron/reconcile` | Daily 3 AM | Balance reconciliation |
| `/api/cron/subscriptions` | Daily 12:15 AM | Process subscriptions |
| `/api/cron/bills` | Daily 12:20 AM | Process bill payments |
| `/api/cron/installments` | Daily 12:25 AM | Process installments |
| `/api/cron/cards` | Daily 12:30 AM | Process card requests |
| `/api/cron/convert` | Every 15 min | Process pending conversions |

### Features Ready for Production

#### Authentication Systems

- **Email Authentication**: Fully functional
- **Passkey Authentication**: WebAuthn ready
- **Social Login**: Google OAuth integrated
- **WalletConnect**: Shimmed out (Account Kit v4.x dependency issue with Next.js 15 — see `lib/shims/walletconnect/keyvaluestorage.ts` for re-enablement steps)

#### Smart Wallet Features

- **Account Kit Integration**: v4.84.1
- **Alchemy Infrastructure**: Connected
- **Gas Sponsorship**: Policy configured
- **SSR Support**: Working with cookies

#### Blockchain Features

- **Alchemy Webhooks**: Real-time transaction detection, automatic ledger credits, in-app notifications
- **On-chain Withdrawals**: Viem-based signing with hot wallet (simulated when `HOT_WALLET_PRIVATE_KEY` is not set)
- **Multi-chain Support**: Arbitrum Sepolia, Base Sepolia, Ethereum Sepolia

#### Application Features

- **Dashboard**: Admin interface
- **API Routes**: 25+ endpoints
- **Database**: PostgreSQL with Prisma
- **Testing**: Comprehensive test suite (840+ tests)
- **Internal Ledger**: Atomic balance tracking with audit logs

### NPM Scripts Reference

| Script | Purpose |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Production build |
| `npm run build:standalone` | Build + prepare standalone server |
| `npm run start` | Start with Next.js (needs `.next`) |
| `npm run start:standalone` | Start standalone server |
| `npm test` | Run all tests |
| `npm run type-check` | TypeScript checks |
| `npm run db:deploy` | Apply migrations |
| `npm run db:studio` | Open Prisma Studio |
| `npm run deploy:check` | Pre-deploy verification |
