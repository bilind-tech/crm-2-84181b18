## Plan

1. **E-Mail-versenden Button optisch aufwerten**
   - Einen wiederverwendbaren Premium-Button für „Per E-Mail versenden“ bauen, optisch passend zum blauen „Neue Rechnung/Neues Angebot“-Button.
   - Dezent edel: blauer Verlauf, feiner Innen-Glanz, hochwertiger Schatten, ruhiger Hover-Effekt, kein übertriebener Glow.
   - Einsetzen bei Angeboten, Rechnungen, Listen-Aktionen und überall dort, wo der Versand-Button als Hauptaktion sichtbar ist.

2. **Übergabe-/Abnahmeprotokoll und Schlüsselübergabe einbeziehen**
   - Die relevanten Erstellen-/Abschließen-/PDF-Aktionsbuttons auf den Protokoll-Seiten optisch konsistent an den Premium-Primary-Stil anpassen, ohne die bestehende Bedienung zu verändern.
   - Icons und Abstände sauber angleichen, damit Angebot, Rechnung und Protokolle wie aus einem Guss wirken.

3. **Google-Drive-Sync fachlich korrigieren**
   - Backend prüfen und ändern: Drive-Upload für Angebote/Rechnungen soll erst nach erfolgreichem manuellem E-Mail-Versand angestoßen werden.
   - Aktuell hängt der Drive-Auto-Upload an allgemeinen Beleg-Mutationen/statusbasierten Änderungen; das wird auf das vorhandene „Beleg versendet“-Event umgestellt.
   - Keine automatische E-Mail-Logik anfassen oder hinzufügen. Versand bleibt ausschließlich User-Klick.

4. **Dauerhaften Sync-Spinner in der PDF-Vorschau entfernen**
   - Den unteren PDF-Vorschau-Badge so ändern, dass „Wird synchronisiert …“ nur erscheint, wenn wirklich ein Drive-Upload läuft.
   - Wenn noch kein Drive-Upload geplant/gestartet ist, wird stattdessen ruhig „Lokal“ oder kein störender Status angezeigt.
   - Der separate kleine Drive-Status oben bleibt sinnvoll, aber ohne dauerhaft drehenden Spinner, wenn nichts synchronisiert wird.

5. **Drucken zuverlässig reparieren**
   - Den aktuellen iframe-Druck ersetzen, weil dieser bei PDFs offenbar leere Seiten erzeugt.
   - Neue robuste Druckstrategie: PDF per PDF.js in echte Seitenbilder rendern, in ein druckoptimiertes Fenster/Layout setzen und erst drucken, wenn alle Seiten fertig geladen sind.
   - Anwenden bei Angebot, Rechnung und Protokollen, inklusive Übergabe-/Abnahmeprotokoll und Schlüsselübergabe.
   - Fallback: Wenn Rendering fehlschlägt, wird die PDF sauber in einem neuen Tab geöffnet statt ein leeres Druckblatt auszugeben.

6. **Jahresfilter standardmäßig auf aktuelles Jahr setzen**
   - Bei Angebote und Rechnungen den Zeitraum-Filter initial auf das aktuelle Jahr setzen, Monat weiter auf „Alle Monate“.
   - „Alle Jahre“ bleibt weiterhin manuell auswählbar und der Reset funktioniert weiterhin.

7. **Validierung nach Umsetzung**
   - Relevante Stellen gezielt prüfen: Angebot-Detail, Rechnung-Detail, Protokoll-Detail, Listen mit E-Mail-Aktion, PDF-Vorschau/Drive-Status und Jahresfilter.
   - Druckfunktion technisch so absichern, dass nicht mehr das leere Browser-Druckblatt entsteht.