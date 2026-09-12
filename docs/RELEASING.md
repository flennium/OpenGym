# Releasing OpenGym

Run `npm ci`, `npm run check`, and `npm run dist`. Test the installer on a clean Windows account before publishing it.

Unsigned installers are suitable for internal testing but will trigger operating-system warnings. Public releases should configure Electron Builder signing secrets:

- Windows: `CSC_LINK` and `CSC_KEY_PASSWORD` for an Authenticode certificate.
- macOS: `CSC_LINK`, `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID` for Developer ID signing and notarization.

Never commit certificates, passwords, Apple credentials, or signing profiles. The release workflow consumes repository secrets only on version tags. Signing cannot be completed until the project owner supplies valid release identities.
