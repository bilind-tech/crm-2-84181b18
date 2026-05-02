## Step 8 — System-Update + Rollback (Backend)

Ziel: Das Frontend (`SystemUpdateTab.tsx` + `useSystemInfo/useValidateUpdate/useInstallUpdate/useUpdateLauf/useRollbackUpdate`) bekommt sein echtes Pi-Backend. Alle Endpoints, die heute noch ans Mock-Backend gehen, werden durch echte Fastify-Routen ersetzt — mit ZIP-Upload, Manifest-Validierung, erzwungenem Sicherheits-Backup, atomarem Symlink-Switch und automatischem Healthcheck-Rollback. Daten-Verzeichnis wird in keinem Schritt angefasst.

### 1. Datenmodell — Migration `011_system_update.sql`

- `system_update_lauf`
  - `id` TEXT PK, `gestartet_am` DATETIME, `beendet_am` DATETIME?
  - `quelle` TEXT (`upload`/`rollback`), `paket_version` TEXT, `paket_sha256` TEXT, `paket_groesse` INT
  - `vorherige_version` TEXT, `neue_version` TEXT
  - `status` TEXT (`laufend`/`erfolg`/`fehler`/`zurueckgerollt`)
  - `aktueller_step` TEXT, `fehler_text` TEXT?
  - `user_id` TEXT, `safety_backup_id` TEXT? (FK auf backup-Tabelle)
- `system_update_step` (Live-Steps für UI)
  - `id` TEXT PK, `lauf_id` TEXT FK ON DELETE CASCADE
  - `key` TEXT (`upload`,`validate`,`safety-backup`,`extract`,`deps`,`migrate-dry`,`swap`,`reload`,`healthcheck`,`cleanup`)
  - `label` TEXT, `status` TEXT (`pending`/`laufend`/`erfolg`/`fehler`/`uebersprungen`)
  - `gestartet_am`, `beendet_am`, `detail` TEXT?, `reihenfolge` INT
- `system_update_paket` (Upload-Staging, kurzlebig)
  - `id` TEXT PK, `dateiname` TEXT, `groesse_bytes` INT, `sha256` TEXT
  - `manifest_json` TEXT, `staging_pfad` TEXT, `gueltig_bis` DATETIME, `validiert` BOOL
- Indexe: `system_update_lauf(gestartet_am DESC)`, `system_update_step(lauf_id, reihenfolge)`

### 2. Pfad-Layout (Pi)

```text
/opt/mycleancenter/
  current -> versions/2026-05-02T12-00-00Z/
  versions/<ts>/             aktuelle + 1 Vorgänger (max 2)
  staging/<uploadId>/        entpackte ZIPs vor Swap
  safety-current/            Symlink auf letzten erfolgreichen Stand
```

`/var/lib/mycleancenter/` wird NIE berührt — keine Reads-mit-Lock, keine Schreibops.

### 3. Backend-Module

**`backend/src/system/paths.ts`** — Singleton mit `appRoot()`, `currentLink()`, `versionsDir()`, `stagingDir(id)`. Im Dev-Modus zeigt alles auf `./dev-root/` damit lokal ohne sudo getestet werden kann.

**`backend/src/system/manifest.ts`** — `validateManifest(json)`:
- Pflichtfelder: `appVersion` (semver), `schemaVersion` (≥ aktuelle), `createdAt`, `minBackendVersion`, `signature` (HMAC-SHA256 über Datei-SHA mit Master-Key — verhindert Fremd-ZIPs).
- Schema-Downgrade verboten.
- App-Version muss strikt > installierte sein (außer `quelle=rollback`).

**`backend/src/system/zip.ts`** — `extractZipSafe(file, target)`:
- Stream-basiert via `unzipper`, max 200 MB Gesamtgröße.
- Zip-Bomb-Schutz: max 500 Dateien, max 50 MB pro Eintrag, max 5× Kompressionsverhältnis.
- Pfad-Sanitizing (`..` und absolute Pfade verboten).

**`backend/src/system/runner.ts`** — Kern. State-Machine über `system_update_step`. Jeder Step:
1. Setze Status `laufend`, emit Bus-Event `system:update:phase`.
2. Führe Aktion aus.
3. Setze Status `erfolg`/`fehler`. Bei Fehler → kompletter Lauf abbrechen, ggf. Rollback.

