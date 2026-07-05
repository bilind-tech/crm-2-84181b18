## Ziel

Zwei kleine, gezielte Layout-Anpassungen an den PDFs für Angebote und Rechnungen — sonst nichts. Kein Anfassen von Build-Skripten, `package.json`, `bun.lock`, `update.sh` oder `ensure-lightningcss-native.mjs`, damit `mcc-update` weiterhin sauber durchläuft wie beim letzten Mal.

## Änderung 1 — Empfänger etwas weiter nach oben

Aktuell startet der Empfänger-Block (Firmenname, Ansprechpartner, Objekt, Adresse) bei `pageMargins.top = 155`. Wir reduzieren den oberen Seitenrand auf `130`, sodass der komplette Adressblock ~25 pt (≈9 mm) nach oben rutscht. Der Header (Absender-Zeile + Logo) bleibt an seiner festen Position (`margin: [55, 30, 55, 0]`), es entsteht also nur mehr Luft zwischen Header und Kunde, nicht weniger — der Adressblock rückt näher an die typische Sichtfensterhöhe.

Dateien:
- `src/lib/pdf/belegPdf.ts` — Zeile 676: `pageMargins: [55, 130, 55, 100]`
- `backend/src/pdf/layout.ts` — Zeile 460: dieselbe Änderung, damit Pi-PDF (und der Drive-Upload) identisch aussehen

## Änderung 2 — Tabellen-Header vertikal mittig

Die Kopfzellen „Leistung / Stunden / Abrechnungsart / Preis (netto)" sitzen aktuell mit `margin: [0, 4, 0, 4]` bei `paddingTop/Bottom: 8` in ihrer Zelle. Weil pdfmake keinen echten `vAlign` kennt, sieht die Kopfzeile bei nur einer Textzeile trotzdem oben angeklebt aus, sobald die Daten­zeilen darunter mehrzeilig werden.

Fix:
- Feste Kopfzeilenhöhe setzen: `table.heights = (row) => (row === 0 ? 22 : undefined)`
- Kopfzellen-Margin symmetrisch anheben auf `margin: [0, 6, 0, 6]`, sodass der Text bei fixer 22-pt-Höhe und `paddingTop = paddingBottom = 8` exakt in der Mitte sitzt (oben 8 + 6 = 14, unten 8 + 6 = 14).

Betrifft nur die Kopfzeile (`positionsTabelle`), nicht die Summenzeilen.

Dateien:
- `src/lib/pdf/belegPdf.ts` — `leistungstabelle()`, Header-Margins + `heights` in `positionsTabelle.table`
- `backend/src/pdf/layout.ts` — dieselbe Änderung an der Server-Kopie

## Was NICHT angefasst wird

- Keine neuen Pakete, keine Lockfile-Änderungen
- Keine Änderung an `backend/deploy/update.sh` oder `scripts/ensure-lightningcss-native.mjs`
- Keine Änderung am Editor, an Hotspots, an der Positionsdarstellung oder an Fußzeile/Logo
- Keine anderen Ränder, Schriftgrößen oder Farben

## Prüfen nach Umsetzung

1. `tsgo` läuft grün (TypeScript unverändert kompatibel).
2. Beleg-PDF-Tests (`backend/test/pdf.spec.ts`) laufen grün — sie prüfen Bytes/Cache, nicht Pixel, sollten also unauffällig durchlaufen.
3. Manuell: Angebot + Rechnung öffnen, PDF-Vorschau prüfen — Adresse sitzt höher, Kopfzeile zentriert.
4. `mcc-update` auf dem Pi: keine neuen Cache-/Native-Binding-Probleme zu erwarten, da nur zwei TS-Dateien geändert werden.
