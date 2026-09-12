# OpenGym product suggestions

These are ordered by the value they are likely to add after real front-desk use validates the workflow. Code-scanner kiosk check-in is now implemented; the security-sensitive extensions below remain deliberate follow-up work.

## Recommended next

1. **Guided import from spreadsheets** — map existing member CSV columns, preview validation failures, and import in one transaction.
2. **Optional encrypted backups** — password-protected backup files for gyms that copy databases to shared drives or USB media.
3. **Shared database provider** — retain SQLite for one-computer/offline gyms and add an asynchronous adapter for MySQL/MariaDB and PostgreSQL for multi-reception deployments, with TLS, secret storage, provider migrations, and contention tests.
4. **Automated encrypted off-site copies** — keep the local-first database while optionally mirroring encrypted backups to owner-controlled storage.

## Useful operational additions

- Configurable low-stock tracking for towels, drinks, supplements, and merchandise.
- Class schedules, capacity, reservations, and trainer assignment.
- Printable member cards or key labels containing the member's existing OpenGym code as a barcode or QR code.
- Opt-in local face recognition only after adding written member consent, template revocation/deletion, liveness detection, false-match thresholds, camera permissions, encrypted biometric templates, and a non-biometric fallback.
- Automated local backup rotation with clear disk-space limits and recovery previews.
- Duplicate-member detection using normalized phone and email values.
- An end-of-day cash reconciliation report separated by payment method and staff member.
- Optional membership pause limits and approval notes.
- Bulk actions for status changes, plan assignment, and CSV export.
- A read-only audit-log explorer with date, staff, action, and entity filters.

## Engineering improvements

- Replace the current broad renderer record types with generated types derived from the shared Zod contracts.
- Split each renderer module into its own lazy-loaded route as the application grows.
- Add migration rollback fixtures and recovery tests using intentionally interrupted database copies.
- Add signed installers and notarization once release identities are available.
- Add accessibility regression checks and keyboard-only workflow tests.
- Measure startup, search, and common action latency in CI to prevent performance regressions.

## Product principles to preserve

- Local-first and fully useful without an internet connection.
- No silent deletion of financial or attendance history.
- Fast front-desk paths should stay within one dialog and a small number of keystrokes.
- New features should not turn the dashboard into a decorative analytics page.
- Themes may change personality, but status colors and accessible contrast must remain consistent.
