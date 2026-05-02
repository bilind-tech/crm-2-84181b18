
# Step 2 — Backup & Restore (Pi-Backend)

Ziel: Die Backup-/Restore-Mocks vollständig durch echte Backend-Funktionalität ersetzen. Daten dürfen niemals verloren gehen — weder bei normalem Betrieb, noch bei Update, noch bei Restore. Code/Daten-Trennung bleibt absolut.

## Was du am Ende hast

- Tägliche, automatische tar.gz-Backups auf der USB-SSD (DB + uploads + master.key + manifest).
- Sauberes Rotations-System (7 Daily, 4 Weekly, 12 Monthly + unbegrenzt Safety).
- „Backup jetzt erstellen"-Button funktioniert wirklich, mit Live-Fortschritt.
- Backup-Datei kannst du herunterladen (kompletter, transportierbarer Zustand des Pi).
- Backup-Datei kannst du wieder hochladen und der Pi spielt sie sicher zurück — mit automatischem Sicherheits-Backup VORHER und Migrations-Lauf NACH dem Restore.
- Alles im UI sichtbar und ehrlich: nur was wirklich auf der Platte liegt, taucht in der Liste auf. Laufende Backups sind als „in Arbeit" gekennzeichnet, nicht als „fertig".
- Garantie: Keine Daten-Verlust-Pfade. Bei Fehler im Restore → automatisches Rollback aufs Sicherheits-Backup.

## Architektur

```text
/var/lib/mycleancenter/                      ← Daten (NIE bei Updates angefasst)
├── db/mycleancenter.db (+ wal/shm)
├── keys/master.key
├── uploads/
└── backups/
    ├── daily/    (7 Stück, FIFO)
    ├── weekly/   (4 Stück, jeden Sonntag promoted)
    ├── monthly/  (12 Stück, am 1. des Monats promoted)
    ├── safety/   (vor jedem Restore + Update, manuell aufräumbar)
    └── tmp/      (in-Arbeit-Builds + Restore-Entpack-Bereich)
```

Eine Backup-Datei ist genau eine `.tar.gz`:

```text
backup-2026-05-02T030000Z-<id>.tar.gz
├── manifest.json     { appVersion, schemaVersion, createdAt, dbSha256, type, sizes }
├── db/mycleancenter.db        ← per SQLite Online-Backup-API erzeugt (konsistent)
├── uploads/...                ← rekursiv
└── keys/master.key            ← sonst sind verschlüsselte Settings nach Restore Schrott
```

## Backend-Module

### 1. Persistenz-Tabelle `backup_history`

Migration `004_backups.sql`:

```text
backup_history
  id TEXT PK
  filename TEXT
  category TEXT  ('daily'|'weekly'|'monthly'|'manual'|'pre-restore'|'pre-update')
  trigger TEXT   ('auto'|'manual'|'pre-restore'|'pre-update')
  size_bytes INTEGER
  status TEXT    ('in_progress'|'success'|'failed')
  started_at TEXT (ISO)
  completed_at TEXT NULL
  sha256 TEXT NULL
  schema_version INTEGER
  app_version TEXT
  error TEXT NULL
INDEX (status, started_at), (category, started_at)
```

Sichtbarkeitsregel hart durchgesetzt: Liste & Status zeigen nur `status='success' AND completed_at IS NOT NULL`. „In Arbeit" wird in einem getrennten kleinen Indikator angezeigt.

### 2. `backend/src/backup/`

| Datei | Aufgabe |
|---|---|
| `paths.ts` | typsicher daily/weekly/monthly/safety/tmp-Pfade, Dateiname-Builder, Parser für Datum/Kategorie |
| `manifest.ts` | Manifest erzeugen + validieren (Schema, Versions-Check, sha256) |
| `create.ts` | Snapshot erstellen: tmp-Ordner anlegen → SQLite `db.backup()` → uploads kopieren → master.key kopieren → manifest schreiben → tar.gz packen → sha256 → atomar `fs.rename` ins Ziel-Verzeichnis |
| `restore.ts` | Sicherheits-Backup → Wartungsmodus an → tar.gz nach `tmp/restore-<id>/` entpacken → Manifest validieren → SQLite-Connection sauber schließen → atomarer Swap von `db/`, `uploads/`, `keys/` → Migrations-Runner → DB neu öffnen → Wartungsmodus aus. Bei Fehler: automatisches Rollback aus dem Sicherheits-Backup |
| `rotation.ts` | FIFO-Aufräumen Daily/Weekly/Monthly. Promotion: am 1. eines Monats wird das jüngste Daily zusätzlich nach `monthly/` kopiert; Sonntags zusätzlich nach `weekly/` |
| `scheduler.ts` | `node-cron` Job: täglich um konfigurierter Uhrzeit (Default 03:00), nach Erfolg → Rotation. Konfigurierbar in Settings-Bereich `backup` (bereits im Schema) |
| `progress.ts` | Pro laufendem Backup In-Memory-Status: `{phase: 'sqlite'|'uploads'|'archive'|'rotate', percent}`. Frontend pollt /backup/in-arbeit, später ersetzbar durch SSE in Step 8 |
| `maintenance.ts` | Wartungsmodus-Flag (in-Memory + Datei `data/maintenance.flag`). Hook in Fastify: alle Routes außer `/health` und `/backup/restore-status` antworten 503 mit Retry-After |

