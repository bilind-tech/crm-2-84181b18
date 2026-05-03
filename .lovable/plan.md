Ich werde das jetzt nicht weiter über die fehleranfällige PDF.js/react-pdf-Anzeige für den normalen „PDF ansehen“-Dialog lösen, sondern den Rechnungs-PDF-Viewer robuster umbauen.

Wichtig: Das muss auch in der Lovable-Preview funktionieren. Es ist nicht erst auf dem Raspberry Pi möglich. Der Pi ist später für echte Datenbank/Backend-PDFs wichtig, aber die aktuelle PDF-Erzeugung läuft bereits im Browser und kann in der Preview angezeigt werden.

Plan:

1. Hauptproblem beheben: „PDF ansehen“ muss immer sichtbar rendern
- `PdfViewerDialog` wird für den normalen Anzeigen-Dialog auf eine native Browser-PDF-Anzeige per `iframe`/`object` umgestellt.
- Dadurch umgehen wir die bisherige Fehlerquelle mit PDF.js-Worker, Versionen und leerem Canvas.
- Der Dialog zeigt nicht mehr einfach eine leere Fläche, wenn intern etwas nicht lädt.
- Es gibt weiterhin Download und „PDF bearbeiten“ im Dialogkopf.
- Wenn der Browser die eingebettete PDF-Anzeige blockiert oder nicht lädt, bleibt eine klare Fallback-Fläche sichtbar mit:
  - „PDF in neuem Tab öffnen“
  - „PDF herunterladen“

2. Detailseite verbessern: PDF-Karte soll echte Vorschau zeigen
- `PdfPreviewCard` soll nicht nur „PDF bereit“ anzeigen.
- Sobald `pdf.url` vorhanden ist, wird in der Karte eine kleine echte Vorschau der PDF eingebettet.
- Der Button „PDF ansehen“ öffnet weiterhin den großen Dialog.
- Wenn die Vorschau nicht geladen werden kann, sieht man eine klare Meldung statt einer leeren Fläche.

3. Übersicht/Auge-Icon absichern
- Der bestehende `PdfViewButton` in der Rechnungsübersicht bleibt der Einstieg.
- Da er denselben `PdfViewerDialog` nutzt, funktioniert das Auge-Icon danach ebenfalls mit der robusten nativen Anzeige.
- Klicks bleiben sauber vom Tabellenzeilen-Klick getrennt.

4. Live-Editor nicht kaputt machen
- Der Live-Editor kann vorerst weiter `react-pdf` nutzen, weil dort Seiten-Hotspots/Overlays gebraucht werden.
- Ich werde aber den Fehlerzustand dort verbessern: Wenn PDF.js wieder zickt, soll es nicht nur rot/leer wirken, sondern immer mindestens „Öffnen/Download“ anbieten.
- Der Fokus bleibt jetzt: normale Rechnungsanzeige und PDF ansehen müssen zuverlässig funktionieren.

5. PDF-Erzeugung selbst absichern
- `useBelegPdf` bleibt mit Browser-Generator-Fallback bestehen.
- Ich werde prüfen, dass alte Blob-URLs sauber aufgeräumt werden und beim erneuten Öffnen nicht eine kaputte/alte URL hängen bleibt.
- Status „ready“ wird nur genutzt, wenn wirklich eine Blob-URL vorhanden ist.

6. Danach prüfen
- Rechnung-Detailseite: PDF-Karte zeigt Vorschau statt nur „PDF bereit“.
- Klick auf „PDF ansehen“: großer Dialog zeigt die PDF sichtbar.
- Klick auf Auge-Icon in der Rechnungsübersicht: Dialog zeigt dieselbe PDF sichtbar.
- Download-Link bleibt funktional.

Ergebnis: Erst Funktionalität stabil. Das Design der PDF selbst fasse ich jetzt nur minimal an bzw. nicht als Hauptthema an; das können wir danach gezielt schöner machen.