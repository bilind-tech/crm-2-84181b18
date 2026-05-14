## Befund

Das Problem ist kein einzelner PDF-Fehler mehr, sondern zwei gekoppelte Ursachen:

1. **Aktueller harter Crash in der Preview:** In `src/routes/rechnungen.$id.tsx` gibt es durch einen vorherigen Fix eine doppelte Variable `r` (`const { data: r ... }` und später `const r = safeRechnung`). TanStack/Vite meldet deshalb `BABEL_PARSER_SYNTAX_ERROR: VarRedeclaration`. Genau das erzeugt die generische Seite „Something went wrong“.
2. **PDF-Änderungen haben die Seiten anfälliger gemacht:** Die Detailseiten, PDF-Erzeugung und Vorschau greifen an mehreren Stellen direkt auf Felder wie `positionen`, `zahlungen`, `rabatt`, `menge`, `beschreibung`, `kunde`, `firma` zu. Wenn ein neu erstellter Beleg aus der lokalen Preview-Fallback-Logik oder vom Pi unvollständige Daten bekommt, darf die ganze Detailseite nicht abstürzen — die PDF-Vorschau muss stattdessen kontrolliert „wird erstellt“, „nicht möglich“ oder den genauen Fehler zeigen.

## Plan

1. **Sofort-Crash beseitigen**
   - In `src/routes/rechnungen.$id.tsx` die doppelte Variable sauber auflösen.
   - Dasselbe Muster in `src/routes/angebote.$id.tsx` prüfen und vereinheitlichen, damit TanStack Router keine Code-Splitting-/Syntaxfehler mehr erzeugt.

2. **Detailseiten gegen kaputte/fehlende Belegdaten absichern**
   - Eine kleine Normalisierung für Rechnung/Angebot einbauen: `positionen`, `zahlungen`, `rabattGesamt`, `steuersatz`, Titel/Nummer/Datum bekommen sichere Defaults.
   - In den Positionslisten keine direkten unsicheren Zugriffe mehr wie `p.beschreibung.split(...)`, `p.menge * p.einzelpreisNetto`, `z.betrag` ohne Fallback.
   - `rechnungFlow`, `angebotFlow`, Zahlungssumme und Betragssumme nur noch mit normalisierten Daten aufrufen.

3. **PDF-Generator robust machen**
   - `src/lib/pdf/belegPdf.ts` absichern:
     - `summe()` und `totals()` mit `?? 0` statt direkter Multiplikation.
     - `positionen ?? []`, `rabattGesamt ?? 0`, `steuersatz ?? 19` verwenden.
     - Beschreibung, Menge, Einzelpreis, Rabatt, Pauschalpreis defensiv behandeln.
   - Ergebnis: PDF-Erzeugung darf bei unvollständigen Belegen nicht mehr die Route crashen.

4. **PDF-Hook darf nie die Seite blockieren**
   - `src/hooks/useBelegPdf.ts` so anpassen, dass PDF-Fehler im PDF-Block landen, aber nicht die Detailseite in den Router-Error werfen.
   - Wenn Kunde/Firma fehlen, klare PDF-Fehlermeldung liefern statt endlos „PDF wird erstellt …“.
   - Backend-PDF bleibt optional: wenn Pi/offline/HTTP-Fehler, Browser-PDF als Fallback; wenn auch das scheitert, sichtbarer Fehler im PDF-Kasten.

5. **Lokale Preview-Daten vervollständigen**
   - `src/lib/api/localPreviewData.ts` weiter normalisieren, damit neu erstellte Angebote/Rechnungen immer gültige Positionen, Zahlungsarrays, Optionen, Status, Steuersatz und Nummer haben.
   - Mutationen für die wichtigsten Detailseiten-Aktionen prüfen: mindestens Erstellen, Anzeigen, PDF-Vorschau; wenn nötig einfache lokale PATCH-Antworten ergänzen, damit Statusänderungen nicht wieder ins Backend-Offline laufen.

6. **Bessere Fehleranzeige einbauen**
   - `src/router.tsx` ersetzt die generische Anzeige durch eine deutschsprachige Diagnose:
     - Titel: „Diese Seite konnte nicht geladen werden“
     - sichtbare Fehlermeldung immer anzeigen, nicht nur in DEV
     - technische Details einklappbar/kopierbar: Route, Fehlername, Message, Stack-Ausschnitt
     - Buttons: „Erneut versuchen“, „Zur Startseite“
   - Damit kannst du mir beim nächsten Mal direkt die echte Fehlermeldung schicken.

7. **Validierung**
   - Die Preview-Server-Logs erneut prüfen: kein `VarRedeclaration`, kein Router-Compile-Fehler.
   - Browser-Test durchführen:
     - `/rechnungen/preview-rechnung-1` öffnet ohne „Something went wrong“.
     - `/angebote/preview-angebot-1` öffnet ohne „Something went wrong“.
     - PDF-Vorschau wird sichtbar oder zeigt eine konkrete Fehlermeldung im PDF-Kasten, nicht als Seitencrash.
   - Zusätzlich einen neu erstellten Beleg aus der lokalen Preview öffnen und prüfen.

## Technische Notiz

Ich werde **keinen großen Architektur-Umbau** wie Queue/Background-Jobs für die lokale Lovable-Preview bauen. Für den späteren Pi kann PDF-Caching/Backend-PDF weiter genutzt werden, aber der akute Fehler entsteht durch Syntax-/Datenrobustheit im Frontend und durch unvollständige Preview-Fallback-Daten.