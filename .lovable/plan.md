
## Ziel

Wenn ein Beleg (Angebot/Rechnung) nach dem letzten erfolgreichen Drive-Upload bearbeitet wurde, zeigt das `DriveSyncBadge` einen dezenten Warn-Hinweis „Drive-Version veraltet" mit Button **„Aktualisieren"**. Ein Klick lädt die aktuelle PDF in Drive hoch und **überschreibt die bestehende Datei** (gleiche Drive-File-ID, gleicher Link).

## Warum das nötig ist

Aktuell wird ein Drive-Upload nur beim manuellen E-Mail-Versand automatisch angestoßen (`onBelegVersendet` → `auto-enqueue.ts`). Bearbeitet man danach den Beleg im PDF-Editor, bleibt in Drive die alte PDF, das Badge zeigt aber weiter grün „In Drive". Die SHA des aktuell gerenderten PDFs unterscheidet sich dann von `latest.pdfSha256` in `drive_upload_queue`.

## Backend

**1. Neuer Endpoint `GET /drive/uploads/aktuell?belegArt=…&belegId=…`** (`backend/src/drive/routes.ts`)
- Rendert PDF via `renderAngebotPdf`/`renderRechnungPdf`, berechnet SHA256.
- Sucht letzten Eintrag in `drive_upload_queue` für `(belegArt, belegId)` mit `status='erfolg'`.
- Antwort:
  ```ts
  { verbunden: boolean,
    inSync: boolean,
    currentSha: string,
    latestErfolg?: { sha: string, driveFileId: string, driveWebLink?: string, abgeschlossenAm: string } }
  ```
- `inSync` = es gibt einen erfolg-Eintrag UND `sha === currentSha`. Wenn kein erfolg-Eintrag existiert: `inSync=false`, `latestErfolg=undefined` (Badge behält dann seinen aktuellen „Noch nicht in Drive"-Pfad).

**2. Overwrite-Upload** (`backend/src/drive/folders.ts` + `upload-worker.ts`)
- `uploadFile()` erhält optionales `replaceFileId?: string`. Wenn gesetzt → `drive.files.update({ fileId: replaceFileId, media })` statt `files.create`. Parents/Name bleiben unverändert; Drive-File-ID + WebViewLink bleiben stabil.
- `processBeleg()`: Vor dem Hochladen letzten erfolgreichen Eintrag (gleicher Beleg) suchen — falls vorhanden, dessen `driveFileId` als `replaceFileId` mitgeben. So entstehen keine Drive-Duplikate, der bekannte Link bleibt gültig, ältere Queue-Einträge auf `manuell` gesetzte Dateien bleiben unangetastet.
- Worker setzt nach Erfolg `markErfolg(newRowId, sameFileId, sameWebLink)`.

**3. Force-Enqueue für „Aktualisieren"-Klick**
- `POST /drive/uploads/enqueue` existiert bereits. Da neue SHA → neuer Idempotenz-Key → neue Queue-Row → Worker greift im nächsten Tick. Kein neues Endpoint nötig. Falls Sofort-Ausführung gewünscht: nach `enqueue` synchron `tickDriveQueue(1)` triggern und ergebnis zurückgeben.

## Frontend

**1. Hook `useDriveAktuell(belegArt, belegId)`** (`src/hooks/useApi.ts`)
- `useQuery` auf neues Endpoint. Refetch alle 8 s, solange ein Upload für den Beleg pending/running ist (zur Synchronisation mit `useDriveUploads`). Invalidiert wenn:
  - `qkBelege` (Angebot/Rechnung) Mutation
  - `drive:hochgeladen`/`drive:upload-changed` SSE-Events
  - Nach Klick auf „Aktualisieren"

**2. `src/components/DriveSyncBadge.tsx` erweitern**
- Neuer Zustand „outdated" zwischen `erfolg` und kein-Eintrag:
  - Wenn `aktuell.latestErfolg && !aktuell.inSync` → amber Pill mit `AlertTriangle`-Icon: „Drive-Version veraltet" + (nicht compact) Button „Aktualisieren" → `useEnqueueDriveUpload.mutateAsync({ belegArt, belegId })` → Toast „Aktualisierung läuft …".
  - Nach Erfolg blendet Pill zurück auf grünes „In Drive" mit demselben Link (da File überschrieben wurde).
- Bestehende Pfade (synced/pending/error/none) bleiben unverändert.

**3. Editor-Integration**
- In `useBelegEditor` (Save-Pfad) nach erfolgreichem Save zusätzlich `qc.invalidateQueries({ queryKey: ['drive','aktuell', belegArt, belegId] })`, damit Badge auf der Detailseite sofort den Out-of-Sync-Zustand zeigt, sobald man zurück navigiert.

## Akzeptanzkriterien

- Beleg ist in Drive → Edit im PDF-Editor → Speichern → DriveSyncBadge zeigt amber „Drive-Version veraltet" + Button.
- Klick auf „Aktualisieren" → toast, Badge zeigt „Synchronisiert …", danach grün „In Drive" mit **identischem** Drive-Link (keine Datei-Duplikate).
- Wenn Drive nicht verbunden ist oder Beleg nie hochgeladen war: Verhalten bleibt unverändert.
- Worker-Pfad für Dokumente und Erst-Upload bleibt unverändert (kein `replaceFileId` → wie bisher `files.create`).

## Nicht enthalten

- Keine Auto-Aktualisierung von Drive ohne User-Klick (analog zur Regel „nur User-getriggerte Aktionen ändern Drive"). Die Erkennung läuft passiv, der Upload nur per Klick.
- Keine Änderungen am Dokumenten-Upload-Pfad.
