---
name: Backend Step 2 — Backup & Restore
description: Backend + Frontend für echtes Backup/Restore via Pi (tar.gz, Rotation, atomarer Restore, Wartungsmodus).
type: feature
---

## Backend
- Migration `004_backups.sql` mit `backup_history`-Tabelle.
- `backend/src/backup/`: paths, manifest, repo, progress, create, rotation, restore, scheduler, maintenance, types.
- Routen `backend/src/routes/backup.ts`:
  - `GET  /backup/restore-status` — auth-frei, im Wartungsmodus erreichbar.
  - `GET  /backup/historie` — abgeschlossene Backups.
  - `GET  /backup/in-arbeit` — laufende Backups mit `phase` + `percent`.
  - `POST /backup/erstellen` — 202, läuft im Hintergrund.
  - `GET  /backup/:id/download` — Stream-Download (tar.gz).
  - `POST /backup/upload` — multipart, validiert Magic-Bytes + manifest.json.
  - `POST /backup/:id/restore` und `/backup/upload/:uploadId/restore` — passwort-pflichtig.
  - `DELETE /backup/:id` — nur manuelle / pre-* erlaubt.
- Vor jedem Restore zwingend `pre-restore`-Sicherheitsbackup; bei Fehler atomarer Rollback.
- Rotation 7-4-12 + Sonderbackups via `node-cron` (Scheduler armt nach PATCH /einstellungen/backup neu).

## Frontend
- `src/lib/api/client.ts` routet `/backup/*` an Pi.
- Hooks in `src/hooks/useApi.ts`:
  - `useBackupHistorie` → `/backup/historie`
  - `useBackupInArbeit` → Live-Polling alle 800 ms wenn aktiv
  - `useRestoreStatus` → Polling im Wartungsmodus & während Restore
  - `useUploadBackup` → echter FormData-Upload via `piApi`
  - `useDeleteBackup`
- `BackupTab.tsx`:
  - Live-Phase + Prozentbalken aus `useBackupInArbeit`.
  - Restore-Banner mit Phase + Progress aus `useRestoreStatus`.
  - Echter Stream-Download `${BACKEND_URL}/backup/:id/download`.
  - Lösch-Button nur bei manuellen / pre-restore / pre-update Sonderbackups.
- `useBackendStatus` + `BackendStatusIndicator` kennen jetzt `maintenance` (gelb pulsierend).
- `fetchHealth` toleriert 503 mit Maintenance-JSON statt zu werfen.
