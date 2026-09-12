# Contributing

Fork the repository, create a focused branch, and keep changes inside the local-first and privacy-preserving product boundaries. Install with `npm ci`, then run `npm run check` and `npm run test:e2e` before opening a pull request.

Pull requests should explain the user-visible outcome, schema or security impact, test coverage, and screenshots for UI changes. Never commit production databases, member media, credentials, signing identities, or generated installers.

Database changes require a forward migration, a test starting from an older schema, and a recovery test for failure paths. Privileged behavior belongs in the main process and must cross the allow-listed preload bridge with shared validation.
