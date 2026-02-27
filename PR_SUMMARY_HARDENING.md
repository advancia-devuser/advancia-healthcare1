# PR Summary — API Malformed-Body Hardening

## What changed
- Standardized API request body parsing to safely handle malformed JSON and return `400` instead of bubbling parse failures.
- Added/extended regression tests to cover malformed JSON body handling across touched routes.
- Preserved existing business behavior while tightening request-shape validation and response consistency.

## Scope
- Auth + Admin routes (`admin/login`, `admin/2fa`, `auth/register`, admin cards/users/subscriptions/installments/bookings/payment-requests/withdrawals/wallet/ledger).
- User-facing operational routes (booking, bills, health reminders, payments qr/request, and related financial utility endpoints).

## Validation
- Route-level focused tests were run per hardening increment.
- Final full-suite status: **338 passed, 0 failed**.
- Repo-wide check for raw `await request.json();` in `app/api/**/route.ts`: **no matches**.

## Commit window
- Hardening range: `fc4b12c` → `93f95f1`
- Release notes doc: `RELEASE_NOTES_HARDENING.md`
