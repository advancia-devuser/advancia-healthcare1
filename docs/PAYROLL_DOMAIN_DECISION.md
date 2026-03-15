# Payroll Domain Decision

## Current Status

`advanciapayroll.com` is currently redirecting to `https://advanciapayledger.com`, but that is an operational choice rather than a permanent requirement in this repository.

This repository is a separate smart-wallet application built on Next.js, Alchemy Account Kit, and Prisma. It is not the canonical production codebase for the main Advancia product domains.

## Recommended Decision Paths

- If `advanciapayroll.com` should continue acting as a pointer to the canonical production app, keep the redirect at the DNS/hosting layer and set `PAYROLL_REDIRECT_TARGET=https://advanciapayledger.com` in this repo only if requests can still reach this app.
- If `advanciapayroll.com` should serve this repository directly, remove the Hostinger redirect, point the domain at this Vercel project, leave `PAYROLL_REDIRECT_TARGET` unset, and set `NEXT_PUBLIC_APP_URL=https://advanciapayroll.com`.

## Operational Guidance

- Decide whether the payroll domain belongs to the canonical app or to this separate app before changing DNS.
- If payroll branding or payroll-specific features are needed here, treat that as a deliberate deployment decision rather than an accidental redirect artifact.
- Continue using `pdtribe181-prog/modullar-advancia` as the canonical production source for the main Advancia app domains.

## If This Repo Is Kept

- Treat it as smart-wallet R&D or a separate experimental product.
- Use a dedicated public or internal domain and dedicated infrastructure.
- Do not split one production domain across this repo and the canonical repo at the same time.