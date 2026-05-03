Ich habe den aktuellen Fehler eingegrenzt: Die PDF-Datei wird inzwischen offenbar erzeugt, aber die Anzeige scheitert am PDF-Viewer. In der Konsole steht:

```text
Setting up fake worker failed: "Module name, 'pdf.worker.mjs' does not resolve to a valid URL."
```

Das heißt: Der erzeugte PDF-Blob ist wahrscheinlich vorhanden, aber `react-pdf`/PDF.js kann seinen Worker nicht laden. Deshalb verschwindet der Spinner und es bleibt leer bzw. im Live-Editor erscheint „PDF kann nicht angezeigt werden“.

Plan zur Reparatur:

1. PDF.js-Worker korrekt dort setzen, wo `react-pdf` genutzt wird
   - Die bisherige Datei `src/lib/pdf/pdfjsWorker.ts` setzt den Worker separat.
   - Laut `react-pdf` v10 muss `pdfjs.GlobalWorkerOptions.workerSrc` im gleichen Modul gesetzt werden, in dem `<Document>`/`<Page>` gerendert werden, weil `react-pdf` sonst später wieder den Default `pdf.worker.mjs` setzen kann.
   - Ich passe `PdfViewerDialog.tsx` und `LivePdfPreview.tsx` so an, dass sie direkt `pdfjs` importieren und den Worker mit `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString()` konfigurieren.

2. Anzeige-Fehler sichtbar und diagnostizierbar machen
   - In `PdfViewerDialog.tsx` und `LivePdfPreview.tsx` ergänze ich `onLoadError`, damit der genaue PDF.js-Fehler in der UI angezeigt wird statt nur „nichts“ oder einem generischen roten Text.
   - Dadurch sieht man bei zukünftigen PDF-Problemen sofort, ob der PDF-Blob defekt ist oder nur der Viewer nicht laden kann.

3. Detailseite wirklich mit Vorschau statt nur Status-Karte versehen
   - Die Detailseite zeigt aktuell nur eine kompakte Karte „PDF bereit“ plus Button; sie rendert die PDF nicht inline.
   - Ich erweitere `PdfPreviewCard`, sodass bei `status === "ready"` und vorhandener `pdfUrl` eine kleine erste-Seite-Vorschau direkt in der Detailseite angezeigt wird.
   - Der Button „PDF ansehen“ öffnet weiterhin den großen Dialog.

4. Doppelte PDF-Erzeugung vermeiden
   - Momentan erzeugt die Detailseite über `useRechnungPdf(r)` eine PDF und der `PdfViewButton` erzeugt beim Öffnen nochmal eine eigene PDF. Das kann zu leeren Zuständen und unnötiger Arbeit führen.
   - Ich passe die Komponenten so an, dass die Detailseite ihre bereits erzeugte `pdf.url/status/error` an den Viewer-Button übergeben kann.
   - Für Listen/Übersichten bleibt der Button weiterhin selbstständig, damit das Auge-Icon dort funktioniert.

5. Live-Editor stabilisieren
   - `LivePdfPreview.tsx` nutzt denselben reparierten Worker.
   - Wenn PDF.js einmal noch nicht laden kann, bleibt die erzeugte Datei/Fehlermeldung nachvollziehbar, statt nur rot und unklar zu bleiben.

6. Kurztest nach Umsetzung
   - Rechnung erstellen/öffnen: Detailseite zeigt PDF-Vorschau.
   - „PDF ansehen“: Dialog zeigt Seiten statt leerem Bereich.
   - „PDF bearbeiten“: Live-Editor zeigt die PDF links.
   - Auge-Icon in Rechnungsübersicht: Dialog zeigt PDF korrekt.

Technische Dateien, die ich voraussichtlich ändere:

```text
src/components/pdf/PdfViewerDialog.tsx
src/components/pdf/PdfPreviewCard.tsx
src/components/pdf/PdfViewButton.tsx
src/components/pdf-editor/LivePdfPreview.tsx
src/routes/rechnungen.$id.tsx
src/routes/angebote.$id.tsx
```

Optional kann `src/lib/pdf/pdfjsWorker.ts` danach entweder ungenutzt bleiben oder auf die neue Worker-Konfigurationsfunktion reduziert werden. Wichtig ist aber: Der Worker muss direkt in den Viewer-Modulen gesetzt werden.