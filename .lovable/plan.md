## Ursachen-Analyse

Der Fehler `Unexpected server response (0) while retrieving PDF "blob:..."` kommt von PDF.js, wenn der Worker eine `blob:`-URL nicht fetchen kann. Tritt jedes Mal auf, wenn dem Viewer nur eine Blob-URL statt eines echten Blob/ArrayBuffer übergeben wird.

Im aktuellen Stand passiert das noch in **einem Fall**:
- **Abgeschlossene Protokolle** in `src/routes/protokolle.$id.tsx`: dort wird `pdf.blob = null` hart gesetzt und nur die `archived.url` (eine `blob:`-URL aus `useDokumentBlobUrl`) an `PdfPreviewCard` weitergereicht. Entwürfe und der Editor liefern bereits einen echten Blob — dort tritt der Fehler nicht auf.

Das passt zum „manchmal“-Charakter: tritt vor allem auf, wenn der Nutzer ein bereits abgeschlossenes Protokoll öffnet (z. B. aus „zuletzt bearbeitet“ in Schlüsselübergabe/Übergabeprotokoll).

## Plan

1. **Blob statt nur URL für archivierte Dokumente**
   - `useDokumentBlobUrl` so erweitern, dass zusätzlich der geladene `Blob` mit zurückgegeben wird (ohne Breaking-Change für andere Aufrufer).
   - Alternativ neuer Hook `useDokumentBlob` mit gleicher Logik plus Blob im Return.

2. **Detail-Seite Protokoll fixen**
   - In `src/routes/protokolle.$id.tsx` für abgeschlossene Protokolle den geladenen Blob in `pdf.blob` durchreichen, damit `PdfCanvasViewer` den stabilen ArrayBuffer-Pfad nutzt — analog zu Angebot/Rechnung.

3. **Debug-Instrumentierung in PdfCanvasViewer**
   - Im `onLoadError` zusätzlich strukturiert loggen: aktueller Quell-Modus (`buffer` vs. `url`), `byteLength` des Buffers, `pdfUrl`, `attempt`, vollständige Fehlermeldung.
   - In der Fehler-UI eine kleine, unauffällige technische Zeile ergänzen (z. B. „Quelle: blob-URL · 0 KB · Versuch 2 von 2“) — nur sichtbar, wenn ein Fehler da ist. Damit wir bei künftigen Fällen sofort sehen, ob Buffer- oder URL-Pfad scheitert.
   - In `ProtokollLivePreview` ebenfalls: bei `viewerError` `mode/byteLength` mit ausgeben.

4. **Verifikation**
   - Konsole prüfen, dass abgeschlossene Protokolle ohne Fehler in der Vorschau laden.
   - Sicherstellen, dass Entwürfe und der Editor weiterhin funktionieren (kein Regressionsschaden).
   - Build und TS-Check müssen sauber durchlaufen.

## Technische Details

- `useDokumentBlobUrl` liest die Datei bereits per `fetch(...).then(r => r.blob())` und macht `URL.createObjectURL`. Wir können den Blob einfach zusätzlich im State halten und mit zurückgeben.
- Cleanup der Object-URL bleibt unverändert (Caller-Vertrag: Hook revoked beim Unmount).
- `PdfPreviewCard` akzeptiert bereits `pdfBlob` als optionale Quelle — nur die Detail-Seite reicht ihn aktuell für den archivierten Fall nicht durch.

## Dateien

- `src/hooks/useDokumentBlobUrl.ts` — Blob mit zurückgeben.
- `src/routes/protokolle.$id.tsx` — Blob durchreichen für abgeschlossene Protokolle.
- `src/components/pdf/PdfCanvasViewer.tsx` — Debug-Log + dezente Fehler-Diagnosezeile.
- `src/components/protokoll-editor/ProtokollLivePreview.tsx` — Debug-Log + Diagnosezeile.

Keine Änderungen am Backend, an der PDF-Erzeugung oder an Angebot/Rechnung.