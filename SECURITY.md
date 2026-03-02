# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

Only the latest release on the `main` branch receives security patches.

## Reporting a Vulnerability

**Do NOT open a public GitHub issue for security vulnerabilities.**

Please report vulnerabilities privately by emailing **<security@advancia.health>**.

Include the following in your report:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept
- Affected files or endpoints, if known

### What to expect

| Timeline         | Action                                         |
| ---------------- | ---------------------------------------------- |
| Within 48 hours  | Acknowledgement of your report                 |
| Within 7 days    | Initial assessment and severity classification |
| Within 30 days   | Fix deployed or mitigation plan communicated   |

We follow responsible disclosure. If the vulnerability is accepted, we will:

- Credit the reporter (unless anonymity is requested)
- Issue a patch and publish a security advisory via GitHub

If the report is declined, we will explain why.

## Security Architecture

This application implements multiple layers of defense:

- **Authentication**: JWT sessions with Redis-backed token blacklisting, PIN verification, TOTP 2FA, WebAuthn/passkeys, OTP via SMS/email
- **Authorization**: Role-based access control (USER / ADMIN) with per-route enforcement
- **Middleware**: CRON endpoint authentication, request tracing (X-Request-Id), rate limiting on auth endpoints, security headers (nosniff, DENY framing, strict referrer)
- **Data protection**: Encrypted health card data at rest, bcrypt password hashing, environment variable validation
- **Audit logging**: All admin and sensitive operations are recorded in the AuditLog table
- **Input validation**: All API routes validate and sanitize input; malformed JSON returns 400

## Environment Variables

Sensitive configuration **must not** be committed to version control. See `.env.example` for the required variables. In production:

- `CRON_SECRET` must be set (enforced by middleware)
- `ADMIN_PASSWORD_HASH` must be set (enforced at startup)
- `REDIS_REST_URL` and `REDIS_REST_TOKEN` must both be provided (enforced by `lib/env.ts`)
- `JWT_SECRET` must be a strong random value (≥ 32 characters)