### 3. Routen `backend/src/routes/backup.ts`

Alle authentifiziert (außer `/health`-Erweiterung).

| Methode | Pfad | Verhalten |
|---|---|---|
| GET | `/backup/historie` | nur sichtbare (success+completed) Einträge, neueste zuerst |
| GET | `/backup/in-arbeit` | aktuell laufende Builds + Live-Phase |
| POST | `/backup/erstellen` | startet Manual-Backup, antwortet sofort `{id}`, Worker läuft im Hintergrund |
| GET | `/backup/:id/download` | streamt die tar.gz mit Content-Disposition |
| POST | `/backup/upload` | nimmt Multipart entgegen, validiert Magic + Manifest, legt in `tmp/` ab, antwortet `{uploadId, vermutetesDatum, version, sizeBytes}` |
| POST | `/backup/:id/restore` | bestehende Backup-Datei auf dem Pi zurückspielen |
| POST | `/backup/upload/:uploadId/restore` | hochgeladene Datei zurückspielen, **Passwort des aktuellen Owners erforderlich** (zusätzlich zu Session) |
| GET | `/backup/restore-status` | im Wartungsmodus weiterhin erreichbar, liefert Phase + Progress |
| DELETE | `/backup/:id` | nur `manual` und `safety` löschbar; geplante Backups löscht ausschließlich die Rotation |

### 4. Settings-Bereich `backup` (bereits vorhanden, jetzt aktiv)

Wird vom Scheduler beim Boot UND bei jedem PATCH neu gelesen:
- `aktiv: boolean` (Master-Schalter Cron)
- `uhrzeit: "HH:MM"`
- `behaltenDaily/Weekly/Monthly`
- `driveSpiegel: boolean` — bleibt für Step 6, hier nur Flag, kein Upload
- `zielordner: string` — Default `dataPath('backups')`, abweichende Pfade nur wenn schreibbar (Boot-Check)

### 5. `/health`-Erweiterung

`/health/detail` (auth) bekommt:
- `lastBackupAt`, `lastBackupOk`, `nextScheduledBackupAt`
- `backupsDir.freeBytes`, `backupsDir.totalBytes`
- `maintenance: boolean`

## Sicherheits-Garantien (unverhandelbar)

1. **Sicherheits-Backup** wird VOR jedem Restore und VOR jedem Update geschrieben. Wenn dieser Schritt fehlschlägt → Restore wird abgebrochen, kein Daten-Touch.
2. **Atomarer Swap** beim Restore: `mv -T` (bzw. `fs.renameSync`) auf Verzeichnis-Ebene. Bei Fehler → Rollback aus dem Sicherheits-Backup, ebenfalls atomar.
3. **Schema-Downgrade verboten:** `manifest.schemaVersion > current` → 409, klare Fehlermeldung im UI.
4. **Master-Key:** ist im tar enthalten; ohne ihn werden verschlüsselte Settings (SMTP-Passwort, Drive-Tokens) nach Restore unbrauchbar.
5. **Upload-Validation:** vor dem Entpacken Magic-Bytes + Manifest-Schema prüfen, Größe-Limit (z. B. 2 GB), kein Pfad-Traversal beim Entpacken.
6. **Passwort-Bestätigung** bei Upload-Restore: Owner muss aktuelles Passwort eingeben (Schutz vor verlorener Session).
7. **Wartungsmodus** während Restore: alle anderen Routes 503, kein paralleler Schreibzugriff möglich.
8. **DB sauber schließen** vor Datei-Swap: alle WAL-Checkpoints flushen, dann `db.close()`. Nach Swap neu öffnen, Migrations-Runner laufen lassen.
9. **Audit-Log-Einträge** für jedes Backup, jeden Download, jeden Restore (mit Manifest-Daten).
10. **Keine Cloud-Abhängigkeit** für Restore — alles funktioniert offline auf der Platte.

## Frontend-Änderungen

### Routing

`src/lib/api/client.ts`:
- Prefix `"/backup/"` zur Pi-Routing-Liste hinzufügen.
- `/einstellungen/backup` und `/einstellungen/backup/historie` ans Pi-Backend (heute schon teilweise vorgesehen).

### Hooks `src/hooks/useApi.ts`

