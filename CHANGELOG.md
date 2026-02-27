# Changelog

All notable changes to this project are documented in this file.

## 2026-02-26

### Added
- Added hardening documentation artifacts:
  - `RELEASE_NOTES_HARDENING.md`
  - `PR_SUMMARY_HARDENING.md`

### Changed
- Standardized API request body parsing to safely handle malformed JSON payloads across route handlers.
- Added malformed JSON regression coverage for affected API routes.
- Preserved endpoint behavior while improving invalid-body response consistency (`400` for malformed/invalid request bodies).

### Validation
- Full automated test suite passed after sweep completion (`338` passed, `0` failed).
- Repository-wide scan confirms no remaining raw `await request.json();` calls in `app/api/**/route.ts`.
