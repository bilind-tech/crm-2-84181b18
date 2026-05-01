## Dokumente: Drag & Drop, Datei-Upload + QR-Handy-Scan

Drei zusammenhängende Wege, ein Dokument hochzuladen — ohne Code-Doppelung, mit Live-Anzeige.

### 1. Drag & Drop und klassischer Datei-Upload (Desktop + Mobil)

Der Inhaltsbereich der Dokumente-Seite wird zu einer Drop-Zone:

- Sichtbarer „Hochladen"-Bereich oben (gestrichelte Box, Icon, Hinweistext) — gleichzeitig Klick-Ziel und Drop-Ziel.
- Drag-over hebt die Box hervor (Border-Farbe Primary, leichter Hintergrund).
- Klick öffnet `<input type="file" multiple accept="image/*,application/pdf">` — auf dem Handy wird dort vom System Kamera/Galerie/Dateien angeboten.
- Mehrere Dateien gleichzeitig möglich; jede wird einzeln hochgeladen, mit Fortschritts-/Fertig-Indikator.
- Bestehender „Dokument hochladen"-Button im PageHeader öffnet denselben Datei-Picker (eine Quelle, gleicher Code).
- Nach Upload: Toast „X Dokumente hochgeladen", Liste wird per Query-Invalidate aktualisiert.

Dateigröße/Format-Validierung: Bilder + PDF, max. 20 MB pro Datei. Im Mock werden Dateien als Data-URL in `Dokument.url` gespeichert (so wie das Datenmodell heute schon vorsieht).

### 2. QR-Code für Handy-Scan-Session (vom Desktop ausgelöst)

Neuer Button neben dem normalen Hochladen-Button: **„Vom Handy scannen"** (Icon: QrCode).

Klick öffnet einen Dialog mit:

- **Großem QR-Code** (mind. 280×280 px), scannbar aus Armlänge.
- URL-Anzeige darunter zum Antippen/Kopieren als Fallback.
- Live-Status: „Warte auf Verbindung …" → „Handy verbunden" → „2 Fotos hochgeladen".
- Eine fortlaufende Liste der bisher in dieser Session empfangenen Fotos (Mini-Vorschau).
- „Sitzung beenden"-Button.

Der QR-Code zeigt auf eine eigene Route `/m/upload/$session` mit kurzem zufälligem Session-Token in der URL.

Hinter den Kulissen:
- Beim Öffnen des Dialogs wird im Mock-Backend eine Upload-Session angelegt (`POST /upload-sessions`, liefert `{ id, token, ablaufAm }`, gültig 15 min).
- Der Desktop pollt alle 1.5 s `GET /upload-sessions/:id` und sieht neue Fotos sofort — sie erscheinen direkt im Dialog UND in der Hauptliste der Dokumente.
- (Mock = Polling über localStorage; Live-Modus auf dem Pi später per WebSocket/SSE — gleiche API-Form, transparent austauschbar.)

### 3. Mobile Foto-Capture-Seite `/m/upload/$session`

Eigene, sehr schlanke Route — kein Sidebar/Header, kein Lock-Screen-Zwang (Token in URL = Authentifizierung der Session):

- Großer Primary-Button **„Foto aufnehmen"** → öffnet die Handy-Kamera über `<input type="file" accept="image/*" capture="environment">`. Das ist der zuverlässigste Weg ohne native App und funktioniert auf iOS Safari und Android Chrome.
- Jedes aufgenommene Foto erscheint als Thumbnail in einer Liste, mit Lösch-Icon.
- Mehrere Fotos in Folge möglich (Button bleibt sichtbar, „Noch ein Foto").
- Unten ein dicker grüner Button **„Alle hochladen (N)"** → schickt die Fotos an `POST /upload-sessions/:id/dateien` (mit Token-Header).
- Nach Upload: Erfolgs-Screen mit Häkchen, „Du kannst weitere Fotos machen" oder „Sitzung beenden".
- Vor dem Hochladen werden Bilder client-seitig auf max. ~1600 px lange Kante komprimiert, damit sie auf 4G/3G zügig durchgehen.

Diese Route braucht keinen Login — der Session-Token in der URL ist bewusst kurzlebig (15 min) und an genau diese eine Hochlade-Aktion gebunden.

### Datenfluss (kurz, ohne Code)

```text
Desktop (Dokumente-Seite)
  └── Klick „Vom Handy scannen"
        └── erzeugt Upload-Session (id, token)
        └── zeigt QR-Code mit URL /m/upload/<session>
        └── pollt alle 1.5s neue Dateien

Handy (scannt QR)
  └── /m/upload/<session>
        └── Foto(s) aufnehmen (Kamera-API)
        └── komprimieren → POST an Session
        └── Bestätigung

Desktop (live)
  └── neue Fotos erscheinen in Dialog + in Dokumente-Liste
```

### Was angefasst wird

- `src/routes/dokumente.tsx` — Drop-Zone, Datei-Upload-Logik, „Vom Handy scannen"-Button, Mobile-Card-Liste statt nur Tabelle (passend zum allgemeinen Mobile-Refactor).
- Neue Komponente `src/components/dokumente/DokumentUploader.tsx` — gemeinsame Upload-Funktion für Drop + Klick.
- Neue Komponente `src/components/dokumente/HandyScanDialog.tsx` — QR-Anzeige + Live-Liste.
- Neue Route `src/routes/m.upload.$session.tsx` — Foto-Capture für das Handy.
- `src/lib/api/types.ts` — neuer Typ `UploadSession` (`id`, `token`, `erstelltAm`, `ablaufAm`, `dateien: Dokument[]`).
- `src/hooks/useApi.ts` — `useUploadSession`, `useUploadSessionLive`, `useUploadDateien`.
- `src/lib/mock/backend.ts` — Endpoints `POST /upload-sessions`, `GET /upload-sessions/:id`, `POST /upload-sessions/:id/dateien`. Eingehende Dateien werden zusätzlich als reguläre `Dokument`-Einträge gespeichert (so erscheinen sie automatisch in der Hauptliste).
- `package.json` — Abhängigkeit `qrcode.react` für die QR-Code-Anzeige.

### Wichtig zu wissen

- Voll funktionsfähig im Mock-Modus auf einem einzelnen Gerät mit denselben localStorage-Daten (zum Demonstrieren). Für die *echte* Geräte-übergreifende Nutzung Desktop ↔ Handy braucht es das Pi-Backend mit gemeinsamer DB — die API-Form ist aber bereits exakt so geschnitten, dass das Pi-Backend sie 1:1 erfüllt.
- Im Live-Modus (Pi im LAN) ist die QR-URL eine LAN-IP, z. B. `http://mcc.local/m/upload/<token>` — funktioniert auch ohne Internet, solange Handy + Pi im selben WLAN sind.
- Datenschutz: Session-Token ist 32 Zeichen zufällig, läuft nach 15 min ab, ist nach Abschluss nicht wiederverwendbar.
- Keine Sparkles/Glitzer-Icons (Memory-Regel beachtet).
