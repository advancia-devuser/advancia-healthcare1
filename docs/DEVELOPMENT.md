# Smart Wallets Development Guide

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Set up database
npm run docker:up
npm run db:deploy

# Start development
npm run dev
```

## 🛠️ Development Tools

### CLI Commands

```bash
npm run dev:cli          # Show all CLI options
npm run dev:health       # Check app health
npm run dev:db          # Check database connection  
npm run dev:secrets     # Generate new secrets
npm run dev:reset       # Reset application state
npm run deploy:check    # Pre-deployment validation
```

### Database Management

```bash
npm run db:reset        # Reset database schema
npm run db:deploy       # Deploy migrations
npm run db:generate     # Generate Prisma client
npm run db:studio       # Open Prisma Studio
```

### Docker Commands

```bash
npm run docker:up       # Start PostgreSQL container
npm run docker:down     # Stop PostgreSQL container
```

## 🧪 Testing

```bash
npm test               # Run all tests
npm run test:e2e       # Run E2E tests only
npm run type-check     # TypeScript validation
npm run lint           # Code quality check
```

## 📦 Build & Deploy

```bash
npm run build          # Production build
npm run start          # Start production server
npm run deploy:check   # Validate deployment readiness
```

## 🔧 VS Code Integration

- **F5** - Debug Next.js app
- **Ctrl+F5** - Debug Jest tests  
- **Shift+F5** - Debug API routes

## 📊 Monitoring Endpoints

- `/api/health` - Application health
- `/api/admin/stats` - Dashboard metrics
- `/admin` - Admin interface

## ⚡ Productivity Tips

1. Use `npm run dev:cli` for quick status checks
2. Set up environment with `npm run dev:secrets`
3. Monitor logs with admin dashboard
4. Use Docker for consistent database setup
5. Run `npm run deploy:check` before pushing
