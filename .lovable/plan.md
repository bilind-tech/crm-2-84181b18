
# Step 5 — PDF-Rendering im Pi-Backend

## Ziel
Server-seitige, deterministische PDF-Generierung für Angebote und Rechnungen direkt auf dem Pi. Gleiche Optik wie das bestehende `src/lib/pdf/belegPdf.ts` (pdfmake-Layout, Mustervorlage MyCleanCenter), aber:
- erzeugt im Backend, damit derselbe Bytestrom später per E-Mail versendet, in Drive abgelegt und im Frontend angezeigt wird
- mit Cache, ETag, Konsistenz-Hash und Vorbereitung für den Auto-Drive-Upload aus Step 6
- Bestand bleibt: Frontend-Generator weiter verfügbar, nutzt aber bevorzugt das Backend, wenn online

Mock-Modus bleibt: Wenn kein Pi konfiguriert ist, fällt die UI weiterhin auf den Browser-Generator zurück.

## Backend

### 1. Library
- `pdfmake` serverseitig in Node 20 (LTS) — funktioniert, weil das Backend auf dem Pi (echtes Node) läuft, nicht im Worker. (Lovable Cloud / Worker-Runtime ist hier irrelevant — der Pi-Backend-Stack ist standalone Fastify.)
- Schriften: Roboto (Standard von pdfmake) als VFS, gebündelt aus `pdfmake/build/vfs_fonts.js`.
- Logo: aus Datei (`/var/lib/mycleancenter/branding/logo.png`) wenn vorhanden, sonst aus `firmendaten`-Override (Base64 in DB, identisch zur bestehenden `optionen.logoOverride`-Logik).

### 2. Module unter `backend/src/pdf/`
- `pdfmake.ts` — initialisiert pdfmake-Printer einmalig (VFS + Fonts). Gibt einen `Printer` aus, der `createPdfKitDocument(definition)` liefert (Stream-API).
- `layout.ts` — portiert die reinen Layout-Bauer aus `src/lib/pdf/belegPdf.ts` (header/footer/leistungstabelle/summenBlock/anrede/intro/outro). Identische Funktionsnamen, gleiche Strukturen, damit Frontend- und Backend-Output Pixel-/Layout-gleich bleiben.
- `belegPdf.server.ts` — `renderAngebotPdf(angebot, kunde, firma, ansprechpartner)` und `renderRechnungPdf(...)`, geben `Buffer` zurück. Liest Optionen-Overrides (Intro/Outro/Logo/Firma) genauso wie der Client.
- `cache.ts` — Datei-Cache unter `${dataDir}/pdf-cache/{angebot|rechnung}/{id}-{hash}.pdf`.
  - `hash = sha256(JSON({nummer, geaendertAm, brutto, positionenHash, optionenHash, firmaHash}))`
  - Lookup: wenn Datei existiert → direkt zurück. Sonst rendern + atomar `rename` reinschreiben.
  - Garbage-Collection: bei Belegänderung alte Dateien zu derselben `id` löschen.
- `streams.ts` — Helfer `pdfKitToBuffer(stream)` (sammelt chunks zu Buffer), `etag(buffer)` (sha256-prefix).

### 3. Belege-Repos integrieren
- `belegnummer.ts`/`updateRechnung`/`updateAngebot`/`addZahlung` etc. werden NICHT verändert. Aber:
  - Status-Engine triggert `pdfCache.invalidate(belegId)` bei jeder relevanten Mutation (über kleine Events in `belege/events.ts`).
  - Mutationen sind `cacheBust=true` für die nächste GET-Anfrage des PDFs.

### 4. Routes unter `backend/src/routes/belege-pdf.ts`
- `GET /angebote/:id/pdf` und `GET /rechnungen/:id/pdf`
  - Auth: bestehende `requireAuth`-Middleware.
  - Liest Beleg + Kunde + Firmendaten + ggf. Ansprechpartner.
  - Berechnet Hash, prüft Cache, rendert wenn nötig.
  - Antwort: `application/pdf`, `Content-Disposition: inline; filename="{Nummer} {Kundenname}.pdf"`, `ETag: "<hash>"`, `Cache-Control: private, max-age=0, must-revalidate`.
  - Unterstützt `If-None-Match` → `304` ohne Body.
- `GET /angebote/:id/pdf/meta` und `GET /rechnungen/:id/pdf/meta`
  - Liefert `{ etag, groesseBytes, erzeugtAm, dateiname }` ohne Bytestrom — fürs Frontend, um Cache-Status anzuzeigen.
- `POST /angebote/:id/pdf/regenerieren` (gated, nur bei Bedarf) — invalidiert Cache und rendert sofort neu.

Routes werden in `server.ts` registriert.

