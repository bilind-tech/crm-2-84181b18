## Ziel
1. Kunden / Angebote / Rechnungen funktionieren **immer** — auch ohne Google-Drive-Verbindung. Alles speichert auf USB-SSD.
2. UI zeigt pro Beleg klar an: „in Drive" ✓ / „nur lokal" ⚠ / „Sync fehlgeschlagen" ✗ — mit „Jetzt synchronisieren"-Button.
3. Fehlermeldungen sprechen Klartext („Google Drive nicht verbunden — Beleg liegt sicher lokal"), kein nacktes `unauthenticated`.
4. Doctor + Installer prüfen, dass alle Daten **wirklich** auf der SSD landen, strukturiert und automatisch.

## Status heute (geprüft)
- ✅ Auto-Enqueue (`backend/src/drive/auto-enqueue.ts`) returned bereits leise, wenn Drive nicht verbunden → **Beleg-Erstellung wird nicht blockiert**, aber User sieht das auch nicht.
- ✅ `drive_upload_queue` mit Retry-Logik existiert; `/drive/uploads/:id/retry` ist implementiert.
- ❌ Auf Beleg-Detail-Seiten (Angebot/Rechnung) gibt es keinen Drive-Status-Badge mit „Jetzt synchronisieren"-Button.
- ❌ Wenn Drive nicht verbunden ist, wird nichts in die Queue gelegt → später kein 1-Klick-Sync möglich (Queue leer).
- ❌ Frontend-Fehlermeldungen (`PiApiError`) mappen `0` auf „Backend nicht erreichbar", aber 401/403/Drive-spezifische Fehler bleiben kryptisch.
- ✅ Daten-Layout auf SSD ist sauber definiert (`/var/lib/mycleancenter/{db,backups,uploads,keys,logs}`), Symlink via `--use-ssd=`.
- ❌ Kein systemd-Healthcheck, der bei nicht-gemounteter SSD den Backend-Start verweigert (Risiko: Schreiben auf SD-Karte).

## Plan

### 1. Drive: „immer enqueuen, später syncen"
- `auto-enqueue.ts` legt **immer** einen Queue-Eintrag an, sobald Beleg den Sync-würdigen Status erreicht (versendet/akzeptiert/bezahlt/teilbezahlt) — auch wenn Drive aktuell nicht verbunden ist.
- Neuer Queue-Status `wartet-auf-verbindung` (oder Wiederverwendung von `pending` mit `naechster_versuch_at = NULL`). Worker überspringt Einträge, solange `refreshTokenIsSet === false`.
- Sobald `einstellung:geaendert` für `googleDrive` mit `verbunden=true` kommt → Worker tickt einmal und arbeitet alle wartenden Einträge ab.
- Damit ist „1-Klick-Nachsync" automatisch: User verbindet Drive → alle alten Belege fließen rein.

### 2. Per-Beleg-Drive-Status in der UI
- Neuer kleiner Endpoint `GET /drive/uploads/by-beleg?belegArt=…&belegId=…` (existiert via `listUploads` mit Filter — nur Hook ergänzen).
- Komponente `DriveSyncBadge` (klein, dezent — keine Sparkles, keine Gradients) auf:
  - `angebote/$id`, `rechnungen/$id`, `kunden/$id` (Liste der zugehörigen Belege)
- Zustände:
  - **Drive nicht verbunden**: graues Pill „Nur lokal gespeichert · Drive nicht verbunden" + Link „Verbinden"
  - **Wartet auf Verbindung**: graues Pill „Wartet auf Drive-Verbindung"
  - **Pending/Running**: blaues Pill „Synchronisiert…"
  - **Erfolg**: grünes Pill „In Drive ✓" + „Öffnen"-Link
  - **Fehler/Manuell**: rotes Pill mit Fehlertext-Tooltip + Button „Jetzt erneut synchronisieren"
- Button ruft `POST /drive/uploads/:id/retry` (oder neu `/drive/uploads/sync-beleg` falls noch keine Queue-Zeile da).

### 3. Klartext-Fehlermeldungen
- `PiApiError` bekommt einen Mapper (`errorToMessage()`), der bekannte Fehlercodes übersetzt:
  - `error: "drive-not-connected"` → „Google Drive ist nicht verbunden. Beleg liegt sicher lokal auf dem Pi. Verbinde Drive in Einstellungen → Google Drive."
  - `error: "drive-token-expired"` → „Google-Drive-Verbindung abgelaufen. Bitte neu verbinden."
  - `error: "unauthenticated"` → „Sitzung abgelaufen — bitte erneut anmelden."
  - `status: 0` → „Backend nicht erreichbar. Läuft der Pi?"
- Backend-Drive-Routen liefern strukturierte Fehler `{ error: "drive-not-connected", message: "…" }` statt Stack-Traces.
- Toast-Wrapper `showApiError(err)` ersetzt überall `toast.error(err.message)`.

### 4. Einstellungen-Doppelcheck
- E2E-Smoke (manuell): jeder Tab öffnet, lädt Daten, zeigt bei Fehler `LoadingPlaceholder` / Error-State.
- Tabs prüfen: Firmendaten, SMTP, Nummernkreise, E-Mail-Vorlage, Signatur, Mahnung, Backup, Sicherheit, Erscheinung, Positionsvorlagen, Steuern, GitHub, System-Update, **Google Drive**, Stundenzettel.
- Jeder Tab bekommt einheitliches Pattern: `isLoading` → Skeleton, `error` → „Konnte nicht geladen werden — erneut versuchen" + Retry-Button.

### 5. SSD-Garantie: nichts landet versehentlich auf SD-Karte
- Backend-Boot-Check (`config.ts` → neue Funktion `assertDataDirSafe()`):
  - Falls `NODE_ENV=production` und `DATA_DIR` Symlink: prüfe Ziel-Mountpoint via `stat` → muss `!=` `/`-Mount sein (= echte SSD).
  - Falls Ziel = SD-Karte: Backend startet trotzdem, schreibt aber **lautes** Warning ins Log + setzt Flag `dataOnSdCard=true`, das im Doctor + UI-Status sichtbar ist.
- Installer `--use-ssd`: wir haben das schon; jetzt zusätzlich:
  - automatisch in `mycleancenter.service` → `Environment=DATA_DIR=/mnt/data/mycleancenter` schreiben (statt nur Symlink), redundant aber failsafe.
  - `ReadWritePaths` in systemd-Unit erweitern, falls SSD-Pfad abweicht.
- Doctor-Mode prüft zusätzlich:
  - `/var/lib/mycleancenter` zeigt auf Mountpoint mit ≥ 5 GB frei
  - SQLite-Integrity (`PRAGMA integrity_check`)
  - Backup-Verzeichnis schreibbar
  - Drive-Queue-Größe + Anzahl `manuell`-Einträge → Hinweis im Doctor-Output

### 6. UX-Hinweis im App-Header (dezent)
- Kleiner Cloud-Status-Indikator oben rechts (existiert teilweise via `useDriveUploads`):
  - Grün ✓ wenn alles synchron
  - Grau wenn Drive nicht verbunden + Anzahl wartender Belege
  - Gelb bei laufenden Uploads
  - Rot bei manuellen Fehlern
- Klick → springt nach Einstellungen → Google Drive.

## Technische Details
- `backend/src/drive/auto-enqueue.ts`: Bedingung `if (!settings.refreshTokenIsSet) return;` entfernen — immer enqueuen, aber `markFehler` fasst „nicht verbunden" als nicht-zählenden Versuch auf (kein Retry-Counter-Inkrement).
- `backend/src/drive/upload-worker.ts`: Pre-Check „Drive verbunden?" → wenn nein, alle `pending` ignorieren (kein Fehler markieren, einfach pausieren).
- `backend/src/events/bus.ts`: Listener auf `einstellung:geaendert key=googleDrive` → `tickDriveQueue()` wenn jetzt verbunden.
- `backend/src/routes/drive.ts`: neue Query `?belegArt=…&belegId=…` für `GET /drive/uploads` (existiert teilweise).
- `src/components/DriveSyncBadge.tsx`: neue Komponente, in Beleg-Detail-Headers eingebaut.
- `src/lib/api/piClient.ts`: `errorToMessage()` Helper export, in allen Toast-Stellen ersetzen (gezielt auf Drive + Auth + Backend-Offline).
- `backend/src/config.ts`: `assertDataDirSafe()` aufrufen in `server.ts` direkt nach Pfad-Init.
- `backend/deploy/install.sh` `--doctor`: zusätzliche Checks für SSD-Mount, Queue-Größe, SQLite-Integrity.
- `backend/deploy/install.sh` `--use-ssd`: schreibt `DATA_DIR=` in systemd-Unit.

## Akzeptanzkriterien
- ✅ Kunde/Angebot/Rechnung anlegen ohne Drive-Verbindung funktioniert ohne jede Fehlermeldung.
- ✅ Beleg-Detail zeigt klar: „Nur lokal · Drive nicht verbunden" mit „Verbinden"-Link.
- ✅ Nach Drive-Verbindung werden alle bisher angelegten Belege (versendet/akzeptiert/bezahlt) automatisch hochgeladen, ohne dass User sie einzeln antippen muss.
- ✅ Manueller „Jetzt synchronisieren"-Button funktioniert pro Beleg.
- ✅ Fehlermeldungen sind menschenlesbar — kein „unauthenticated", kein Stack-Trace.
- ✅ Alle 15 Einstellungs-Tabs öffnen ohne leere Inhalte, mit Loading + Error-States.
- ✅ Backend-Log meldet beim Start klar: `data dir: /var/lib/mycleancenter -> /mnt/data/mycleancenter (SSD, 230 GB free)` oder warnt bei SD-Karte.
- ✅ Doctor zeigt: SSD ✓, DB ✓, Backups ✓, Drive-Queue: 3 wartend / 0 Fehler.

## Nicht-Ziele
- Keine Änderung an Auth/Single-User.
- Kein Auto-E-Mail-Versand.
- Keine neuen Drive-Features (nur Sync-Status sichtbar machen).
- Keine Cloud-Hosting-Optionen.
