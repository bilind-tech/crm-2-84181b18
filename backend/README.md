# MyCleanCenter Backend (Step 0 — Scaffold)

Lokales Backend für den Raspberry Pi 5. Fastify + SQLite (better-sqlite3, WAL),
strikte Trennung zwischen Code (`/opt/mycleancenter/current/`) und Daten
(`/var/lib/mycleancenter/`).

## Lokal starten (Dev)

```bash
cd backend
npm install
npm run dev
```

Standard-Port: **8787**. Daten landen in `./data/` (überschreibbar via `DATA_DIR`).

## Auf dem Pi starten (später)

```bash
DATA_DIR=/var/lib/mycleancenter PORT=8787 NODE_ENV=production node dist/server.js
```

## Endpoints (Step 0)

- `GET /health` — Status, DB, Master-Key, Uptime
- `GET /version` — App- und Schema-Version

## Was Step 0 NICHT enthält

Auth, Settings-Store, Kunden, Rechnungen, Backups, PDF, Mail, Drive — kommt in
Steps 1–11 (siehe `mem://features/backend-roadmap`).
