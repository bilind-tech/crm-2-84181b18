
# PDF-Verbesserungen: Logo, Rechnungs-Meta-Box, Tabellen-Layout

Drei klar abgegrenzte Fixes an der PDF-Erzeugung (Frontend-Preview + Backend-Generator), damit das Ergebnis 1:1 zur mitgeschickten Vorlage passt.

## 1. Logo aus den Firmendaten übernehmen

**Problem:** Aktuell lädt der Frontend-PDF-Builder das Logo aus `@/assets/logo.png` (`belegPdf.ts` → `logoDataUrl()`). Das in den Einstellungen hochgeladene Logo (`firma.logoUrl`, als Data-URL in den Settings gespeichert) wird ignoriert. Im Backend liest `loadLogoDataUrl()` nur eine Datei `${dataDir}/branding/logo.png` — die Settings-Variante wird auch dort nicht beachtet, und es gibt keinen Upload-Endpoint, der die Datei dort ablegt.

**Lösung:**
- **Frontend (`src/lib/pdf/belegPdf.ts`)**: `header(...)` bekommt zusätzlich die `firma` rein, das Logo wird in dieser Reihenfolge gewählt:
  1. `optionen.logoOverride` (bestehender Per-Beleg-Override)
  2. `firma.logoUrl` (Einstellungen → Firmendaten → Logo hochladen)
  3. Fallback `@/assets/logo.png`
  4. Wenn nichts vorhanden → Textmarke mit Firmenname.
- **Backend (`backend/src/pdf/firma.ts`)**: `loadLogoDataUrl()` zusätzlich `getSetting("firma").logoUrl` als Data-URL prüfen, bevor auf die Datei `${dataDir}/branding/logo.png` zurückgegriffen wird. So funktioniert das Logo sofort, ohne neuen Upload-Endpoint, weil der Frontend-Settings-PATCH das `logoUrl`-Feld bereits persistiert.
- Andere Firmendaten (Name oben links, Footer-Spalten) werden bereits aus `firma` gelesen — wir verifizieren nur, dass die Settings → Firma per `useFirmendaten()` geladen sind und im Doc landen (ist bereits der Fall, kein zusätzlicher Code nötig).

## 2. Rechnungs-Meta-Box wie in der Vorlage (oben rechts mit Hinweistext)

**Problem:** Heute ist die Rechnungs-Meta-Box ein einfaches Tabellenrahmen mit „Rechnung-Nr / Datum / Fällig am". In der Vorlage steht oben rechts ein größerer Kasten mit:
- Rechnungsnummer
- Rechnungsdatum
- Leistungsdatum/-zeitraum
- Zahlungsziel / Fälligkeitsdatum
- Hinweis-Zeile darunter: „Bitte überweisen Sie den Betrag bis zum {Fälligkeitsdatum} unter Angabe der Rechnungsnummer {Nummer} auf das unten genannte Konto."

