
# Step 0 — Backend-Scaffold

Ziel: Ein lauffähiges Backend-Grundgerüst, das wir auf dem Pi 5 starten können und das bereits alle Sicherheits- und Datentrennungsregeln einhält. **Noch keine Geschäftslogik** — nur das Fundament, auf dem alle weiteren Steps aufbauen.

## Was am Ende von Step 0 funktioniert

1. `npm start` im Backend-Ordner startet Fastify auf Port 8787.
2. SQLite-Datei wird automatisch in `/var/lib/mycleancenter/db/mycleancenter.db` angelegt (WAL aktiv).
3. Master-Key wird beim ersten Start einmalig in `/var/lib/mycleancenter/keys/master.key` erzeugt (chmod 600).
4. `GET /health` liefert JSON mit DB-Status, WAL-Status, Key-Status, Version, Uptime.
5. `GET /version` liefert App-Version + DB-Schema-Version.
6. Schema-Migrationen laufen automatisch beim Start (idempotent).
7. Backend ist im Frontend über Settings-konfigurierbare Backend-URL erreichbar — Frontend zeigt einen kleinen Verbindungsstatus-Indikator.

## Verzeichnis-Struktur (strikte Trennung)

```text
/opt/mycleancenter/current/        ← Code (read-only, austauschbar)
  backend/
    package.json
    src/
      server.ts             ← Fastify-Bootstrap
      config.ts             ← liest ENV: DATA_DIR, PORT, NODE_ENV
      db/
        index.ts            ← better-sqlite3 + WAL + backup-API
        migrate.ts          ← Migrations-Runner
        migrations/
          001_init.sql      ← nur schema_version-Tabelle
      crypto/
        masterkey.ts        ← Key erzeugen/laden (AES-256-GCM ready)
      routes/
        health.ts
        version.ts
      plugins/
        cors.ts
        errorHandler.ts
        logger.ts
    tsconfig.json

/var/lib/mycleancenter/             ← Daten (NIEMALS von Updates angefasst)
  db/mycleancenter.db
  db/mycleancenter.db-wal
  db/mycleancenter.db-shm
  keys/master.key             (chmod 600)
  uploads/                    (leer, für spätere Steps)
  backups/                    (leer, für Step 3)
  logs/
```

`DATA_DIR` ist per ENV überschreibbar (Default: `/var/lib/mycleancenter`). Im Dev-Sandbox nutzen wir `./data/` damit wir es testen können, ohne Pi-Pfade zu brauchen.

## Frontend-Anbindung in Step 0

Sehr minimal — wir bauen noch keine Features um:

- Neue Settings-Sektion **„Backend-Verbindung"**: Eingabefeld für Backend-URL (Default: `http://localhost:8787`, auf Pi später `http://mycleancenter.local:8787`).
- Kleiner Status-Indikator unten rechts (analog Drive-Status): grün = verbunden, grau = nicht erreichbar. Pollt `/health` alle 30 s.
- Backend-URL wird in `localStorage` gespeichert (das ist eine Geräte-Einstellung, nicht in DB).
- Ein API-Client-Wrapper (`src/lib/api.ts`) wird angelegt, den alle späteren Steps nutzen.

## Sicherheits- & Robustheits-Regeln (ab Step 0 verankert)

- **WAL-Mode erzwungen**: `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON;` beim Öffnen.
- **Master-Key niemals loggen**, niemals in Response zurückgeben, niemals in Backups im Klartext (kommt in Step 3).
- **Keine Schreiboperationen** auf `/var/lib/mycleancenter/` außerhalb der definierten Pfade.
- **Graceful Shutdown**: SIGTERM/SIGINT → Fastify close → `db.close()` (sauberer WAL-Checkpoint).
- **Fehler-Handler**: gibt nie Stacktraces an Client, loggt strukturiert in `logs/`.
- **CORS**: nur erlaubte Origins (LAN-IPs + lovable preview).

## Technische Details

**Stack**: Node 20 LTS (arm64-kompatibel), Fastify 4, better-sqlite3 11 (kompiliert auf Pi automatisch via prebuilds), TypeScript, tsx (für Dev), pkg/esbuild für Pi-Build (kommt in Step 11).

**Migrations-Runner**: Liest alle `migrations/*.sql` sortiert, vergleicht mit `schema_version`-Tabelle, führt fehlende in einer Transaktion aus. So können Steps 1–10 jeweils ihre eigenen `00X_*.sql` ergänzen.

**Health-Endpoint Response**:
```json
{
  "status": "ok",
  "version": "0.1.0",
  "schemaVersion": 1,
  "db": { "ok": true, "wal": true, "path": "/var/lib/.../db/mycleancenter.db" },
  "masterKey": { "present": true },
  "uptimeSec": 123
}
```

## Was Step 0 NICHT enthält (kommt später)

- Auth/Login (Step 1)
- Verschlüsselte Settings-Tabelle (Step 1)
- Kunden, Rechnungen, Angebote (Steps 2, 4, 7)
- Backups (Step 3)
- PDF, Mail, Drive (Steps 5, 6)

## Test-Plan (was du nach Umsetzung prüfst)

1. `npm install && npm run dev` im Backend startet ohne Fehler.
2. `curl http://localhost:8787/health` → 200 OK mit obigem JSON.
3. `./data/db/mycleancenter.db` und `./data/keys/master.key` existieren.
4. `master.key` hat Permissions 600.
5. Server zweimal stoppen/starten → keine doppelten Migrationen, Key bleibt gleich.
6. Im Frontend: Settings → Backend-URL eintragen → Indikator wird grün.
7. Backend stoppen → Indikator wird grau innerhalb 30 s.

## Nach Approval

Ich setze Step 0 vollständig um (Backend-Ordner anlegen, alle Dateien, Frontend-Indikator, Settings-Sektion), teste lokal im Sandbox, und melde mich mit „Step 0 fertig — bitte testen". Erst nach deinem OK gehen wir zu **Step 1 (Settings & Auth + verschlüsselter Credential-Store)**.
