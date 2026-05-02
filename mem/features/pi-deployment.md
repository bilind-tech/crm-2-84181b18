---
name: Pi-Deployment
description: systemd-Unit, install.sh, sudoers, logrotate, Frontend-Health-Indikator, Datei-Layout
type: feature
---

# Pi-Deployment

## Artefakte (im Repo unter `backend/deploy/`)

- `systemd/mycleancenter.service` — systemd-Unit. Läuft als unprivilegierter User `mycleancenter`. Hardening: `ProtectSystem=strict`, `ReadWritePaths=/var/lib/mycleancenter`, `NoNewPrivileges`. ENV: `NODE_ENV=production`, `DATA_DIR=/var/lib/mycleancenter`, `PORT=8787`, `CORS_ORIGINS` muss explizit gesetzt sein.
- `install.sh` — idempotentes Setup-Skript. Legt User+Verzeichnisse an, installiert Node 20 LTS, kopiert systemd-Unit/sudoers/logrotate, startet den Service. `--check` für Dry-Run.
- `sudoers.d/mycleancenter` — erlaubt dem Service-User exakt `systemctl reload/restart/status mycleancenter` ohne Passwort. Wird vom System-Update-Runner via `sudo -n` aufgerufen.
- `logrotate.conf` — `/var/lib/mycleancenter/logs/*.log` daily, 14 Tage, compress.
- `README.md` — Schritt-für-Schritt Setup + Troubleshooting.

## Datei-Layout (Code/Daten strikt getrennt)

```
/opt/mycleancenter/
├── current   → releases/<stamp>     (Symlink, atomar getauscht)
├── previous  → releases/<vorgänger> (Rollback-Pointer)
└── releases/<stamp>/                (vom System-Update-Runner geschrieben)

/var/lib/mycleancenter/    ← Daten, NIE durch Updates angefasst
├── db/mycleancenter.db
├── keys/master.key        (0600)
├── uploads/
├── logs/app-YYYY-MM-DD.log
└── backups/{daily,weekly,monthly,safety,tmp}/
```

## Update-Flow

In-process via `backend/src/system/runner.ts` (kein externes Skript):
1. ZIP-Validate (Step 8) → staging
2. Pre-Update-Backup
3. Quarantäne: `staging → versions/<stamp>`, atomarer Symlink-Switch via `fs.rename`
4. `npm ci --omit=dev`
5. Migrations-Probelauf auf DB-Kopie
6. `sudo -n /bin/systemctl reload mycleancenter`
7. Healthcheck-Loop gegen `127.0.0.1:8787/health` (60s Timeout)

Bei Fehler nach Step 3 → Auto-Rollback (Symlink zurück, Service neu).

## Frontend-Health-Indikator

`src/components/layout/PiStatusIndikator.tsx` im AppSidebar-Footer. Pollt `/health` alle 30s über `piApi`. Drei Zustände:
- **online** (grün, pulsierend) — `status==="ok"`, zeigt `Online · vX.Y.Z`
- **wartung** (orange) — 503 oder `maintenance===true`
- **offline** (rot) — Fetch-Error / kein Backend

Tooltip mit Uptime (formatiert).

## Wichtig

- `/health` ist bewusst ohne Auth (Monitoring + Update-Smoketest).
- Im Dev-Modus (`NODE_ENV !== "production"`) macht der Runner KEINEN systemctl-Call — Backend läuft direkt aus dem Repo.
- Master-Key (`/var/lib/mycleancenter/keys/master.key`) gehört ZWINGEND ins Backup, sonst sind verschlüsselte Settings nach Restore unbrauchbar.
