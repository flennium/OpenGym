# Architecture

OpenGym is an offline-first Electron application. The sandboxed React renderer can only call the allow-listed, context-isolated preload bridge. Shared Zod contracts define mutation payloads and export inferred TypeScript types. The Electron main process owns authentication, SQLite, filesystem dialogs, backups, PDF receipts, and privileged window controls.

SQLite runs with WAL mode and foreign keys. Ordered migrations are recorded in `schema_migrations`; mutations and audit entries share transactions. Financial records and their receipt snapshots are immutable. Photos and member documents are stored as database blobs so removable source files are not dependencies.

The current renderer is intentionally a single operational bundle. Route-level code splitting is the next structural refactor: each page should move behind a `React.lazy` boundary after common table, dialog, and field components stabilize. This is documented rather than simulated with wrappers that would not produce real chunks.