Bestehende Hooks (`useBackup`, `useBackupHistorie`, `useCreateBackup`, `useRestoreBackup`, `useUploadBackup`, `useRestoreUploadedBackup`) bleiben in der Signatur, sprechen jetzt aber gegen das echte Backend. Neu:
- `useBackupInArbeit()` — pollt während laufender Backups alle 600 ms.
- `useDownloadBackup()` — startet Download via Blob (mit Auth-Cookie).
- `useRestoreStatus()` — pollt während Restore (Wartungsmodus) alle 1 s, zeigt Phase.

### UI

`BackupTab.tsx`:
- „In Arbeit"-Badge mit Live-Phase + Prozent.
- Download-Button pro Eintrag (heute Stub).
- Vor Upload-Restore: Mini-Dialog „Aktuelles Passwort bestätigen" (gleiche Komponente wie Login).

`RestoreBackupDialog.tsx`:
- Klare Stufen: 1) Sicherheits-Backup wird erstellt, 2) Backend pausiert, 3) Daten werden ersetzt, 4) Migrationen laufen, 5) Backend startet wieder. Live-Fortschritt aus `/backup/restore-status`.
- Während Wartungsmodus: ganzseitiger Overlay „Wiederherstellung läuft — bitte nicht schließen", App pollt bis Backend wieder antwortet, danach Reload.

### Backend-Offline-Modus

Während des Restore-Wartungsmodus ist das Backend absichtlich für 503. Der bereits gebaute `backend-offline`-Modus (Step 1 Hardening) wird so erweitert, dass er ein Header-Feld `X-Maintenance: 1` erkennt und einen freundlichen „Wiederherstellung läuft"-Screen statt „Verbindung verloren" zeigt.

## Tests (`backend/test/backup.spec.ts`)

Pflicht-Tests, alle gegen einen Temp-Daten-Ordner:

1. Snapshot enthält DB + uploads + master.key + manifest, sha256 stimmt.
2. Manifest-Validation lehnt fremdes Schema (höher als aktuell) ab.
3. Rotation: 8 Tage simulieren → genau 7 Daily; Sonntag → Weekly entsteht; 1. eines Monats → Monthly entsteht.
4. Restore-Roundtrip: Kunde anlegen → Backup → Kunden löschen → Restore → Kunde wieder da, master.key intakt, verschlüsselte Settings entschlüsselbar.
5. Restore mit absichtlich kaputtem tar → Sicherheits-Backup wird automatisch zurückgespielt, Daten unverändert.
6. Sichtbarkeitsregel: laufendes Backup taucht NICHT in `/backup/historie` auf.
7. Wartungsmodus: alle Routes außer `/health` und `/backup/restore-status` antworten 503.
8. Upload-Restore ohne korrektes Passwort → 401, kein Datei-Touch.
9. Cross-User-Restore: nur Owner-User darf restoren.
10. DB-Backup nutzt SQLite-Backup-API (nicht `cp`), funktioniert mit aktivem Schreiber im selben Prozess.

## Reihenfolge der Umsetzung (1 Durchgang ohne Rückfragen)

1. Migration `004_backups.sql` + `dataPath`-Erweiterungen.
2. `backup/` Module (paths → manifest → create → rotation → scheduler).
3. Routen `/backup/*` + Wartungsmodus-Hook.
4. `restore.ts` + Sicherheits-Backup + Migrations-Runner.
5. `/health/detail`-Erweiterung.
6. Frontend-Routing-Prefix + Hooks aktualisieren.
7. `BackupTab` und `RestoreBackupDialog` an echte Endpoints + Live-Phasen.
8. Vitest-Suite.
9. Memory `mem/features/backend-step2-backup-restore.md` aktualisieren, Index ergänzen.

## Akzeptanzkriterien

- `npm run test` im Backend grün, alle 10 Backup-Tests bestehen.
- Manueller Smoke-Test: Backup erstellen → herunterladen → Daten ändern → hochladen + restoren → Daten wieder im Ursprungszustand, Login funktioniert weiter.
- Cron läuft 03:00, neuer Daily-Eintrag erscheint, ältester Daily verschwindet, Sonntags entsteht ein Weekly.
- Im UI keine „in-Arbeit"-Backups in der Erfolgs-Liste.
- Während Restore zeigt das Frontend einen klaren Fortschritts-Screen, kein Mock-Fallback.
- Garantie-Test: Während Backup-Erstellung Pi hart neu starten → kein „Phantom-Erfolg" in der Historie, da `completed_at` nie gesetzt wurde.

## Out of Scope

- **Drive-Spiegel**: Flag bleibt, Upload nach Drive kommt in Step 6.
- **SSE-Live-Updates**: Polling reicht für Step 2, SSE folgt in Step 8.
- **Verschlüsselte Backups**: Erst nach Step 6, falls überhaupt nötig (Pi ist offline im LAN).

Sag „approved" und ich fange mit der Umsetzung in der oben genannten Reihenfolge an.