Steps in Reihenfolge:
1. **upload** (im Validate-Endpoint vorgelagert, hier nur referenziert)
2. **validate** — Manifest + Signatur erneut prüfen
3. **safety-backup** — `backup.create({type:"safety", reason:"pre-update"})` aus Step 2-Lib synchron, ID merken
4. **extract** — ZIP nach `staging/<uploadId>/` (existiert ggf. schon → wiederverwenden)
5. **deps** — `npm ci --omit=dev` im Staging-Ordner; stdout/stderr → `detail`
6. **migrate-dry** — DB nach `tmp.sqlite` kopieren, alle neuen Migrationen darauf laufen lassen, dann verwerfen. Fehler → Abbruch ohne Swap
7. **swap** — atomar: `versions/<ts>/` = `staging/<id>/` (move), `current.tmp -> versions/<ts>`, `mv -T current.tmp current`. Vorherigen Symlink in `previous` merken
8. **reload** — `systemctl reload mycleancenter` via `child_process.execFile` (im Dev: No-Op)
9. **healthcheck** — alle 5 s `GET http://localhost:8787/health`, max 60 s. Fail → automatischer Rollback (Symlink zurück, neuen Code nach `versions/broken-<ts>/`, Lauf-Status `zurueckgerollt`)
10. **cleanup** — alte `versions/` außer aktuell+previous löschen; Staging-Ordner löschen

**Zentrale Garantie:** vor Step 7 (Swap) wird **nichts** am laufenden System verändert. Bricht etwas vorher ab, ist Service unverändert weiter.

**`backend/src/system/info.ts`** — `getSystemInfo()`: liest `package.json` (App-Version), `schema_version`, RAM/Disk via `os.totalmem`/`statvfs`, Kernel via `os.release()`. Gibt das `SystemInfo`-Format aus `src/lib/api/types.ts` zurück.

**`backend/src/system/repo.ts`** — `recordLauf`, `updateLaufStep`, `listHistorie` (max 20), `getLauf(id)`, `markRollback`. Schreibt + emittiert `system:update:phase` über Bus → SSE pickt es auf (Step 7 ist live).

### 4. REST-Routen — `backend/src/routes/system.ts`

Alle Routen sind admin-only (vorerst: jeder eingeloggte User; Rollen kommen später). Rate-Limit: Validate 5/min, Install 1 gleichzeitig (Lock-File `staging/.install.lock`).

| Methode | Pfad | Zweck |
|--|--|--|
| `GET` | `/system/info` | Versionen, Schema, RAM, Disk, Uptime, lastUpdate |
| `GET` | `/system/update/historie` | Liste `InstallierteVersion[]` aus `system_update_lauf` |
| `POST` | `/system/update/validate` | Multipart-Upload (max 200 MB), entpackt nur `manifest.json`, prüft, gibt `UpdatePackageInfo` mit `uploadId` |
| `POST` | `/system/update/install/:uploadId` | Startet Runner asynchron, antwortet sofort mit `UpdateLauf` (Status `laufend`) |
| `GET` | `/system/update/lauf/:id` | Aktueller Stand inkl. aller Steps |
| `GET` | `/system/update/lauf/aktuell` | Falls ein Lauf läuft (für Reconnect nach Page-Reload) |
| `POST` | `/system/update/rollback/:version` | Body `{passwort}` → bcrypt-Vergleich → Sicherheits-Backup → Symlink-Swap auf `versions/<version>/` |
| `POST` | `/system/update/abbruch/:laufId` | Nur erlaubt vor Step 7 (Swap); danach geht nur Rollback |

**Zugriffsschutz Rollback:**
- Body-Passwort wird über bestehende `auth.verifyPassword(userId, pw)` verglichen.
- 3 Fehlversuche in 5 Min sperren Endpoint pro User für 15 Min (in-memory).

### 5. SSE-Wireup (Step-7-Bus erweitern)

- Neuer Event-Typ `system:update:phase` mit Payload `{laufId, step, status, label}`.
- Frontend-`useLiveEvents` (Step 7) bekommt zusätzliche Cases: invalidiert `["system","update","lauf",laufId]` und `["system","update","historie"]`. Damit braucht `useUpdateLauf` kein Polling mehr — `refetchInterval` raus, `staleTime: Infinity`, SSE treibt Updates.

### 6. Frontend-Anpassungen

