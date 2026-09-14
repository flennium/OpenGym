# Architecture

OpenGym is an offline-first Electron application. The sandboxed React renderer can only call the allow-listed, context-isolated preload bridge. Shared Zod contracts define mutation payloads and export inferred TypeScript types. The Electron main process owns authentication, SQLite, filesystem dialogs, backups, PDF receipts, and privileged window controls.

SQLite runs with WAL mode and foreign keys. Ordered migrations are recorded in `schema_migrations`; mutations and audit entries share transactions. Financial records and their receipt snapshots are immutable. Photos and member documents are stored as database blobs so removable source files are not dependencies.

## Source layout

```text
src/
├── main/
│   ├── index.ts                 Electron lifecycle and composition root
│   ├── database.ts              transactional domain repository
│   ├── migrations.ts            ordered SQLite schema upgrades
│   ├── ipc/                     privileged handlers grouped by domain
│   │   ├── member.ts            members, photos, documents, and faces
│   │   ├── operations.ts        plans, memberships, attendance, and kiosk
│   │   ├── administration.ts    settings, reports, audit, and recovery
│   │   └── receipt.ts           immutable PDF receipt generation
│   └── face-recognition.ts      local InsightFace adapter
├── preload/index.ts             narrow context-isolated bridge
├── renderer/
│   ├── main.tsx                 React composition root
│   ├── app/runtime.tsx          bridge client, themes, and global dialogs
│   ├── components/ui.tsx        shared accessible UI primitives
│   ├── features/                screens grouped by business capability
│   └── styles/                  foundation, themes, components, responsive
└── shared/contracts.ts          Zod IPC schemas and inferred public types
```

Operational screens load through `React.lazy` boundaries, producing real feature chunks in the production bundle. The kiosk remains eagerly loaded because HID scanners can send an identifier immediately after navigation and must not lose those keystrokes while a route chunk is loading.

Entry files should remain composition roots. New renderer behavior belongs in the relevant `features` module, new privileged endpoints in the matching `ipc` module, and schema changes in `migrations.ts`. Shared visual behavior belongs in `components/ui.tsx`; avoid recreating tables, dialogs, or form controls inside individual screens.
