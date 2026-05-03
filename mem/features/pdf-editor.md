---
name: PDF-Editor (Live)
description: Eigene Route, links Live-Preview mit Click-to-Edit-Hotspots + Inline-Popover-Editor, rechts Tab-Editor, Autosave
type: feature
---

# PDF-Editor v2

## Routen
- `/angebote/:id/bearbeiten`
- `/rechnungen/:id/bearbeiten`

## Layout
- **Links (resizable, default 55 %):** `LivePdfPreview` rendert `pdfmake`-PDF aus Draft via `react-pdf`, debounced 300 ms.
- **Rechts (45 %):** `EditorPanel` mit Tabs (Stammdaten, Positionen, Texte/Optionen, Logo/Firma).
- **Mobile:** Toggle Bearbeiten/Vorschau.

## Hotspots & Inline-Edit
- `src/lib/pdf/hotspotTracker.ts`: nutzt pdfmake `pageBreakBefore`-Callback, sammelt `startPosition` aller Nodes mit `id`, baut `RuntimeHotspot[]` (page, x, y, w, h in pt). Höhe = Abstand zum nächsten Hit auf der Seite.
- `src/lib/pdf/belegPdf.ts` vergibt Anker-IDs: `kunde`, `meta`, `titel`, `anrede`, `intro`, `tabelle`, `summe`, `outro` und pro Position `pos:<id>`.
- `generateAngebotPdf` / `generateRechnungPdf` geben `{ blob, hotspots }` zurück (`PdfBuildResult`).
- `PdfFieldOverlay` rendert pro Seite eine absolute Schicht, skaliert pt → CSS-px (`scale = renderWidth / 595.28`). Hover = Box-Border (border-2 dashed primary, 4 px Außenversatz, `shadow-[0_0_0_3px_rgba(59,130,246,0.18)]` wenn offen) — **um die Box, nicht am Text**.
- Klick öffnet Radix `Popover` mit `HotspotInlineEditor` (Render-Prop aus `PdfEditorLayout`). Inhalt je `fieldId`: Titel/Intro/Outro = `Textarea`, Position = 3 Inputs + Beschreibung, Stammdaten/Komplex = Hinweis + „Erweitert"-Button → öffnet rechtes Tab und ruft `editor.focusField`.
- Fallback-Hotspots `FALLBACK_HOTSPOTS_SEITE_1` (prozentual) greifen nur, wenn der Tracker leer bleibt.

## Stabilität
- Alte Blob-URL bleibt sichtbar, bis neue gerendert ist (kein Flicker). Build-Fehler zeigen Banner, behalten alte Vorschau.
- Multi-Seiten funktionieren automatisch — pro Seite eigener Overlay-Layer mit gefilterten Hotspots.
- Speicherpfad bleibt `useBelegEditor.save()` (Autosave 1.5 s); `generateXxxPdf` ist die einzige Wahrheit für Vorschau **und** Export.

## Wichtige Dateien
- `src/lib/pdf/belegPdf.ts` (Anker-IDs, Tracker-Aufruf, `PdfBuildResult`)
- `src/lib/pdf/hotspotTracker.ts`
- `src/lib/pdf/fieldMap.ts` (Tab/Label-Map + Fallback-Geometrie)
- `src/components/pdf-editor/LivePdfPreview.tsx`
- `src/components/pdf-editor/PdfFieldOverlay.tsx`
- `src/components/pdf-editor/HotspotInlineEditor.tsx`
- `src/components/pdf-editor/PdfEditorLayout.tsx`
