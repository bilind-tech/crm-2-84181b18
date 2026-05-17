## Plan

1. **Drucken-Button PDF-Blob-fähig machen**
   - `PrintButton` so erweitern, dass er nicht nur `url`, sondern auch einen vorhandenen `Blob` direkt drucken kann.
   - Wenn ein Blob vorhanden ist, wird er bevorzugt genutzt, damit kein instabiler `blob:`-URL-Fetch nötig ist.

2. **Protokoll-Detailseite korrigieren**
   - In `src/routes/protokolle.$id.tsx` den Drucken-Button wie bei der Vorschau auf die direkte PDF-Quelle umstellen.
   - Entwürfe drucken dann über `pdf.blob`; abgeschlossene/archivierte Protokolle nutzen weiter die archivierte URL als Fallback.
   - Button bleibt deaktiviert, solange weder Blob noch URL bereitsteht.

3. **PDF-Dialog konsistent machen**
   - `PdfViewerDialog` ebenfalls so anpassen, dass Drucken bei vorhandener `pdfBlob` direkt über den Blob läuft.
   - Dadurch profitieren Angebot/Rechnung/andere PDF-Dialoge mit, ohne das bestehende Verhalten zu verschlechtern.

4. **Druck-Fallback verbessern**
   - Falls PDF.js das PDF nicht in Druckbilder rendern kann, bleibt der aktuelle Fallback erhalten: PDF in neuem Tab öffnen.
   - Zielverhalten: Beim Klick auf „Drucken“ öffnet sich der Browser-Druckdialog mit korrekt gerenderter PDF, nicht nur ein leerer/neuer Tab.

## Technische Details

- Ursache ist sehr wahrscheinlich dieselbe `blob:`-URL-Problematik wie bei der Vorschau: Drucken ruft aktuell `fetch(pdf.url)` auf, obwohl bei Protokoll-Entwürfen bereits ein stabiler `Blob` existiert.
- Die bestehende `printPdfBlob(blob)`-Funktion kann den Blob direkt als `ArrayBuffer` an PDF.js geben und danach den Druckdialog öffnen.
- Es sind voraussichtlich nur diese Dateien nötig:
  - `src/components/pdf/PrintButton.tsx`
  - `src/components/pdf/PdfViewerDialog.tsx`
  - `src/routes/protokolle.$id.tsx`

## Prüfung

- Code auf TypeScript-Kompatibilität prüfen.
- Kontrollieren, dass Protokoll-Entwürfe, abgeschlossene Protokolle und bestehende Angebots-/Rechnungs-PDFs weiterhin eine Druckaktion haben.
- Keine Änderung an PDF-Erzeugung, Daten oder Backend.