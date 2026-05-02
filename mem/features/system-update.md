---
name: System-Update
description: ZIP-Upload, HMAC-Manifest, Zwangs-Backup, atomarer Symlink-Switch, Healthcheck-Auto-Rollback, Live-Steps via SSE
type: feature
---

# System-Update (Step 8)

## Pipeline (Frontend-Steps 1:1)
1. **entpacken** — ZIP nach `staging/<uploadId>/extract/`, Bomb-Schutz (200 MB total / 50 MB/Datei / 2k Files / 20× Ratio).
2. **backup** — `createBackup({category:"pre-update"})` synchron, `safety_backup_id` am Lauf gemerkt.
3. **quarantaene** — `staging/<id>/extract` → `versions/<stamp>/`, atomarer Symlink-Swap via `current.tmp` + `rename`. `previous`-Symlink für Rollback.
4. **install** — `npm ci --omit=dev` im neuen Ordner (5 min Timeout, 50 MB Buffer, `execFile` ohne Shell).
5. **migrations** — DB-Kopie via `db.backup()`, neue Migrations im Probelauf — Fehler bricht ohne Swap ab (Swap ist Step 3, hier wird Code zurückgerollt).
6. **neustart** — `systemctl reload mycleancenter` (Dev: no-op).
7. **smoketest** — `GET /health` alle 5 s, max 60 s. Fail → Auto-Rollback.

## Daten-Garantie
`/var/lib/mycleancenter/` wird in keinem Step geschrieben oder gesperrt — nur das Code-Verzeichnis (`/opt/mycleancenter/`).

## Manifest-Vertrag
`manifest.json` im ZIP-Root. Felder: `appVersion` (semver), `schemaVersion` (≥ live), `createdAt`, `minBackendVersion`, `signature` (HMAC-SHA256 hex), optional `hinweise`.
- Signatur = HMAC über kanonisches JSON ohne `signature`-Feld, Key = `master.key`.
- `signManifest()` baut Manifeste — gleicher Key beim Build-Server.
- Schema-Downgrade verboten. App-Version muss strikt > installierte sein (außer Rollback).

## Lock-File
`/opt/mycleancenter/staging/.install.lock` verhindert parallele Updates. `reapStaleLock()` beim Server-Start räumt Lock auf (Backend-Boot bedeutet kein Update läuft).

## Rollback
- Manuell: `POST /system/update/rollback/:version` mit `{passwort}`. Bcrypt-Vergleich. 3 Fehlversuche → 15 min Sperre pro User.
- Automatisch: nach erfolgtem Swap, wenn smoketest fehlschlägt. Defekte Version wandert nach `versions/broken-<stamp>/`.

## SSE / Bus-Events
- `system:update:phase` `{laufId, stepId, status, label, detail?}` — pro Step.
- `system:update:lauf` `{laufId, status: laeuft|erfolg|fehler|rollback}` — Gesamtstatus.
- Frontend `useLiveEvents`: invalidiert `["system","update","historie"]` + `["system","update","lauf",laufId]`, Toast nur bei Erfolg/Fehler/Rollback (Phase löst keinen Toast aus).
- Frontend `useUpdateLauf` Polling-Fallback alle 10 s solange `status==laeuft|rollback`, Live-Indikator im Dialog liest `onSseStatus()`.

## Frontend-Anbindung (Step 9)
- `useValidateUpdate` schickt `multipart/form-data` mit Field `paket` direkt über `piApi.post`. Mock-Backend akzeptiert sowohl FormData als auch JSON-Fallback.
- `useAktuellerUpdateLauf` lädt beim Tab-Mount `GET /system/update/lauf/aktuell` und öffnet bei laufendem Lauf den Fortschritts-Dialog automatisch (Page-Reload-Reconnect).
- `useSystemInfo` adaptiert SQLite-Datumsformat (`YYYY-MM-DD HH:MM:SS`) zu ISO.
- `RollbackConfirmDialog` zählt 401 lokal (1/3, 2/3, 3/3), bei 429 Countdown bis Sperrzeit aus Fehlertext (Fallback 15 min).
- Install-Mutation mappt 409 (läuft bereits), 404 (Upload abgelaufen), 413 (zu groß) auf freundliche Toasts.

## Endpoints
- `GET /system/info`
- `GET /system/update/historie`
- `POST /system/update/validate` (multipart, max 200 MB, 5/min Rate-Limit)
- `POST /system/update/install/:uploadId` (async, antwortet sofort mit Lauf)
- `GET /system/update/lauf/aktuell` (für Page-Reload-Reconnect, 204 wenn nichts läuft)
- `GET /system/update/lauf/:id`
- `POST /system/update/rollback/:version`

## Dev-Modus
`appRoot()` zeigt auf `./dev-root/` statt `/opt/mycleancenter/`, `npm ci`/`systemctl` werden übersprungen, smoketest skippt im `testMode`.
