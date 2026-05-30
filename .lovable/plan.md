# Plan: Druck-Tab vordergründig + Auto-Print zuverlässig

## Beobachtetes Problem

Beim Klick auf „Drucken" passieren in Safari aktuell drei Dinge, die nicht zusammenpassen:

1. Der neue Tab öffnet sich **im Hintergrund** — die Hauptseite bleibt aktiv.
2. Der Druckdialog erscheint nicht automatisch.
3. Wenn man manuell zum Tab wechselt, sieht man nur die **dunkelgraue Fläche** (`#525659` aus der Wrapper-HTML) ohne PDF-Inhalt.

## Ursachenanalyse

Drei zusammenwirkende Ursachen, alle behebbar:

**A) User-Gesture geht verloren.**
`PrintButton` öffnet `window.open("", "_blank")` synchron — gut. Aber danach läuft asynchron `getBlob()` (PDF-Erzeugung, bei „Drucken" über `getBlob` mehrere hundert Millisekunden). Erst danach kommt `document.write(...)`. Safari erkennt das nicht mehr als direkte User-Aktion → blockiert `window.print()` im Tab UND foregrounded den Tab nicht.

**B) Iframe lädt die Blob-URL im neuen Tab nicht zuverlässig.**
Blob-URLs sind origin-gebunden. Ein per `window.open("")` geöffneter Tab läuft auf `about:blank` und erbt das Parent-Origin, sollte also Zugriff haben — aber wenn der Tab beim `document.write` schon „eingefroren" im Hintergrund ist, rendert WebKit den Iframe-Inhalt erst beim Aktivieren neu, und das `load`-Event im Wrapper-Script feuert ggf. zu früh oder gar nicht → kein `window.print()`-Aufruf, nur graue Fläche.

**C) Kein `winRef.focus()`.**
Selbst wenn der Tab vordergründig öffnen sollte, holt aktuell nichts den Fokus aktiv zurück.

## Lösung

Drei chirurgische Änderungen in **`src/lib/pdf/printBlob.ts`** und **`src/components/pdf/PrintButton.tsx`**. Keine anderen Dateien.

### 1. Wrapper-HTML SOFORT in den Tab schreiben (vor PDF-Erzeugung)

`PrintButton.handleClick`: direkt nach `window.open("", "_blank")` (also noch im User-Gesture-Frame, bevor `getBlob()` läuft) wird in den Tab eine **Lade-Hülle** geschrieben:

- Gleicher dunkler Hintergrund + zentrierter „PDF wird vorbereitet…"-Spinner.
- Leeres `<iframe id="pdf">` ohne `src`.
- Das komplette Auto-Print-Script ist bereits vorhanden, wartet aber via Custom Event auf das spätere Setzen der PDF-URL.

Damit ist der Tab sofort initialisiert, der User sieht etwas Vernünftiges statt grauer Fläche, und der Tab bleibt als „aktiv beschrieben" markiert.

### 2. Blob-URL nachträglich im Child-Window setzen

Neue Hilfsfunktion `attachPdfToPrintTab(winRef, blob)` in `printBlob.ts`:

- Erzeugt `URL.createObjectURL(blob)`.
- Setzt `winRef.document.getElementById('pdf').src = url` aus dem Parent.
- Setzt zusätzlich `winRef.document.title` auf „Drucken".
- Ruft `winRef.focus()` auf → bringt den Tab nach vorne.
- Das im Tab laufende Script bekommt sein `load`-Event vom Iframe und feuert dann `window.print()`.

### 3. Auto-Print-Script robuster

Im Wrapper-Script:

- Statt nur auf `f.addEventListener('load', ready)` zu hören, zusätzlich auf ein eigenes `pdf-ready`-Event vom Parent.
- `triggerPrint()` ruft zuerst `window.focus()`, dann nach 100 ms `window.print()` — Safari braucht den Fokus zwingend.
- Wenn nach 4 s kein `load` kam, Hint einblenden („Bitte zum Drucken-Tab wechseln und Cmd+P drücken").
- `afterprint`/`visibilitychange`/`focus`-Close-Heuristik bleibt wie heute.

### 4. Fehlerpfade

- `getBlob()` schlägt fehl → bestehender Tab bekommt eine kleine Fehlerseite („PDF konnte nicht erzeugt werden. Tab kann geschlossen werden.") + Toast im Haupttab. Tab wird **nicht** automatisch geschlossen, damit der User die Meldung lesen kann.
- Popup-Blocker (`winRef === null`) → wie bisher: Toast im Haupttab.

## Erwartetes Verhalten danach

- Klick auf „Drucken" → Tab öffnet **vordergründig** mit Spinner → 1–2 s später erscheint das PDF + **Druckdialog automatisch**.
- Auf iPhone/iPad: Tab öffnet, PDF lädt, AirPrint-/Teilen-Sheet erscheint automatisch (sofern iOS-Version das aus User-Gesture erlaubt — sonst Fallback-Hinweis).
- Nach Druck/Abbruch: Tab schließt sich automatisch.

## Risiken / Grenzen

- Ob Safari den Tab **wirklich vordergründig** öffnet, hängt am Browser (Einstellung „Tabs anstatt Fenster öffnen" + „Neue Tabs im Hintergrund"). `winRef.focus()` hilft, aber Apple gibt keine Garantie. Falls der User „neue Tabs im Hintergrund" gesetzt hat, bleibt der Tab hinten — dann sieht er aber wenigstens den Spinner statt grauer Fläche und der Druckdialog poppt auf (auch ohne Tab-Wechsel).
- Auf älteren iOS-Versionen kann `window.print()` aus dem Skript blockiert sein → Fallback-Hint greift.

## Dateien

- `src/components/pdf/PrintButton.tsx` — Wrapper sofort in `winRef` schreiben, dann erst `getBlob()`.
- `src/lib/pdf/printBlob.ts` — `buildAutoPrintTabHtml` aufteilen in `buildPrintTabShellHtml` (Spinner + leeres Iframe + Script) und `attachPdfToPrintTab(winRef, blob)`; `printPdfNativeTab` ruft nur noch letzteres.
