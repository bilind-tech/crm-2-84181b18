## Problem (laut Screenshot)

Im macOS-Druckdialog wird ein 1-seitiges PDF als **2 Seiten** dargestellt und das Logo oben wird abgeschnitten. Ursache liegt in `src/lib/pdf/printBlob.ts` (`buildPrintHtml`):

1. `.page { height: 297mm }` füllt die A4-Höhe komplett aus. Safari erzwingt jedoch eine minimale, nicht abschaltbare Druckermargin und addiert (bei aktivierten "Kopf- und Fußzeilen") zusätzlich Header/Footer-Höhe. Dadurch überläuft die Seite um wenige Millimeter → der Browser bricht eine **zweite, fast leere Seite** auf.
2. Das Bild ist mit `object-fit: contain` auf 210 × 297 mm vertikal zentriert. Sobald der Drucker oben/unten ~5 mm Margin erzwingt, wird das obere Drittel (Logo) **abgeschnitten**, weil der Inhalt nicht skaliert, sondern weggeschnitten wird.
3. Safaris Kopf-/Fußzeilen-Option (im Screenshot aktiv) lässt sich aus dem Web nicht deaktivieren — wir müssen das Layout robust gegen diese Zusatzhöhe machen.

## Lösung (nur `src/lib/pdf/printBlob.ts`)

`buildPrintHtml` so umbauen, dass jede PDF-Seite garantiert auf **genau eine** physische Druckseite passt — auch wenn der Browser zusätzliche Randhöhe reserviert:

- `@page { size: A4; margin: 0 }` beibehalten, zusätzlich `html, body { width: 210mm; height: 297mm; margin: 0; padding: 0 }`.
- `.page`-Container: feste Breite **210mm**, Höhe **297mm**, `overflow: hidden`, `page-break-after: always`, letzter `.page` mit `page-break-after: avoid` (nicht nur `auto`) — verhindert das Phantom-Blatt.
- Das Bild **passend skalieren** statt zuschneiden:
  - `width: 100%`, `height: 100%`, `object-fit: contain`, `object-position: top center` (verankert oben, sodass Logo nie verschwindet, wenn der Drucker minimal stutzt).
  - `display: block`.
- Zusätzlich `body { -webkit-print-color-adjust: exact; print-color-adjust: exact }` für farbtreue Logos.
- Sicherheitspuffer gegen Sub-Pixel-Overflow: `.page { box-sizing: border-box; line-height: 0; font-size: 0 }` — entfernt unsichtbaren Inline-Whitespace nach `<img>`, der bisher die effektive Höhe um ~4 px nach unten verschiebt und so die zweite Seite auslöst.
- Keine Veränderung an Renderauflösung (`PRINT_DPI = 2`), `printViaHiddenIframe`-Logik oder dem öffentlichen API (`printPdfBlob`, `printPdfBlobUrl`).

## Erwartetes Ergebnis

- Im Druckdialog erscheint für ein 1-seitiges PDF nur **„Seite 1 von 1"**.
- Logo und Adressblock oben sind vollständig sichtbar (Verankerung `top center` + `contain` verhindern Beschnitt).
- Mehrseitige Rechnungen brechen weiterhin sauber Seite für Seite um (`page-break-after: always` zwischen Seiten).

## Out of Scope

- Keine Änderung an pdfmake-Layouts (`backend/src/pdf/layout.ts`, `src/lib/pdf/belegPdf.ts`, `werkzeugePdf.ts`).
- Keine UI-/Button-/Hook-Änderungen (`PrintButton.tsx`, `useBelegPdf.ts`).
- Kein Eingriff in `pdfjsWorker`/Renderer.
