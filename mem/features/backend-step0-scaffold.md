---
name: Backend Step 0 — Scaffold
description: Fastify+SQLite-Scaffold im backend/-Ordner, Health-Endpoint, Master-Key, WAL, Frontend-Indikator und Settings-Tab fertig
type: feature
---

# Step 0 abgeschlossen

**Backend-Code** unter `backend/` (Repo-Wurzel, NICHT in `src/`):
- `backend/src/server.ts` — Fastify-Bootstrap, Graceful Shutdown, Error-Handler ohne Stacktrace
- `backend/src/config.ts` — `DATA_DIR` env, default `/var/lib/mycleancenter` (prod) bzw. `./data` (dev)
- `backend/src/db/index.ts` — better-sqlite3, **PRAGMA journal_mode=WAL**, foreign_keys=ON, synchronous=NORMAL, busy_timeout=5000, sauberer wal_checkpoint(TRUNCATE) beim Close
- `backend/src/db/migrate.ts` — idempotenter Migrations-Runner (liest `migrations/*.sql` sortiert, trackt in `schema_version`-Tabelle, alles in Transaktion)
- `backend/src/db/migrations/001_init.sql` — nur `schema_version`-Tabelle
- `backend/src/crypto/masterkey.ts` — AES-256-Key (32 Byte) wird beim ersten Start in `keys/master.key` mit chmod 600 erzeugt; Längen-Validierung beim Laden, niemals überschreiben
- `backend/src/routes/health.ts` — `GET /health` + `GET /version`

**Frontend** (Build-Output gegen `localStorage`-URL, default `http://localhost:8787`):
- `src/lib/api/backendUrl.ts` — `getBackendUrl()`/`setBackendUrl()` + Event-Subscribe
- `src/hooks/useBackendStatus.ts` — pollt `/health` alle 30 s, `useSyncExternalStore` für URL-Änderungen
- `src/components/layout/BackendStatusIndicator.tsx` — kleiner Punkt unten rechts, klickbar → Einstellungen
- `src/components/einstellungen/BackendVerbindungTab.tsx` — URL-Eingabe, Live-Status, Health-Details
- In `src/routes/__root.tsx` (Indikator) und `src/routes/einstellungen.tsx` (neuer Tab "Backend-Verbindung" in Gruppe "System") eingebunden

**Frontend-API-Client** (`src/lib/api/client.ts`) ist noch UNVERÄNDERT auf Mock — wird in Step 1 umgestellt, sobald echte Endpoints existieren.

## Test-Anleitung

```bash
cd backend
npm install
npm run dev   # → http://localhost:8787
curl -s http://localhost:8787/health | jq
ls -la backend/data/keys/master.key   # muss -rw------- sein
```

Im Frontend: Einstellungen → Backend-Verbindung → URL eintragen → Indikator wird grün.

## Was als Nächstes (Step 1)

Settings & Auth:
- `einstellungen`-Tabelle (key/value, AES-256-GCM für sensible Werte mit Master-Key)
- Endpoints `GET/PUT /einstellungen/:key`, `POST /einstellungen/:key/secret`
- Login (PIN/Passwort), HttpOnly-Session-Cookie
- API-Client (`src/lib/api/client.ts`) so umstellen, dass er `getBackendUrl()` als Base nutzt und Mock+Backend nebeneinander leben
