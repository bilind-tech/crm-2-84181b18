# PDF-Redesign: My-Clean-Center-Look

## Ziel

Das aktuelle blaue, „moderne" Layout durch das Original-Design der Beispiel-PDFs ersetzen — schlicht, schwarz auf weiß, dünne Linien, klarer Briefkopf mit Logo rechts, kompakter 4-spaltiger Footer. Beleg-Engine (Frontend `src/lib/pdf/belegPdf.ts` + Backend `backend/src/pdf/layout.ts`) wird parallel umgebaut, damit Vorschau, Hotspot-Editor und Server-PDF identisch aussehen.

## Design-Spezifikation (aus den Beispielen abgeleitet)

```
┌──────────────────────────────────────────────────────────┐
│ Absenderzeile (klein, unterstrichen)        [LOGO 140pt] │   ← Header
│                                                          │
│ Kundenadresse                       ┌──────────────────┐ │
│ Firma XY                            │ Bei Zahlung bitte│ │   (nur Rechnung)
│ Straße                              │ die Rechnungs-Nr.│ │
│ PLZ Ort                             │ Rechn.-Nr: …     │ │
│                                     │ Datum:      …    │ │
│                                     └──────────────────┘ │
│                                                          │
│ Rechnung   /   Angebot <Titel>          ← H1, schwarz    │
│                                                          │
│ Sehr geehrte … ,                                         │
│ Intro-Absatz …                                           │
│                                                          │
│ ┌───────────┬────────────────────────────┬─────────────┐ │
│ │ Ausführung│ Leistung                   │ Preis       │ │   ← Tabelle
│ │ Pauschal  │ Büro Unterhalts- + …       │ 350,00 Euro │ │     dünne
│ ├───────────┴────────────────────────────┼─────────────┤ │     graue
│ │ Zzgl. Gesetzlicher Mehrwertsteuer 19 %│  66,50 Euro │ │     Linien
│ ├───────────────────────────────────────┼─────────────┤ │
│ │ Gesamtbetrag inkl. MwSt.    (fett)    │ 416,50 Euro │ │
│ └───────────────────────────────────────┴─────────────┘ │
│                                                          │
│ Outro …                                                  │
│ Mit freundlichen Grüßen                                  │
│ Raed Mustafa                                             │
│ Geschäftsführer                                          │
│                                                          │
├──────────────────────────────────────────────────────────┤   ← Footer
│ Firma          Bankverbindung   Kontakt       Register   │
│ Zeile1         Bank             Tel           HRB        │
│ Zeile2         IBAN             Tel2          GF         │
│ Zeile3                          Mail / Web    USt-ID     │
└──────────────────────────────────────────────────────────┘
```

Konkrete Tokens:
- **Farben**: nur `#000` (Text/Linien), `#666` (Hilfslabels), `#cfcfcf` (Tabellenlinien/Trennlinie über Footer). Keine blauen Headerzellen, kein Akzentblau mehr.
- **Schrift**: Roboto, Body 10 pt, Tabelleninhalt 9–10 pt, Header H1 22 pt **bold**, Meta-Box 10 pt, Footer 7 pt.
- **Margins**: `[55, 110, 55, 130]` (mehr Luft, damit Footer-Block nie kollidiert).
- **Logo**: rechts oben, 140 pt breit; Absenderzeile links auf gleicher Höhe, klein + unterstrichen.
- **Meta-Box (nur Rechnung)**: rechts unter Logo, 230 pt breit, dünner schwarzer Rahmen, Padding 8 pt, zwei Spalten Label / Wert.
- **Tabelle**:
  - Mit Pauschal-Positionen: Spalten `Ausführung | Leistung | Preis` (95 / * / 90).
  - Klassische Positionen: `Pos | Beschreibung | Menge | Einheit | Einzelpreis | Summe`.
  - **Header-Zeile**: weißer Hintergrund, schwarze Schrift, oben + unten 0.7 pt Linie.
  - **Zellen**: nur horizontale Linien (0.4 pt `#cfcfcf`), keine Vertikalen → entspricht dem Beispiel.
  - **Summenzeilen** als zwei zusätzliche Tabellenrows (MwSt + Gesamt fett) statt separatem rechtem Block — passt 1:1 zur Vorlage.