Nur minimal, weil das UI fertig ist:
- `src/lib/api/client.ts` PI_PREFIXES: `/system/` ergänzen.
- `useUpdateLauf` Polling ausschalten (SSE übernimmt), aber Initial-Fetch behalten.
- `useInstallUpdate` Multipart-Upload-Pfad: ist heute schon `multipart/form-data` (im Frontend-Hook prüfen — nur durchreichen).
- Beim ersten Render von `SystemUpdateTab` einmal `GET /system/update/lauf/aktuell` aufrufen, falls ein Lauf bei einem Reload weiterläuft.
- Mock-Backend-Routen `/system/*` als Mock-Override deaktivieren, sobald `isBackendUrlExplicit()` true ist (Pi-Modus).

### 7. Sicherheit & Härtung

- ZIP-Inhalt darf NUR aus `node_modules/`-freien App-Dateien bestehen (Blacklist `.env`, `data/`, `keys/`, `backups/`).
- HMAC-Manifest-Signatur mit Master-Key — verhindert externe Fremd-ZIPs (nur eigene Releases gültig).
- `/system/update/install/*` benötigt aktive Auth-Session, Audit-Eintrag mit User+IP.
- Lock-File verhindert parallele Updates. Nach Crash: Lock-File älter 30 min wird beim Server-Start aufgeräumt.
- Healthcheck nutzt eigenen Loopback (127.0.0.1), ignoriert TLS, max 60 s, sonst Auto-Rollback.
- `npm ci`-Subprocess: Timeout 5 min, max 500 MB Stdout-Buffer, eigener `cwd`, keine Shell-Interpolation.
- Alle Subprocess-Aufrufe via `child_process.execFile` (NICHT `exec`).

### 8. Tests — `backend/test/system-update.spec.ts`

Setup: `dev-root/` Verzeichnis, kleine Test-ZIPs mit verschiedenem Manifest.

- Upload + Validate gültiges Paket → `UpdatePackageInfo`, `validiert=true`.
- Validate mit ungültiger Signatur → 400, kein Staging-Ordner.
- Validate mit Schema-Downgrade → 400.
- Install Happy-Path (mit Stub-Healthcheck) → Symlink wandert, Lauf-Status `erfolg`, alte Version landet als `previous`, ältere weg.
- Install mit fehlschlagender Migration (dry-run wirft) → kein Swap, Lauf-Status `fehler`, Symlink unverändert.
- Install mit fehlschlagendem Healthcheck → automatischer Rollback, Lauf-Status `zurueckgerollt`, Symlink wieder auf alt, neuer Code in `versions/broken-*`.
- Rollback mit falschem Passwort → 401, 3× → 429 mit Sperre 15 min.
- Rollback Happy-Path → Symlink auf gewählte Vorgängerversion, Sicherheits-Backup angelegt.
- Parallele Install-Calls: zweite kriegt 409 wegen Lock-File.
- ZIP-Bomb (1 GB entpackt) → 413 beim Extract.
- DATA_DIR-Schutz: Test versucht in `/var/lib/...` zu schreiben (gemockter Pfad) → fail, aber Daten unverändert.
- Reconnect-Szenario: laufenden Lauf simulieren, `GET /system/update/lauf/aktuell` liefert ihn.

### 9. Memory-Updates

- `mem://features/system-update` wird ergänzt um: HMAC-Signatur-Vertrag, Step-Liste 1:1, Lock-File-Mechanismus, Healthcheck-Details, dev-root-Modus.
- Index bekommt Step-8-Eintrag mit Verweis auf `mem://features/backend-step8-system-update`.

### 10. Reihenfolge (1 Prompt, ohne Rückfragen)

1. Migration 011 + Repo
2. `paths.ts`, `manifest.ts`, `zip.ts` (Utilities + Tests)
3. `runner.ts` mit State-Machine + Bus-Events
4. REST-Routen + Rate-Limit + Lock-File
5. SSE-Bus-Erweiterung + Frontend-`useLiveEvents`-Mapping
6. Frontend-Hooks: Polling raus, `lauf/aktuell` rein, `/system/` in PI_PREFIXES
7. Tests
8. Memory-Files

### 11. Was Step 8 NICHT enthält

- Update-Server (woher das ZIP kommt) — User lädt manuell hoch.
- Auto-Updates oder Update-Benachrichtigungen — bleibt manuell.
- Migrations-Reverse-Scripts — Migration ist additiv-only (Roadmap-Regel), Rollback nutzt nur Code-Tausch + Backup-Restore bei Bedarf.
- Frontend-Redesign — UI ist fertig, nur Hooks werden zart angepasst.
