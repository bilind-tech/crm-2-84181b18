## Ziel
Google Drive einmalig auf einem Gerät verbinden → alle Geräte (PC, Handy, Tablet) im LAN sehen sofort „verbunden" und können PDFs hochladen.

## Status heute (aus Code geprüft)
- Refresh-Token + Status (`kontoEmail`, `rootOrdnerId`) liegen **bereits zentral in der SQLite auf dem Pi** (`backend/src/drive/oauth.ts` → `setSetting` mit AES-GCM).
- Frontend liest Status über `/einstellungen/google-drive` → jedes Gerät, das mit dem Pi spricht, sieht denselben Status.
- **Gut**: Cross-Device-Sharing ist architektonisch schon korrekt.
- **Problem**: `getRedirectUri()` baut die Redirect-URL aus dem Request-Host (`req.hostname`). Wenn du auf dem PC mit `mycleancenter.local` verbindest, schickt Google zurück an `mycleancenter.local`. Wenn das Handy nur per IP erreichbar ist, sieht zwar trotzdem alles „verbunden" — aber: in der Google-Cloud-Console muss **jede** mögliche Redirect-URI eingetragen sein, sonst bricht OAuth bei manchen Geräten ab.

## Plan

### 1. Eine feste, kanonische Redirect-URI
- Neue Pflicht-Einstellung im Backend: `GOOGLE_OAUTH_REDIRECT` wird auf **eine** stabile URL gesetzt, z. B. `http://mycleancenter.local:8787/einstellungen/google-drive/callback`.
- Im Installer (`backend/deploy/install.sh`) automatisch in die systemd-Unit schreiben.
- Egal von welchem Gerät der User auf „Verbinden" klickt — Google leitet immer auf dieselbe URL zurück. Der Pi tauscht den Code, speichert den Refresh-Token zentral, alle Geräte sehen den neuen Status.
- In der Cloud-Console muss der User dann nur **diese eine** Redirect-URI eintragen → einfacher, weniger Fehlerquelle.

### 2. UI: Redirect-URI klar anzeigen
- `GoogleDriveVerbindenDialog` zeigt die Redirect-URI prominent (Copy-Button), damit der User sie 1:1 in die Google Cloud Console kopiert.
- Hinweis-Text: „Diese URL einmal in Google eintragen — funktioniert dann auf allen Geräten."

### 3. Status-Sync auf allen Geräten in Echtzeit
- Bereits vorhandenes SSE-Event `drive:upload-changed` invalidiert den Drive-Cache auf jedem verbundenen Client.
- Zusätzlich: nach erfolgreichem `exchangeCode` ein neues Event `drive:connection-changed` emittieren → Handy erkennt sofort „verbunden", auch ohne Reload.

### 4. Handy-Flow
- Wenn der User vom Handy aus „Verbinden" klickt: Pi öffnet Google-OAuth in neuem Tab → Google leitet auf den Pi zurück (Pi ist im LAN erreichbar) → Pi speichert Token → Handy bekommt SSE-Event → Status springt auf „verbunden".
- Funktioniert genauso umgekehrt: PC verbinden → Handy sieht es sofort.

### 5. Doku im Setup
- README + Doctor-Mode prüfen, dass `GOOGLE_OAUTH_REDIRECT` gesetzt ist.
- Klare 4-Schritt-Anleitung im Dialog: Cloud Console öffnen → Client erstellen → Diese URL eintragen → Client-ID/Secret hier einfügen.

## Technische Details
- `backend/src/drive/oauth.ts`: `getRedirectUri()` priorisiert `process.env.GOOGLE_OAUTH_REDIRECT` (passiert schon), aber Installer setzt sie jetzt verpflichtend.
- `backend/deploy/systemd/mycleancenter.service`: neue Zeile `Environment=GOOGLE_OAUTH_REDIRECT=http://mycleancenter.local:8787/einstellungen/google-drive/callback`.
- `backend/src/events/bus.ts` + `oauth.ts`: nach `exchangeCode` und `disconnect` `emit("drive:connection-changed", …)`.
- `src/hooks/useLiveEvents.ts`: neuer Reducer für `drive:connection-changed` → invalidiert `qk.einstellungen.googleDrive`.
- `src/components/einstellungen/GoogleDriveVerbindenDialog.tsx`: Redirect-URI-Block mit Copy-Button + Hinweis „nur einmal nötig".

## Akzeptanzkriterien
- PC verbindet → Handy sieht innerhalb von 2 s „verbunden" mit derselben E-Mail (ohne Reload).
- Handy verbindet → PC sieht es genauso.
- Nach `disconnect` auf einem Gerät: alle anderen sehen sofort „nicht verbunden".
- In der Google Cloud Console muss nur **eine** Redirect-URI eingetragen sein.
- PDFs hochgeladen vom Handy landen im selben Drive-Konto wie die vom PC.

## Nicht-Ziele
- Keine Per-User-OAuth (Single-User-System).
- Kein Cloud-Hosting des Tokens.
- Keine Änderung am Upload-Worker oder an der Ordnerstruktur.
