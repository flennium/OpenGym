# Backup and recovery

Use **Backup & recovery > Back up now** while signed in as Owner. OpenGym uses SQLite's online backup API, so the exported database is consistent while WAL mode is active.

Restore validates the SQLite header, runs `quick_check`, rejects newer schema versions, copies the current database to a timestamped safety file, validates a staged incoming copy, and only then replaces the live path. The app restarts after replacement.

If startup fails after a power loss, do not delete files from the application-data directory. Preserve `opengym.db`, `.safety-*`, and `.previous-*` files, then restore the newest known-good safety copy through a matching OpenGym version.