### 5. Drive-Vorbereitung (kein vollständiger Upload — der kommt in Step 6)
- `belege/events.ts` exportiert `onBelegVersendet(belegId, art)`. Step 6 hängt sich dort ein. In Step 5 nur Stub + Logger.
- Bei `POST /angebote/:id/senden` / `POST /rechnungen/:id/senden`: nach Status-Update `events.onBelegVersendet(id, art)` rufen — der Event-Handler (für Drive) wird in Step 6 implementiert.

### 6. Tests `backend/test/pdf.spec.ts` (Vitest)
- `renderAngebotPdf` liefert nicht-leeren Buffer mit `%PDF-`-Header.
- Cache: zweiter Aufruf liefert exakt dieselben Bytes (Buffer-Equality).
- Mutation an einer Position invalidiert Cache (zweiter Render = neue Bytes, neuer ETag).
- HTTP-Smoke-Test via Fastify `inject`: `GET /rechnungen/:id/pdf` → `200`, `application/pdf`, `ETag` gesetzt; `If-None-Match` → `304`.
- Layout-Sanitäts-Check: `pdftotext` Aufruf optional skippen, wenn binary fehlt; sonst prüfen, dass Belegnummer + Kundenname im Text vorkommen. (Skip-fähig — Tests laufen auch ohne Poppler.)

## Frontend

### 1. Neuer Hook-Pfad
- `src/lib/pdf/belegPdfBackend.ts`:
  - `fetchAngebotPdf(id): Promise<Blob>` und `fetchRechnungPdf(id)` — über `piApi.get` als ArrayBuffer.
  - `fetchAngebotPdfMeta(id)` / `fetchRechnungPdfMeta(id)`.
- `useBelegPdf.ts` umstellen:
  - Wenn Backend-URL konfiguriert (`isBackendUrlExplicit()`), Backend-PDF nutzen.
  - Sonst auf den bestehenden Browser-Generator (`generateAngebotPdf`/`generateRechnungPdf`) fallen — Demo-/Offline-Modus bleibt erhalten.
  - Public Surface (`{ url, status, error }`) bleibt unverändert. Konsumenten (`PdfPreviewCard`, `PdfViewerDialog`, `LivePdfPreview`, `EmailVersandDialog`, `MahnSektion`) müssen nicht angefasst werden.

### 2. API-Client
- `src/lib/api/client.ts`: `PI_PREFIXES` deckt `/angebote/` und `/rechnungen/` schon ab. Pdf-Subpfade matchen also automatisch.
- `piClient` muss ArrayBuffer/Blob unterstützen — falls nicht, dort kleine `getBlob(path)`-Methode ergänzen.

### 3. ETag-Caching im Browser
- Im Hook: letztes ETag pro Beleg-ID in Memory-Map. Bei reload conditionally-GET; bei `304` weiter den vorhandenen Blob/URL nutzen, sonst neuen Blob bauen.

## Out-of-Scope (kommt in Step 6)
- Echte Drive-Uploads, Mailversand mit PDF-Anhang, Mahnungs-PDF-Varianten, Wasserzeichen für Entwürfe. Step 5 liefert nur den deterministischen Renderer + Endpoints + Cache + Hooks/Events.

## Risiken & Mitigation
- **pdfmake-Output kann auf Server vs. Browser leicht differieren** (Font-Hinting). Mitigation: identische Roboto-VFS auf beiden Seiten; Tests vergleichen nicht Pixel, sondern strukturelle Inhalte (Belegnummer/Beträge im extrahierten Text).
- **Speicherverbrauch bei großen Belegen**: pdfmake puffert. Akzeptabel auf Pi 5 (8 GB) bei realistischen Belegen (≤ 50 Positionen). Cache verhindert Mehrfach-Renderings.
- **Cache-Konsistenz**: Hash bezieht alle ausgabe-relevanten Felder ein (inkl. `geaendertAm` aus Repo-Triggern). Kein TTL nötig.

## Akzeptanzkriterien
- `GET /rechnungen/:id/pdf` liefert ein gültiges PDF mit Belegnummer im Dateinamen und im Inhalt.
- Zweiter Aufruf direkt aus Cache (kein Re-Render messbar in Logs).
- Änderung an einer Position bricht den Cache, neue Bytes, neuer ETag.
- Frontend zeigt im Online-Modus das Backend-PDF, im Demo-Modus weiterhin das Browser-PDF — ohne sichtbare Änderung der UI.
- Vitest-Suite `backend/test/pdf.spec.ts` grün, alle bestehenden Tests bleiben grün.

Sag „weiter" — dann implementiere ich Step 5 in dieser Reihenfolge: Library + Layout-Port → Cache → Routes → Server-Wiring → Frontend-Hook-Umstellung → Tests.
