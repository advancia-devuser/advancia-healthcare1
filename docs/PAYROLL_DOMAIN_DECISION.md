# Payroll Domain Decision

## Decision

`advanciapayroll.com` should remain a redirect-only domain.

This repository is a separate smart-wallet application built on Next.js, Alchemy Account Kit, and Prisma. It is not the canonical production codebase for the main Advancia product domains.

## Enforcement

- Middleware permanently redirects requests for `advanciapayroll.com` and `www.advanciapayroll.com` to `https://advanciapayledger.com`.
- This reduces the risk of accidentally serving the wrong application on the payroll domain.

## Operational Guidance

- Do not connect this repository to the live payroll domain as its primary application.
- If payroll branding or payroll-specific features are needed in the future, define that as a separate product initiative first.
- Continue using `pdtribe181-prog/modullar-advancia` as the canonical production source for the main Advancia app domains.

## If This Repo Is Kept

- Treat it as smart-wallet R&D or a separate experimental product.
- Use staging or internal domains only.
- Do not split production ownership across this repo and the canonical repo.