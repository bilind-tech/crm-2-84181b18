## Ziel

Beim Bearbeiten von Übergabe-/Abnahme- und Schlüsselübergabeprotokollen darf die PDF-Vorschau nicht mehr flackern. Click-to-Edit über die PDF, Tabs rechts und der Abschluss-Flow bleiben unverändert — sie werden nur ruhiger und vorhersagbarer.

## Ursachenanalyse (gemessen im aktuellen Code)

`src/components/protokoll-editor/ProtokollLivePreview.tsx` macht zwar einen „atomaren Swap" über ein verstecktes Pending-`<Document>`, hat aber **drei** echte Flackerquellen:

1. **`key` wechselt beim Swap**
   ```tsx
   <Document key={`buf#${pdfBuffer?.byteLength}#${loadAttempt}`} … />
   ```
   Bei jedem neuen Buffer hängt die `byteLength` mit drin → React unmountet das gesamte `<Document>` inkl. aller Page-Canvases → kurzer Weißblitz → Remount + neues Rendern. Das ist der Hauptflicker beim Tippen.

2. **`setNumPages` wird auch vom Pending-Document gesetzt**
   Im versteckten Pre-Loader steht `onLoadSuccess={({ numPages }) => { setNumPages(numPages); … }}`. Wenn die neue PDF eine andere Seitenzahl hat (z. B. Schlüsselliste wächst auf Seite 2), springt die sichtbare Liste **vor** dem Buffer-Swap auf die neue Zahl → kurz fehlende oder leere Seiten.

3. **`kunde` / `objekt` / `firma` als Effekt-Dependencies**
   Der Build-Effekt hängt direkt an den React-Query-Objekten. Jedes Refetch/Background-Refresh ändert die Identität → unnötiger PDF-Rebuild ohne inhaltliche Änderung → Flackern ohne User-Input.

Zusätzlich in `werkzeugePdf.ts`: `generateProtokollPdf` baut bei jedem Tastendruck pdfmake komplett neu auf (inkl. Font-Setup). Das ist unvermeidbar teuer, aber wir können den Build deduplizieren, damit nicht zwei parallele Builds gleichzeitig laufen und sich gegenseitig swappen.

## Plan

### 1. Stabilen Document-`key` verwenden

`src/components/protokoll-editor/ProtokollLivePreview.tsx`:
- `key={`buf#${pdfBuffer?.byteLength}#${loadAttempt}`}` → `key={`pdf-${loadAttempt}`}`
  (nur bei echtem Detach-Retry remounten; sonst diffen lassen — `react-pdf` rendert dann die neue `file`-Prop in-place ohne Weißblitz).

### 2. `numPages` nur nach Swap setzen

- Im versteckten Pending-`<Document>` `setNumPages(numPages)` **entfernen**.
- `setNumPages` ausschließlich im sichtbaren `onLoadSuccess` aufrufen, das nach dem Swap automatisch feuert (frische `file`-Prop).
- `numPages` während des Swaps **nicht** zurücksetzen → keine Seiten verschwinden kurzzeitig.

### 3. Effekt-Dependencies semantisch machen

- Statt direkt `[draftKey, kunde, objekt, firma]` einen zweiten `semKey` für `{ kunde, objekt, firma }` bilden und nur den String in die Deps geben.
- Verhindert PDF-Rebuilds bei React-Query-Refetches ohne Datenänderung.

### 4. Parallele Builds verhindern

- In den Build-Effekt einen `inFlightRef` einbauen: läuft schon ein Build, neuen erst nach `await` starten — das vermeidet zwei konkurrierende Swaps direkt hintereinander beim schnellen Tippen.
- `DEBOUNCE_MS` von 350 → **450 ms** (ruhiger beim Tippen, kein spürbarer Lag).

### 5. Pending-Document nur zeigen wenn nötig

- Aktuell wird das versteckte `<Document>` jedes Mal gemountet, wenn `pendingBuffer !== pdfBuffer`. Beim ersten Build (`pdfBuffer === null`) den Pending-Pfad **überspringen** und direkt in `pdfBuffer` setzen — sonst dauert der initiale Sichtbar-Werden-Moment doppelt so lang.

### 6. Konsistenz: identische Fixes auf `LivePdfPreview.tsx` anwenden

Damit Angebot/Rechnung dasselbe ruhige Verhalten haben (Punkte 1–4). Verhalten/Click-to-Edit bleibt 1:1.

### Bewusst NICHT geändert

- pdfmake-Pipeline / Inhalt der PDFs.
- Hotspot-Logik, `ProtokollHotspotEditor`, Tabs, Abschluss-Button.
- Datenmodell `ProtokollOptionen`.
- Keine Umstellung auf `html2canvas`/`jsPDF` (würde Hotspots, scharfe Vektoren und Drive-Upload-Qualität kaputtmachen).

## Geänderte Dateien

- `src/components/protokoll-editor/ProtokollLivePreview.tsx` — Punkte 1–5
- `src/components/pdf-editor/LivePdfPreview.tsx` — Punkte 1–4 (Konsistenz)

## Akzeptanzkriterien

- Tippen in beiden Protokoll-Tabs (Übergabe + Schlüssel) erzeugt **keinen Weißblitz** mehr in der Vorschau; Seiten bleiben sichtbar bis die neue PDF tauscht.
- Seitenanzahl springt nicht mehr kurz auf falsche Werte, wenn Schlüsselzeilen einen Umbruch verursachen.
- Reine Hintergrund-Refetches (z. B. Kundenliste) lösen **keinen** Rebuild mehr aus.
- Click-to-Edit, Tabs (Stammdaten/Inhalt/Unterschriften/Optionen) und Abschluss funktionieren unverändert.
