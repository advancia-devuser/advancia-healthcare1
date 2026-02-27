# API Malformed-Body Hardening Release Notes

## Summary
This release hardens API route handlers against malformed JSON request bodies by standardizing safe request parsing and explicit `400` responses for invalid request bodies.

Pattern applied:
- Use `await request.json().catch(() => null)` (or equivalent guarded parse)
- Reject non-object/invalid body payloads with `400`
- Add route-level regression tests for malformed JSON payloads

## Validation
- Full suite remained green through the hardening sweep.
- Final observed run: **338 passed, 0 failed**.

## Commit Range
- Start: `fc4b12c` — Harden payment request malformed body handling
- End: `93f95f1` — Standardize admin login body parse fallback

## Route Coverage by Area

### Auth
- `app/api/admin/login/route.ts` (`93f95f1`)
- `app/api/admin/2fa/route.ts` (`955666d`)
- `app/api/auth/register/route.ts` (`1bf5657`)
- Earlier in sweep:
  - `app/api/auth/email/login/route.ts`
  - `app/api/auth/email/register/route.ts`
  - `app/api/auth/pin/route.ts`
  - `app/api/auth/verify-email/route.ts`
  - `app/api/auth/2fa/route.ts`

### Admin APIs
- `app/api/admin/cards/route.ts` (`7818cd6`)
- `app/api/admin/users/route.ts` (`ab916b0`)
- `app/api/admin/subscriptions/route.ts` (`672e0be`)
- `app/api/admin/installments/route.ts` (`ce6d200`)
- `app/api/admin/bookings/route.ts` (`d14e440`)
- `app/api/admin/payment-requests/route.ts` (`080f818`)
- `app/api/admin/withdrawals/route.ts` (`74a87c0`)
- `app/api/admin/wallet/route.ts` (`968e8b0`)
- `app/api/admin/ledger/route.ts` (`a0e6009`)

### Payments / Booking / Billing
- `app/api/payments/request/route.ts` (`fc4b12c`)
- `app/api/payments/qr/route.ts` (`09426c3`)
- `app/api/booking/route.ts` (`5cc60c0`)
- `app/api/bills/route.ts` (`881e3a2`)

### Health
- `app/api/health/reminders/route.ts` (`b400263`)
- Earlier in sweep:
  - `app/api/health/cards/route.ts`
  - `app/api/health/transactions/route.ts`

### User-Facing Financial/Utility APIs
- `app/api/cards/route.ts` (`e18b7ab`)
- `app/api/budgets/route.ts` (`70a417a`)
- `app/api/contacts/route.ts` (`43ccd5d`)
- `app/api/bank-accounts/route.ts` (`80f53cb`)
- `app/api/notifications/route.ts` (`066f18a`)
- `app/api/devices/route.ts` (`5d69b60`)
- `app/api/gift-cards/route.ts` (`d2c840c`)
- `app/api/loyalty-cards/route.ts` (`ff6da36`)
- Earlier in sweep:
  - `app/api/conversions/route.ts`
  - `app/api/profile/route.ts`
  - `app/api/wallets/route.ts`
  - `app/api/installments/route.ts`
  - `app/api/withdrawals/route.ts`
  - `app/api/transfers/route.ts`
  - `app/api/subscriptions/route.ts`

## Notes
- Existing route semantics were preserved; hardening focused on malformed-body handling and defensive validation.
- Each route change was paired with focused regression coverage in `__tests__/*route*.test.ts` where available.
