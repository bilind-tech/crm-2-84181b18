## Drei PDF-Korrekturen (Angebot + Rechnung)

Alle Änderungen betreffen den PDF-Renderer. Da Frontend (`src/lib/pdf/belegPdf.ts`) und Backend (`backend/src/pdf/layout.ts`) identische Logik haben, werden beide Dateien parallel angepasst.

### 1. „Std." statt „h" bei Stunden-Positionen
In `stundenText()` die Ausgabe von `"${menge} h"` auf `"${menge} Std."` ändern.

### 2. Beschreibungstext nicht mehr automatisch als Bullet-Liste
Aktuell macht `beschreibungBlock()` aus jeder Zeile nach der ersten automatisch einen Bullet-Punkt — auch ohne `•`/`-`/`*`. Beispiel: „Büro Grundreinigung\nAm Grauen Stein 27, Köln" → „Köln-Zeile" bekommt einen Punkt davor.

Neue Regel:
- Erste nicht-leere Zeile = fetter Titel (wie bisher).
- Folgezeilen werden **nur dann** als Bullets gerendert, wenn sie mit `•`, `-` oder `*` beginnen.
- Folgezeilen ohne Marker werden als normale Textzeilen (Stack) untereinander gerendert — kein Bullet-Punkt.
- Mischung erlaubt (z. B. Adresse + danach 3 Bullet-Punkte funktioniert).

### 3. Ansprechpartner im Empfänger-Adressblock anzeigen
Aktuell zeigt der große Adressblock links nur: Firmenname, Person (aus Kunde-Stammdaten), Straße, PLZ Ort. Der explizit am Beleg gewählte **Ansprechpartner** (`ap`) wird ignoriert.

Neu in `kundeAdresse(k, ap)`:
- Zeile 1: Firmenname (falls vorhanden)
- Zeile 2: Ansprechpartner-Name (`ap.vorname ap.nachname`), Fallback auf Kunde `vorname nachname`
- Zeile 3: Straße
- Zeile 4: PLZ + Ort
- Zeile 5: Land (falls ≠ Deutschland)

Signatur wird um `ap?: Ansprechpartner` erweitert und beide Aufrufstellen (Angebot/Rechnung) übergeben den vorhandenen Ansprechpartner.

### Technische Details

Dateien:
- `src/lib/pdf/belegPdf.ts` — Funktionen `stundenText`, `beschreibungBlock`, `kundeAdresse` + Aufruf in `baseContent`
- `backend/src/pdf/layout.ts` — gleiche drei Funktionen spiegeln

Nicht betroffen:
- Datenmodell, Validierung, Belegnummern, Tabellenspalten, Summen
- Backend-Migration (Schema unverändert)

Tests: bestehende `backend/test/pdf.spec.ts` läuft weiter (Smoke-Test prüft nur Header/Buffer, kein Pixel-Diff).
