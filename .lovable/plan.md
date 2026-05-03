## Ziel
Die Google-Drive-Integration im Frontend auf den bereits fertigen Backend-Stand heben. Heute funktioniert „Verbinden" nur im Mock; das echte Backend liefert `{ authorizeUrl }` und eine vollständige Upload-Queue mit Retry — beides wird im UI noch nicht genutzt. Nach dieser Runde ist der Drive-Tab end-to-end produktiv.

## Was umgesetzt wird

### 1. ConnectDialog auf echten OAuth-Flow umbauen
`src/components/einstellungen/GoogleDriveTab.tsx` — `ConnectDialog` neu:

- Zwei Eingabefelder: **OAuth Client-ID** und **Client Secret** (Secret als Password-Input, nur überschreibend gespeichert).
- Hilfetext mit kopierbarer **Redirect-URI** (`{BACKEND_URL}/einstellungen/google-drive/callback`) plus kurzer 3-Schritt-Anleitung („Cloud Console → OAuth-Client erstellen → URI eintragen").
- Button „Mit Google verbinden" macht zwei Calls:
  1. `PATCH /einstellungen/google-drive` mit `clientId` + `clientSecret` (über bestehendes `useUpdateGoogleDrive`).
  2. `POST /einstellungen/google-drive/connect` (neu typisiert) → erhält `{ authorizeUrl }` und öffnet diesen via `window.open(authorizeUrl, "_blank", "noopener")`.
- Dialog bleibt offen mit Hinweis „Nach erfolgreichem Login schließt sich dieses Fenster automatisch", schließt sich, sobald `useGoogleDrive` `verbunden=true` zurückliefert (Polling/Invalidate via SSE).

### 2. Callback-Toast nach Redirect
`src/routes/einstellungen.tsx` (Page-Komponente) liest beim Mount `?status=ok|err&msg=` aus dem URL-Search:
- `ok` → `toast.success("Google Drive verbunden")` und QueryParams entfernen.
- `err` → `toast.error("Verbindung fehlgeschlagen: " + msg)`.
- Anschließend `qc.invalidateQueries({ queryKey: qk.einstellungen.googleDrive })`.

### 3. Hooks: Connect-Returntyp + Drive-Uploads
`src/hooks/useApi.ts`:

- `useConnectGoogleDrive` umstellen — Returntyp `{ authorizeUrl: string }`, kein Body mehr (`api.post<{authorizeUrl}>("/einstellungen/google-drive/connect")`).
- Neuer Typ `DriveUpload` (mirror des Backend-`DriveUpload` aus `upload-repo.ts`: `id`, `belegArt`, `belegId`, `dateiName`, `status: "pending"|"running"|"erfolg"|"fehler"|"manuell"`, `versuche`, `naechsterVersuchAt`, `driveWebLink`, `fehlerText`, `abgeschlossenAm`).
- `useDriveUploads(filter?: { status?; belegArt?; limit? })` → `GET /drive/uploads`, refetch alle 4 s solange Einträge mit `status==="pending"|"running"` enthalten sind.
- `useRetryDriveUpload()` → `POST /drive/uploads/:id/retry`, invalidiert `["drive","uploads"]`.

### 4. Neue Sektion „Synchronisation" im GoogleDriveTab
Direkt unter „Verbindung", nur sichtbar wenn `verbunden===true`:

- Kleine Counter-Zeile: „2 in Warteschlange · 1 läuft · 18 erfolgreich · 1 manuell" (aus `useDriveUploads()` aggregiert).
- Liste der Einträge mit `status ∈ {fehler, manuell}` (max. 5, „Alle anzeigen" expandiert):
  - Dateiname (mono), Beleg-Typ-Badge, Versuchszähler, Fehlertext (zweizeilig truncated).
  - Buttons: „Erneut versuchen" (`useRetryDriveUpload`) und ggf. „In Drive öffnen" wenn `driveWebLink`.
- Wenn keine Probleme: kleine `CheckCircle2`-Zeile „Alles synchron".

### 5. SSE-Reducer für Drive-Events korrekt mappen
`src/hooks/useLiveEvents.ts`:

- Neuer Case `drive:hochgeladen`: invalidiert `["drive","uploads"]` + `qk.einstellungen.googleDrive` (für `letzteSynchronisation`) + `["aktivitaeten"]`. Kein Toast (zu laut bei vielen PDFs).
- Neuer Case `drive:fehler`: invalidiert dieselben Keys; bei `final===true` → dezente `toast.warning` „Drive-Upload fehlgeschlagen — bitte in Einstellungen prüfen", aber **maximal alle 60 s** (kleine in-modul Throttle-Variable).
- Den bestehenden Sammel-Case `email:gesendet|email:fehler|drive:*` aufsplitten: Drive-Keys waren bisher falsch (`["drive"]` statt `["drive","uploads"]`) und Email blieb gemischt — nur die jeweils richtigen Keys invalidieren.

### 6. SSE-Whitelist erweitern
`src/lib/api/sse.ts` — `knownEvents` ergänzen um `drive:upload-changed` (das Backend feuert es zusätzlich für detaillierten Status, der Reducer kann es auf dieselben Cache-Keys mappen wie `drive:hochgeladen`).

### 7. Mock anpassen
`src/lib/mock/backend.ts`:

- `POST /einstellungen/google-drive/connect` → liefert jetzt `{ authorizeUrl: "/einstellungen?tab=drive&status=ok&mock=1" }` und schaltet `verbunden=true` erst beim simulierten Callback (Toast-Path im Tab triggert wie im Live-Modus).
- Neue Mock-Routes: `GET /drive/uploads` (liefert 0–3 simulierte Einträge inkl. einem mit `status:"manuell"`) und `POST /drive/uploads/:id/retry` (setzt Eintrag auf `pending`).

### 8. Memory aktualisieren
`mem://features/google-drive.md`: Frontend-Connect-Flow (Client-ID/Secret + window.open + Callback-Toast), Synchronisations-Sektion + Retry, SSE-Throttle für `drive:fehler`-Toasts.

## Nicht-Ziele (bleiben unverändert)
- Backend (Routes, OAuth-Flow, Worker, Migrations) — alles fertig.
- Auto-Upload-Toggle, Ordner-/Dateiname-Schema-Felder — bereits korrekt verdrahtet.
- Drive-Status-Badge an Beleg-Detailseiten — bereits in PDF-Komponenten enthalten.

## Reihenfolge der Implementierung
1. Hooks (`useConnectGoogleDrive`-Returntyp, `useDriveUploads`, `useRetryDriveUpload`, `DriveUpload`-Typ).
2. SSE-Whitelist + `useLiveEvents`-Reducer aufsplitten + Throttle.
3. Mock-Backend an neue Form anpassen — sonst bricht Dev sofort beim ersten Hook-Reload.
4. `GoogleDriveTab.ConnectDialog` neu + Synchronisations-Sektion einbauen.
5. `routes/einstellungen.tsx` Callback-Toast.
6. Memory + kurzer Smoke-Test (Connect-Dialog im Mock, Liste rendert, Retry-Button funktioniert).
