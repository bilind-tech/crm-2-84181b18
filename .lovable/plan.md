Ich sehe jetzt ziemlich klar, warum es bei dir weiter hakt: Die PDF-Erzeugung selbst scheint grundsätzlich zu funktionieren, aber die Anzeige ist aktuell zu abhängig von Browser-/PDF-Plugin-Verhalten (`object`/`iframe`) und im Editor zusätzlich von `react-pdf`/PDF.js. Das ist in der Lovable-Preview besonders fragil. Das ist nicht „nur Raspberry“ — die Vorschau muss auch in der Preview funktionieren. Der Raspberry/Pi-Backend-Status ist hier nicht die Hauptursache.

Plan zur robusten Lösung:

1. Zentrale PDF-Render-Komponente bauen
   - Eine eigene Komponente für PDF-Anzeige erstellen, die PDFs nicht mehr über das native Browser-PDF-Plugin rendert.
   - Stattdessen wird die PDF-Seite kontrolliert mit `react-pdf`/PDF.js als Canvas gerendert.
   - Diese Komponente bekommt klare Zustände: lädt, sichtbar, Fehler, Download-Fallback.

2. PDF.js-Worker wirklich stabil konfigurieren
   - Die Worker-URL nicht mehr halb über lokale `node_modules`/halb über CDN behandeln.
   - Entweder konsequent auf die exakt passende Worker-Version gehen oder den gebündelten Worker sauber importieren.
   - Ziel: keine Versionsmismatches mehr und kein blanker Viewer.

3. `PdfViewerDialog` ersetzen
   - Der Dialog hinter dem Auge-Icon nutzt die neue robuste Canvas-Anzeige.
   - Der Dialog zeigt mindestens Seite 1 zuverlässig an, mit Scroll für weitere Seiten.
   - Buttons bleiben: `PDF bearbeiten`, `Öffnen/Download` als Fallback.
   - Wenn Rendern fehlschlägt, steht dort nicht nur „blank“, sondern eine konkrete Meldung plus Download.

4. `PdfPreviewCard` auf Detailseiten ersetzen
   - Die Detailseite nutzt dieselbe robuste Komponente für eine echte Inline-Vorschau.
   - Keine native `<object>/<iframe>`-Einbettung mehr, weil die in der Preview offenbar leer bleiben kann.
   - Höhe/Containerbreite wird sauber gemessen, damit `react-pdf` nicht mit Breite 0 rendert.

5. Blob-URL-Handling in `useBelegPdf` absichern
   - Beim neuen Build erst alte URL ersetzen, wenn die neue URL wirklich existiert.
   - Beim Wechsel von Rechnung/Angebot alte URLs sauber freigeben.
   - Optional Debug-Infos in Dev-Mode: Blob-Größe, Typ, Quelle Browser/Pi.

6. Live-Editor nicht kaputt machen
   - Der Live-Editor funktioniert laut dir immerhin grundsätzlich; ich ändere ihn nur so weit, wie es für dieselbe stabile Worker-Konfiguration nötig ist.
   - Die Hotspot-/Click-to-Edit-Logik bleibt erhalten.

7. Danach testen
   - Rechnung-Detailseite: Inline-Vorschau muss sichtbar sein.
   - Auge-Icon: Dialog muss die PDF sichtbar rendern.
   - PDF bearbeiten: Live-Editor darf nicht regressieren.
   - Pi offline in Preview ist okay: Browser-Fallback muss trotzdem funktionieren.

Technischer Kern:
- Weg von `<object data={blobUrl}>` und `<iframe src={blobUrl}>` für interne App-Vorschau.
- Einheitlich `Document`/`Page` aus `react-pdf` verwenden, aber mit sauberem Worker und ResizeObserver.
- Wiederverwendbare Komponente etwa `PdfCanvasViewer`, genutzt von `PdfViewerDialog`, `PdfPreviewCard` und optional später vom Editor.

Wenn du das freigibst, setze ich genau das jetzt um.