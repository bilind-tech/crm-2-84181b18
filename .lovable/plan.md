## Ziel
Der Druck soll auf dem Mac sauber funktionieren:
- 1-seitige PDFs erscheinen im Druckdialog als genau 1 Seite
- Logo und oberer Bereich werden nicht abgeschnitten
- lange Rechnungen/Angebote/Protokolle laufen sauber über 2, 3 oder mehr Seiten

## Plan

### 1. Die Druckstrategie in `src/lib/pdf/printBlob.ts` aufteilen
Ich stelle den Druck auf zwei klare Wege um:

- **Safari/WebKit auf macOS/iOS:** nicht mehr über das aktuelle versteckte Rasterbild-`iframe` drucken
- **andere Browser:** bestehende Inline-Print-Strategie behalten und nur gezielt härten

Hintergrund: Im aktuellen Code ist bereits kommentiert, dass Safari/iOS automatisch über einen neuen Tab laufen soll, aber diese Sonderbehandlung ist faktisch noch nicht implementiert. Genau dort liegt sehr wahrscheinlich die Lücke.

### 2. Für Safari den nativen PDF-Druck verwenden
Für Safari/WebKit wird der Druck aus dem **Original-PDF** ausgelöst statt aus gerenderten PNG-Seiten.

Geplant:
- Browser/WebKit-Erkennung ergänzen
- aus dem Blob eine sichere temporäre Blob-URL erzeugen
- beim Klick synchron einen Druck-Tab/Preview öffnen, damit kein Popup-Blocker greift
- dort das PDF nativ laden
- danach normal aus Safaris PDF-Ansicht drucken

Erwarteter Effekt:
- Safari nutzt dann die echte PDF-Seitengröße statt ein HTML-Layout mit zusätzlicher Drucklogik
- Phantom-Seiten durch HTML-/`iframe`-Umbruch entfallen
- der obere Rand mit Logo wird nicht mehr durch den WebKit-Print-Container abgeschnitten

### 3. Den HTML-Print-Fallback für Nicht-Safari robuster machen
Der bestehende `iframe`-Pfad bleibt für Chrome/andere Browser erhalten, wird aber bereinigt:

- Seitencontainer nur dort verwenden, wo der Browser stabil mit `@page` umgeht
- letzten Seitenumbruch explizit neutralisieren
- feste A4-Größe nur pro Seite, nicht als globales Dokument-Zwangslayout
- weiterhin kein Inline-Whitespace und keine versehentlichen Zusatzhöhen

Damit bleibt der bisherige Vorteil erhalten: PDFs können dort weiter direkt im aktuellen Tab gedruckt werden.

### 4. `PrintButton` an den Safari-Pfad anbinden
In `src/components/pdf/PrintButton.tsx` binde ich die neue Safari-Logik sauber an den bestehenden Klickfluss an:

- Tab/Fenster wird direkt im User-Klick geöffnet
- danach wird der Blob in diesen Druckpfad übergeben
- bestehende Fehlerbehandlung und Toasts bleiben erhalten
- kein unnötiger Eingriff in Angebot/Rechnung/Protokoll-Routen

### 5. Saubere Validierung nach der Umsetzung
Ich prüfe danach gezielt diese Fälle:

1. **1-seitige Rechnung/Angebot/Protokoll** → im Druckdialog nur 1 Seite
2. **mehrseitige Rechnung** → sauberer Seitenwechsel ohne Beschnitt oben
3. **Logo/Briefkopf oben links** → vollständig sichtbar
4. **keine Regression** bei Download/Viewer/normaler PDF-Anzeige

## Technische Details

**Dateien mit Änderungen:**
- `src/lib/pdf/printBlob.ts`
- `src/components/pdf/PrintButton.tsx`

**Bewusst nicht anfassen:**
- PDF-Inhalte / Layoutdefinitionen in `belegPdf.ts`, `werkzeugePdf.ts`, `backend/src/pdf/layout.ts`
- Routen für Rechnungen, Angebote, Protokolle

**Warum dieser Ansatz:**
- Das Problem sitzt sehr wahrscheinlich nicht mehr im PDF selbst, sondern in der **Druckdarstellung von Safari/WebKit**
- Der aktuelle Fix hat nur das HTML-/Bild-Layout verändert
- Auf dem Mac ist für exakte Seitengrößen der **native PDF-Druck** der zuverlässigste Weg, besonders bei langen Dokumenten