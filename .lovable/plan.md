# Google-Drive-Integration finalisieren

## Status-Check (was ist da, was fehlt)

**Backend vorhanden:**
- `backend/src/drive/oauth.ts` — echter OAuth-Flow (authorizeUrl, callback, tokens AES-verschlüsselt)
- `backend/src/drive/folders.ts` — Root + `Rechnungen|Angebote/{YYYY}/{MM}/` mit Cache
- `backend/src/drive/upload-worker.ts` — Cron 60 s, Backoff [1,5,15,60,240,1440] min, Test-Hooks
- `backend/src/drive/auto-enqueue.ts` — hängt an Beleg-Mutationen, prüft Status
- `backend/src/drive/upload-repo.ts` — Queue + idempotenz_key
- `backend/src/routes/drive.ts` — komplette OAuth-/Queue-Routen
- `backend/src/dokumente/repo.ts:setDriveStatus` — DB-Spalten für Dokumente
- `src/components/dokumente/DriveSyncBadge.tsx` + `DriveStatusBadge` (PDF)

**Kritische Bugs / Lücken:**

1. **`driveRoutes` werden nirgends registriert** — `server.ts` ruft `einstellungenRoutes` (Mock-Pfade ohne OAuth), aber nicht `driveRoutes`. Damit ist OAuth-Connect, Test-Upload und `/drive/uploads` tot.
2. **Doppelte Route `/einstellungen/google-drive`** — `einstellungen.ts` und `drive.ts` definieren beide GET/POST. Sobald `driveRoutes` registriert wird, kollidiert das.
3. **Settings-Schema unvollständig** — `GoogleDriveSchema` kennt nur `clientId` + `rootFolderName`, das Frontend (`GoogleDriveTab`) sendet aber `unterordnerSchema`, `dateinameSchema`, `autoUpload` per PATCH → werden vom Backend stillschweigend verworfen.
4. **Frontend ↔ Backend Type-Mismatch** — Backend liefert `clientSecretIsSet/refreshTokenIsSet/connected`, Frontend erwartet `verbunden/kontoEmail/verbundenAm/letzteSynchronisation/letzterFehler`. Aktuell „funktioniert" das nur dank Mock.
5. **`ConnectDialog` ist Mock-only** — fragt nach E-Mail, ruft `/connect` mit `{kontoEmail}`. Echte Logik: POST → bekommt `authorizeUrl` → `window.open` → Callback. Außerdem fehlt UI für **Client-ID / Client-Secret** (Pflicht-Eingabe für eigenen OAuth-Client).
6. **Dateiname-Templates ignoriert** — Worker nimmt `pdf.dateiname` vom Renderer; das User-Schema (`{nummer} {kunde} {leistung} {MM}-{YYYY}`) wird nirgends angewandt.
7. **Dokumente werden nie hochgeladen** — nur Belege. `setDriveStatus` existiert, aber kein Pfad enqueued/uploadet Dokumente nach Drive.
8. **Live-Events nicht verknüpft** — `useLiveEvents` lauscht auf `drive:hochgeladen`/`drive:fehler`, das Backend emittiert aber `drive:upload-changed`. Badges aktualisieren nicht in Echtzeit.
9. **Keine Queue-/Fehler-Übersicht im Frontend** — Endpoint `/drive/uploads` existiert, aber kein Hook + kein UI im `GoogleDriveTab` ("3 ausstehend, 1 fehlgeschlagen → Retry").
10. **`autoUpload`-Toggle wird nicht respektiert** — Backend schaut nur auf `backup.driveUploadEnabled`. Korrekt wäre `googleDrive.autoUpload`.
11. **Callback-Redirect kann brechen** — `FRONTEND_URL` ist optional; bei direktem Pi-Aufruf auf `:3000` ist Frontend woanders. Außerdem Toast nach Rückkehr fehlt (`?status=ok` wird nicht ausgewertet).

---

## Plan

### Schritt 1 — Backend: Schema + Routen sauber zusammenführen

- `GoogleDriveSchema` erweitern um `unterordnerSchema { rechnungen, angebote }`, `dateinameSchema { rechnung, angebot }`, `autoUpload: boolean`. Defaults wie im Frontend (`Rechnungen/{YYYY}/{MM}` etc.).
- `GET/PATCH /einstellungen/google-drive` aus `routes/einstellungen.ts` entfernen, nur die Variante in `routes/drive.ts` behalten und um Status-Felder ergänzen, sodass die Antwort exakt der `GoogleDriveEinstellungen`-TS-Type entspricht (`verbunden`, `kontoEmail`, `verbundenAm`, `rootOrdnerName`, `rootOrdnerId`, `unterordnerSchema`, `dateinameSchema`, `autoUpload`, `letzteSynchronisation`, `letzterFehler`).
- `PATCH` muss auch `clientId` + `clientSecret` annehmen (Secret separat AES-verschlüsselt) und `unterordner-/dateinameSchema/autoUpload` persistieren.
- `driveRoutes` in `server.ts` registrieren (`await app.register(driveRoutes)`), `wireDriveAutoEnqueue()` + `startDriveWorker()` beim Boot starten.

### Schritt 2 — Frontend: Echte Connect-UI

- `ConnectDialog` neu: Felder **Client-ID**, **Client-Secret**, **Root-Ordner-Name**, plus Hinweis-Box „So legst du eine Google-Cloud-OAuth-Anwendung an" (3 Steps + Redirect-URI zum Kopieren). Button **„Authorisieren"** → PATCH speichert clientId/Secret → POST `/einstellungen/google-drive/connect` → öffnet `authorizeUrl` in neuem Tab.
- Nach Rückkehr (`?tab=drive&status=ok|err&msg=`): Toast + Settings-Refetch.
- Hook-Update: `useConnectGoogleDrive` gibt `{ authorizeUrl }` zurück.