**Lösung:**
- `metaBox(..., variant: "box")` in `src/lib/pdf/belegPdf.ts` und `backend/src/pdf/layout.ts` so erweitern, dass:
  - Die Box optional einen Footer-Bereich („note") akzeptiert, der unterhalb der Werte über die volle Box-Breite läuft, gleicher Rahmen, Schrift 9pt.
  - Bei Rechnung wird dieser Note-Text gesetzt:  
    `„Bitte überweisen Sie den Rechnungsbetrag bis zum {faellig} unter Angabe der Rechnungsnummer {nummer} auf unser unten angegebenes Konto."`
  - Der bestehende `outro` (im Brief darunter) bleibt unverändert, ist aber nicht mehr redundant nötig — Default-Outro nur noch „Vielen Dank für Ihren Auftrag." statt der Überweisungs-Aufforderung, damit es nicht doppelt steht.
- Beim Angebot bleibt die `plain`-Variante (kein Kasten, rechts ausgerichteter Stack) — nur ohne Note.
- Meta-Felder für Rechnung neu zusammenstellen in `generateRechnungPdf` und `rechnungDocDef`:
  - „Rechnung-Nr." / Nummer
  - „Rechnungsdatum" / Datum
  - „Leistungsdatum" / aus Position-Zeitraum oder Rechnungsdatum, falls leer
  - „Fällig am" / `faelligkeitsdatum`

## 3. Tabelle 1:1 nach Vorlage (keine Menge/Einheit/Einzelpreis-Spalten mehr)

**Problem:** Aktuell zeigt der „klassisch"-Pfad sechs Spalten (`Pos. | Beschreibung | Menge | Einheit | Einzelpreis | Summe`). Die Vorlage nutzt nur **drei Spalten** mit Pauschal-Stil — auch wenn klassisch (Menge/Einzelpreis) erfasst wurde. Menge/Einheit gehört in die Beschreibung.

**Lösung:**
- `klassischTabelle()` und `pauschalTabelle()` werden zu **einer** einheitlichen Funktion `leistungstabelle()` zusammengefasst. Spalten exakt wie Vorlage:

  ```text
  | Ausführung            | Leistung                          | Preis ohne MwSt. |
  |-----------------------|-----------------------------------|-----------------:|
  | Pauschal              | Titel + Bullet-Liste              |          XX,XX € |
  | 12,00 Std (à 35,00 €) | Beschreibung + Bullets            |         420,00 € |
  | ...                   | ...                               |              ... |
  | Zwischensumme (netto) |                                   |        1.234,56 € |
  | Zzgl. MwSt 19 %       |                                   |          234,57 € |
  | Gesamtbetrag inkl. MwSt|                                  |        1.469,13 € |  (bold)
  ```

- `Ausführung`-Spalte enthält:
  - Modus „pauschal" → Text „Pauschal" (oder `p.ausfuehrung` falls gesetzt).
  - Modus „klassisch" → `{menge} {einheit} (à {einzelpreis})`, z. B. `12,00 Std (à 35,00 €)`. So bleibt die Information erhalten, aber ohne die hässlichen Extra-Spalten.
- `Leistung`-Spalte: weiter `beschreibungBlock(p.beschreibung)` mit fettem Titel + Bullet-Liste.
- Spaltenbreiten `[110, "*", 90]`, dünne graue horizontale Linien (`#bdbdbd`), keine vertikalen Linien innerhalb der Datenzeilen — 1:1 zur Vorlage. Header-Zeile und letzte Summenzeile etwas dicker (0.7pt), dazwischen 0.4pt.
- `dontBreakRows: true` und `keepWithHeaderRows: 1` bleiben für den Mehrseiten-Schutz.
- Identische Implementierung in **`src/lib/pdf/belegPdf.ts`** *und* **`backend/src/pdf/layout.ts`** (beide Pfade müssen synchron bleiben).

## 4. Konsistenz-Check / kleinere Aufräum-Arbeiten

- `defaultOutroRechnung` kürzen, da der Überweisungstext jetzt in der Meta-Box steht.
- Sicherstellen, dass `useFirmendaten()` (bereits vorhanden) den vollständigen Datensatz inkl. `logoUrl`, Geschäftsführer, Bank, Handelsregister liefert — ist via Mock-Backend `/einstellungen/firma` gegeben.
- Header-Spalten-Höhe leicht erhöhen, falls das Logo aus den Settings größere Proportionen hat (`fit: [150, 70]` bleibt — Bild wird proportional eingepasst).

## Technische Details / betroffene Dateien

- `src/lib/pdf/belegPdf.ts`
  - `header(firma, logo)` Signatur erweitern, Logo-Resolution-Kette ergänzen
  - `metaBox(..., note?: string)` Option für untere Hinweiszeile
  - `klassischTabelle` + `pauschalTabelle` → `leistungstabelle` (3 Spalten)
  - `defaultOutroRechnung` kürzen
  - `generateRechnungPdf`: Meta-Box-Note + Leistungsdatum
- `backend/src/pdf/layout.ts` — gleiche Änderungen spiegeln
- `backend/src/pdf/firma.ts` — `loadLogoDataUrl()` zuerst aus `getSetting("firma").logoUrl`
- Keine neuen Migrations / keine Daten-Änderungen nötig (Logo-Feld existiert bereits in Settings).

## Verifikation

Nach Umsetzung:
1. Logo in Einstellungen → Firmendaten hochladen → in Rechnungs-/Angebots-PDF (Vorschau & Download) erscheint es oben rechts.
2. Rechnung öffnen → Meta-Box oben rechts zeigt Nummer, Datum, Leistungsdatum, Fälligkeit + Hinweis-Satz.
3. Tabelle zeigt nur 3 Spalten, auch bei klassischen Positionen — Menge/Einheit/Einzelpreis stehen in der ersten Spalte als kompakte Zeile.
4. Mehrseitiger Test mit 30+ Positionen: Header-Zeile wiederholt sich nicht doppelt, keine zerschnittenen Zeilen, Footer überlappt nicht.
