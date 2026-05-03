# PDF-Editor v2 — Bombastischer Live-Editor

## Ziel
Der Editor unter `/angebote/:id/bearbeiten` und `/rechnungen/:id/bearbeiten` wird zum echten "WYSIWYG-Live-Editor": Hover zeigt eine saubere Box-Umrandung **um den jeweiligen PDF-Bereich** (nicht eng am Text), Klick öffnet ein Inline-Popover direkt am Hotspot zum Sofort-Tippen, alle Seiten (auch Folgeseiten) haben funktionierende Hotspots, und das gespeicherte PDF sieht **exakt** wie die Vorschau aus.

## Heutiger Stand (kurz)
- `LivePdfPreview` rendert pdfmake-PDF debounced via `react-pdf`.
- `PdfFieldOverlay` legt prozentuale Hotspots **nur über Seite 1** (`HOTSPOTS_SEITE_1`).
- Hotspots sind hart in `fieldMap.ts` codiert → bei Inhaltswachstum (lange Adressen, viele Positionen → Folgeseiten) verrutschen sie.
- Klick auf Hotspot scrollt ins rechte Panel, **kein Inline-Edit**.
- Folgeseiten (Seite 2+) haben gar keine Hotspots.

## Was wir bauen

### 1. Echte Koordinaten statt Schätzung — `pdfmake`-Layout-Tracking
Wir hängen pro PDF-Bereich einen unsichtbaren **Anker** im pdfmake-Doc an (`id: "feld:titel"` über `pdfmake`'s `Node.id`). Nach dem Build lesen wir die tatsächlichen Positionen aus dem fertigen Layout (`pdfMakeDoc.getStream` → wir nutzen den **internen `pageBreakBeforeContext`-/`positions`-Tracker** von pdfmake; alternativ `pdfDoc.getNodePosition(id)`). Daraus erzeugen wir `RuntimeHotspot[]` mit echten `{page, x, y, w, h}` in PDF-Punkten (1 pt = 1/72 in).

Datei: neu `src/lib/pdf/hotspotTracker.ts`
- Eingabe: pdfmake `TDocumentDefinitions` mit Anker-IDs
- Ausgabe: `Map<feldId, {page, x, y, w, h}>`
- Im Build von `belegPdf.ts` werden `id`-Felder vergeben für: logo, absender, kundeAdresse, meta, titel, anrede, intro, **jede Tabellenzeile als `pos:<id>`**, **summenblock**, outro, footer.

### 2. Hotspot-Layer pro Seite
- `PdfFieldOverlay` bekommt Props `pageNumber`, `pageWidth`, `pageHeight` (in pt), filtert Hotspots auf diese Seite und rechnet pt → CSS-px (`scale = renderWidth / pageWidthPt`).
- `LivePdfPreview` rendert Overlay für **jede** Seite (nicht nur Seite 1) und übergibt die laufenden Hotspots aus dem Tracker.
- Folge-Hotspots (z. B. Positionen, die auf Seite 2 umbrechen) erscheinen automatisch dort, wo pdfmake sie wirklich gerendert hat.

### 3. Visuelle Border um die Box (nicht am Text)
- Hover-Stil: `border-2 border-dashed border-primary/60 rounded-md bg-primary/5` mit kleinem `inset` (–2px) damit die Border **um** den Bereich liegt, plus Schatten-Glow `shadow-[0_0_0_3px_rgba(59,130,246,0.15)]`.
- Padding der Box wird über pdfmake-Margin gespiegelt — der Hotspot umfasst exakt den Margin-Block, nicht nur die Glyphen.

### 4. Inline-Edit-Popover (Click-to-edit live)
- Klick auf Hotspot öffnet ein **Floating-Popover** (Radix `Popover`, anchored am Hotspot) mit dem passenden Mini-Editor:
  - Titel/Anrede/Intro/Outro → `Textarea` mit Auto-Resize
  - Meta/Datum → kleine Inputs
  - Positions-Zeile → 3 Inputs (Bezeichnung, Menge, Einzelpreis)
  - Adresse → strukturierte Felder
- Live-Bind an `useBelegEditor.set()` → Tipp = sofortiger PDF-Rebuild (debounced 300 ms bleibt).
- Buttons: "Erweitert bearbeiten" → öffnet rechtes Tab-Panel auf dem passenden Feld (heutiges Verhalten als Fallback).
- ESC schließt, Tab navigiert zum nächsten Hotspot in Lese-Reihenfolge.
- Auf Mobile öffnet stattdessen ein Bottom-Sheet (gleicher Inhalt).

Neu: `src/components/pdf-editor/HotspotInlineEditor.tsx` (Switch nach `feldId`).

### 5. Stabile Vorschau ohne Flicker
- Während Rebuild bleibt das **alte PDF sichtbar** (kein "PDF wird erzeugt …" wenn schon eines da ist) — nur das kleine Sticky-"aktualisiert…"-Badge.
- `URL.revokeObjectURL` erst **nach** `onLoadSuccess` der neuen Doc, sonst Race.
- `numPages` wird pro File neu gesetzt; Scrollposition via `useLayoutEffect` erhalten.
- Build-Errors zeigen Toast + Inline-Fehlerstreifen oben, behalten aber alte Vorschau.

### 6. Robustheit & Edge-Cases
- Tracker-Ausfall (z. B. neue pdfmake-Version) → Fallback auf bisherige groben `HOTSPOTS_SEITE_1`-Boxen, damit der Editor nie "leer" ist.
- Mehrere Tabellen-Seiten: jede Position bekommt eigene `pos:<id>`-Hotspot, Klick öffnet Zeilen-Editor.
- Sehr lange Adressen / fehlende optionale Felder → Hotspots schrumpfen/verschieben sich automatisch.
- Speichern: bestehender `useBelegEditor.save()` wird **nicht** angefasst — PDF-Generator bleibt einzige Wahrheit, Inline-Edit ändert nur den Draft.

### 7. Garantie "PDF == Vorschau"
- Anzeige & Export benutzen denselben `generateAngebotPdf` / `generateRechnungPdf` (schon der Fall).
- Wir entfernen jegliche reinen UI-Overlays aus dem Export-Pfad (Hotspot-Layer ist DOM-only, nie Teil der pdfmake-Doc).
- Test: nach Save vergleichen wir SHA-256 von Preview-Blob und gespeichertem PDF in einem Dev-Assert (nur `import.meta.env.DEV`).

## Technische Details (kompakt)

```text
LivePdfPreview
 ├─ generate*Pdf(draft) ──► Blob + Hotspot-Map (Tracker)
 ├─ react-pdf <Document>
 │   └─ je Seite: <Page> + <PdfFieldOverlay pageNumber pageSize hotspots/>
 │                          └─ <button> (Hover-Border) → onClick → Popover
 │                                                                  └─ HotspotInlineEditor
 └─ Sticky-Badge "aktualisiert…"
```

Dateien:
- **neu**: `src/lib/pdf/hotspotTracker.ts`
- **neu**: `src/components/pdf-editor/HotspotInlineEditor.tsx`
- **edit**: `src/lib/pdf/belegPdf.ts` (Anker-IDs, Tracker-Aufruf, Rückgabe `{blob, hotspots}`)
- **edit**: `src/lib/pdf/fieldMap.ts` (Tab/Label-Map bleibt, Geometrie raus)
- **edit**: `src/components/pdf-editor/LivePdfPreview.tsx` (Multi-Page-Overlay, Flicker-frei)
- **edit**: `src/components/pdf-editor/PdfFieldOverlay.tsx` (pt→px-Scale, Box-Border-Style, Popover-Anker)
- **edit**: `src/components/pdf-editor/PdfEditorLayout.tsx` (Inline-Editor verkabeln)

Keine Backend-Änderungen, keine Datenmigration, keine neuen Dependencies (Radix Popover ist schon im Projekt, react-pdf/pdfmake bleiben).

## Reihenfolge der Umsetzung
1. Hotspot-Tracker + Anker in `belegPdf.ts` (Rückgabe `{blob, hotspots}`).
2. `LivePdfPreview` auf neue Rückgabe + Multi-Page-Overlay + Flicker-freier Rebuild.
3. `PdfFieldOverlay` neuer Box-Border-Style + Popover-Anker.
4. `HotspotInlineEditor` mit Mini-Editoren je Feldtyp.
5. Fallback-Geometrie + Dev-Assert "Preview == Save".
6. QA: Angebot mit 1 Seite, mit 30 Positionen (3 Seiten), Rechnung mit langer Adresse, Mobile-Bottom-Sheet.

Sag „weiter", dann setze ich Schritt 1–3 um, danach 4–6.