- **Footer**: 4 Spalten (Firma · Bank · Kontakt · Register), 7 pt grau, oberhalb 0.5 pt graue Trennlinie.

## Robuste Mehrseiten-Logik (kein Überlauf!)

1. **`pageBreakBefore`-Hook** im pdfmake-Doc: bricht eine Tabellenzeile auf neue Seite, wenn `node.startPosition.top + node.startPosition.pageInnerHeight > availableHeight`.
2. **`dontBreakRows: true`** auf der Tabelle → eine Leistungszeile wird nie mittendrin getrennt.
3. **`keepWithHeaderRows: 1`** → Header wandert mit, falls die erste Datenzeile auf Folgeseite rutscht.
4. **`headerRows: 1`** + Wiederholung des Tabellen-Headers auf jeder Folgeseite.
5. **Summenzeilen** (MwSt / Gesamt) in eigene `unbreakable: true`-Gruppe → Summe steht nie isoliert oben auf einer neuen Seite.
6. **Outro / Grußformel** ebenfalls als `{ stack: [...], unbreakable: true }` → bleibt zusammen.
7. **pageMargins-Bottom 130 pt** garantiert, dass der 4-spaltige Footer nicht in den Content ragt.
8. **Lange Beschreibungen**: bleiben weiterhin als `stack` mit `ul`-Bullets — pdfmake umbricht Wörter automatisch innerhalb der Spalte, kein horizontales Überlaufen mehr (Spalte hat feste Maximalbreite `*`).

## Code-Änderungen

**`src/lib/pdf/belegPdf.ts`**
- `header()` umbauen: links Absenderzeile (klein, unterstrichen), rechts Logo (140 pt) — keine doppelte Absenderzeile mehr im Body.
- `footer()` umbauen: 4 gleichbreite Spalten, oben 0.5 pt graue Linie via `canvas`.
- Neue Funktion `metaBox(meta)` mit umrandeter Box für Rechnungen (Angebote: schlichte rechtsbündige Datumszeile wie im Angebots-Beispiel).
- `leistungstabelle()` neu: schwarz/weiß, MwSt + Gesamt als integrierte Tabellenzeilen, `dontBreakRows`, `keepWithHeaderRows`.
- `summenBlock()` entfällt (in Tabelle integriert).
- `buildDocWithOverrides()`: Margins, `pageBreakBefore` mit Höhen-Check, Outro als `{ stack, unbreakable: true }`.
- Hotspot-IDs (`tabelle`, `summe`, `outro`, `pos:<id>` …) bleiben erhalten, damit der Live-Editor weiterläuft.

**`backend/src/pdf/layout.ts`**
- Identische Änderungen 1:1 portieren (gleiche Funktionsnamen, gleiche Struktur).
- Damit bleibt Server-Cache-Hash deterministisch und Server- und Browser-PDF sind pixelgleich.

**Keine Änderungen** an Hooks, Viewer, Editor-Layout, Routing, Tests-Setup nötig. Backend-Snapshot-Test (`backend/test/pdf.spec.ts`) prüft nur „beginnt mit %PDF-" und Belegnummer im Dateinamen — bleibt grün.

## QA

1. Frontend-Vorschau (`/rechnungen/:id`, `/angebote/:id`) hart neu laden → Look prüfen.
2. Im Editor `/…/bearbeiten` 15+ Positionen mit langen Beschreibungen anlegen → muss sauber auf Seite 2/3 umbrechen, Footer überall vorhanden, kein Text außerhalb der Zellen.
3. Eye-Icon-Dialog auf Liste prüfen.
4. Backend-Tests (`bun test` im `backend/`) müssen grün bleiben.

Nach Freigabe setze ich die Änderungen direkt um.