### Schritt 3 — Auto-Upload korrekt verdrahten

- In `auto-enqueue.ts` Toggle auf `googleDrive.autoUpload` umstellen (`backup.driveUploadEnabled` als Fallback aus Schema entfernen).
- In `upload-worker.ts:processOne` den **konfigurierten Dateiname-Template** anwenden (Renderer ergibt nur Default; Template-Replacer mit `{nummer}/{kunde}/{leistung}/{MM}/{YYYY}/{datum}` zentral in `backend/src/drive/naming.ts`).
- Unterordner-Pfad ebenfalls aus Settings (`{YYYY}/{MM}` Replacer), nicht hartkodiert.

### Schritt 4 — Dokumente-Upload

- Neuer Hook `wireDokumenteDriveAutoEnqueue` in `backend/src/dokumente/`: bei `dokument:erstellt` enqueued in dieselbe Queue (neue `belegArt: "dokument"` ergänzen) ODER separate kleine Queue. **Entscheidung: dieselbe Queue erweitern**, sauberer Worker-Pfad.
- Migration `014_drive_dokument.sql`: erlaubter Wert für `beleg_art` um `'dokument'` ergänzen (CHECK-Constraint anpassen).
- `processOne`: bei `dokument` PDF/Datei direkt aus Dokumentenspeicher streamen, Zielordner `Dokumente/{YYYY}/{MM}/`, danach `setDriveStatus(id, { status: 'uploaded', fileId, url })`.

### Schritt 5 — Live-Events vereinheitlichen

- Backend emittiert zusätzlich zu `drive:upload-changed` auch `drive:hochgeladen` (bei Erfolg) und `drive:fehler` (bei Fail) mit Payload `{ belegArt, belegId, fileId?, webLink?, error? }` — damit `useLiveEvents`-Reducer ohne Anpassung greift.
- Im Frontend Reducer den richtigen Cache-Key (`dokument`/`angebot`/`rechnung`) invalidieren.

### Schritt 6 — Queue-/Fehler-UI in Einstellungen

- Neuer Hook `useDriveUploads({ status })` (GET `/drive/uploads`).
- In `GoogleDriveTab` neue Section **„Synchronisation"**: Counter (pending/erfolg/fehler letzte 24 h) + Liste der fehlgeschlagenen (Belegnummer, Fehlertext, Retry-Button → POST `/drive/uploads/:id/retry`).
- Status-Indikator klein/dezent oben rechts in der Sidebar (bestehende `DriveStatusBadge` wiederverwenden), klick → `/einstellungen?tab=drive`.

### Schritt 7 — Mock-Backend angleichen

- `src/lib/mock/backend.ts` an die echte Response-Form anpassen (`unterordnerSchema/dateinameSchema/autoUpload` durchreichen, `connect` öffnet Fake-OAuth-Window mit Auto-Success nach 1 s) damit Dev/Mock-Modus weiter funktioniert.

### Schritt 8 — QA / Edge-Cases

- `verifyState` 10 min TTL — Hinweis im Dialog, dass innerhalb der Zeit autorisiert werden muss.
- `invalid_grant` → automatischer Disconnect + Toast „Bitte neu verbinden" (Status wird heute nur ge-flagged).
- Rate-Limit: Drive-Calls sind quota-limitiert → Worker `claimDue(2)` ist ok; bei `userRateLimitExceeded` Backoff verdoppeln.
- 1 Test pro neuer Stelle: Naming-Replacer (Pure Function), Auto-Enqueue (Toggle aus → 0 Inserts), Worker mit `setDriveTestHooks` → grüner Pfad.

---

## Technische Details

**Dateien neu/ändern:**
- `backend/src/settings/schemas.ts` — `GoogleDriveSchema` erweitern.
- `backend/src/routes/einstellungen.ts` — alte Drive-Routen entfernen.
- `backend/src/routes/drive.ts` — Response-Mapping vervollständigen, PATCH erweitern, GET Status zusammenführen.
- `backend/src/server.ts` — `driveRoutes` registrieren, `wireDriveAutoEnqueue()` + `startDriveWorker()` aufrufen.
- `backend/src/drive/naming.ts` (neu) — `applyTemplate(template, ctx)`.
- `backend/src/drive/upload-worker.ts` — Naming + Pfad aus Settings.
- `backend/src/drive/auto-enqueue.ts` — Toggle umstellen, `belegArt: "dokument"` Pfad.
- `backend/src/drive/upload-repo.ts` — `BelegArt` um `"dokument"` erweitern, Events `drive:hochgeladen|fehler` zusätzlich emittieren.
- `backend/src/db/migrations/014_drive_dokument.sql` (neu) — CHECK-Constraint anpassen.
- `backend/src/dokumente/wireup.ts` (neu) — Auto-Enqueue für Dokumente.
- `src/lib/api/types.ts` — keine Änderung (Frontend-Type ist die Zielform).
- `src/hooks/useApi.ts` — `useConnectGoogleDrive` → `{ authorizeUrl }`, neuer `useDriveUploads`, `useRetryDriveUpload`.
- `src/components/einstellungen/GoogleDriveTab.tsx` — `ConnectDialog` neu, Section „Synchronisation".
- `src/lib/mock/backend.ts` — angleichen.
- `src/hooks/useLiveEvents.ts` — Cache-Invalidation für `drive:hochgeladen|fehler`.

**Keine Auto-Mails involviert** (Memory-Regel respektiert).
**Daten-/Code-Trennung** unverändert: Settings + Queue liegen in `/var/lib/mycleancenter/` SQLite, Code in `/opt/mycleancenter/current/`.
