
# PDF-Layout 1:1 nach Vorlage (Rechnung & Angebot)

Anhand des neuen Referenz-Screenshots werden Tabelle, Meta-Box, Logo und Outro exakt an die My-Clean-Center-Vorlage angepasst. Identisch in Frontend (`src/lib/pdf/belegPdf.ts`) und Backend (`backend/src/pdf/layout.ts`).

## 1. Tabelle: vollständiger Rahmen + 4 Spalten

Aktuell: nur dünne horizontale Linien, 3 Spalten. Vorlage zeigt aber **komplett umrandete Zellen** (alle 4 Seiten) und **4 Spalten**:

```text
| Leistung               | Stunden | Abrechnungsart | Preis ohne MwSt. |
| Büro Unterhalts- + ... |         | Pauschal       |        350,00 € |
| Zzgl. gesetzl. MwSt 19%|                                    66,50 € |
| Gesamtbetrag inkl. MwSt|                                   416,50 € |  (bold)
```

Anpassungen in `leistungstabelle()`:
- Spalten + Breiten: `[ "*", 70, 90, 90 ]` mit Headern `Leistung | Stunden | Abrechnungsart | Preis ohne MwSt.`.
- `Stunden`-Zelle: bei `modus === "klassisch"` → `{menge} {einheit}` (z. B. `12,00 Std`), bei Pauschal leer.
- `Abrechnungsart`-Zelle: bei Pauschal `Pauschal`, bei klassisch `à {einzelpreis}` (mittig).
- `Leistung`-Zelle: weiterhin `beschreibungBlock` (Titel fett + Bullet-Liste).
- Layout-Funktion: **alle Linien aktiv** — `hLineWidth: 0.6`, `vLineWidth: 0.6`, Farbe `#000000` (schwarz, nicht grau). Header-Zeile + Summenzeile etwas dicker (0.8).
- Die Summenzeilen (`Zwischensumme`, `MwSt`, `Gesamtbetrag`) nutzen `colSpan: 3` über die ersten drei Spalten, Wert rechts.
- `dontBreakRows: true`, `keepWithHeaderRows: 1` bleiben für Mehrseiten-Schutz.

## 2. Meta-Box (Rechnung): Hinweis OBEN IN der Box

Vorlage zeigt:

```text
┌──────────────────────────────────────┐
│ Bei Zahlung bitte                    │
│ die Rechnungs-Nr. angeben            │
├──────────────────┬───────────────────┤
│ Rechnung-Nr.:    │ Fabiola0326/0026  │
│ Rechnungsdatum:  │     28.03.2026    │
└──────────────────┴───────────────────┘
```

Anpassungen in `metaBox(..., variant: "box")`:
- Neuer Param `headerNote` (statt `note` als Footer): kleiner kursiver/normaler Hinweistext **oberhalb** der Daten-Reihen, mit unterer Trennlinie.
- Volle Außen-Umrandung (oben, unten, links, rechts) in **schwarz** statt grau, Linienbreite 0.7.
- Innere Trennlinie nur zwischen Hinweisblock und Daten.
- Default-Hinweis bei Rechnung: `"Bei Zahlung bitte\ndie Rechnungs-Nr. angeben"`.
- Felder reduzieren auf das, was in der Vorlage steht: `Rechnung-Nr.` + `Rechnungsdatum` (Fälligkeit ist nicht in der Box, sondern wird im Outro-Text erwähnt). Optional Konfiguration über `BuildOptions`, aber Default = nur diese zwei Zeilen.

## 3. Outro-Satz mit Betrag und Frist

Statt Box-Note jetzt im Fließtext nach der Tabelle, exakt wie in Vorlage:

> „Wir möchten Sie bitten, den Rechnungsbetrag in Höhe von **{Brutto}** innerhalb von **{N} Tagen** nach Rechnungszustellung auf unser unten genanntes Bankkonto zu überweisen."

- N berechnet aus Differenz `faelligkeitsdatum - rechnungsdatum` in Tagen, Fallback `14`.
- Direkt nach der Tabelle, **vor** „Mit freundlichen Grüßen".
- `defaultOutroRechnung` entsprechend umbauen.

## 4. Logo deutlich größer

Header `header(firma, logo)`:
- Logo-Spalte von `width: 150` / `fit: [150, 70]` auf `width: 220` / `fit: [220, 95]`.
- Absender-Top-Margin entsprechend nachziehen, damit Logo + Absender-Zeile vertikal harmonieren.
- `pageMargins.top` von `110` auf `125` erhöhen, damit das größere Logo nicht in den Inhalt überlappt.

## 5. Konsistenz zwischen Frontend & Backend

Identische Änderungen werden in `backend/src/pdf/layout.ts` gespiegelt — gleiche Spalten, gleiches Layout, gleiche Meta-Box, gleiches Outro. Keine Backend-API-Änderung, kein Migrationsbedarf.

## Betroffene Dateien

- `src/lib/pdf/belegPdf.ts` — `header`, `metaBox` (headerNote), `leistungstabelle` (4 Spalten + Vollrahmen), `defaultOutroRechnung`, `generateRechnungPdf` (kein note-Param mehr, dynamische Tage)
- `backend/src/pdf/layout.ts` — gleiche Änderungen
- Keine Änderungen an Datenmodell, Routen, Settings, Cache.

## Verifikation

1. Rechnung mit einer Pauschal-Position → Layout matcht Screenshot pixelnah (Box mit „Bei Zahlung bitte…", 4-spaltige Tabelle mit allen Linien, Logo groß rechts, Outro-Satz mit Betrag + 14 Tagen).
2. Rechnung mit klassischer Position → Stunden-Spalte zeigt Menge+Einheit, Abrechnungsart zeigt `à {Einzelpreis}`.
3. Rechnung mit 30+ Positionen → Tabelle bricht sauber, Header wiederholt sich, Footer überlappt nicht.
4. Angebot bleibt unverändert (plain Meta, gleiche neue 4-spaltige Tabelle).
