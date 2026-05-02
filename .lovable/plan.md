## Ziel

In den Übersichten **Angebote** und **Rechnungen** einen zusätzlichen Zeitraum-Filter (Jahr + Monat) ergänzen. Wenn z. B. „2025" und „Mai" gewählt sind, werden nur Belege angezeigt, die in diesem Monat erstellt wurden. Funktioniert zusätzlich zu den bestehenden Status-Tabs und der Suche.

## Was passiert visuell

- Neben der Filter-Pillen-Leiste erscheinen zwei kompakte Dropdowns mit Kalender-Icon: **Jahr** und **Monat**.
- Mobil: in der Filter-Sheet-Auswahl als zwei Selects untereinander (kein zusätzlicher horizontaler Scroll).
- Standard: „Alle Jahre / Alle Monate" — wirkt wie kein Filter.
- Sobald gefiltert: kleines „×"-Icon erscheint zum Zurücksetzen.
- Monatsauswahl ist nur aktiv, wenn ein Jahr gewählt wurde (sonst macht „Mai über alle Jahre" keinen Sinn).

## Datums-Basis

| Liste | Filter-Datum |
|---|---|
| Angebote | `erstelltAm` (Erstellungsdatum des Angebots) |
| Rechnungen | `rechnungsdatum` (das offizielle Rechnungsdatum) |

Begründung: Das ist das Datum, das auf dem Beleg steht und das der Nutzer im Kopf hat („Rechnung vom Mai 2025"). `erstelltAm`-Sortierung in der Tabelle bleibt unverändert.

## Änderungen

### Neu: `src/components/filters/ZeitraumFilter.tsx`
- Komponente mit Props `{ value, onChange, verfuegbareDaten }`.
- Liest aus `verfuegbareDaten` (Liste der Datums-Strings) die vorhandenen Jahre und sortiert sie absteigend; aktuelles Jahr wird immer angeboten.
- Zwei `Select`-Dropdowns (shadcn) im Pillen-Stil, passend zur bestehenden Filter-Leiste.
- Exportiert zusätzlich:
  - `ZeitraumState`-Typ: `{ jahr: "alle" | "YYYY"; monat: "alle" | "01"–"12" }`
  - `ZEITRAUM_ALLE`-Konstante als Default
  - `passtInZeitraum(iso, z)`-Helper für die Filter-Logik

### Edit: `src/routes/angebote.tsx`
- Neuer State: `const [zeitraum, setZeitraum] = useState(ZEITRAUM_ALLE)`.
- `filtered` zusätzlich filtern: `passtInZeitraum(a.erstelltAm, zeitraum)`.
- `<ZeitraumFilter />` im `extra`-Slot der `FilterBar` einbinden, `verfuegbareDaten = alle.map(a => a.erstelltAm)`.

### Edit: `src/routes/rechnungen.tsx`
- Analog: `passtInZeitraum(r.rechnungsdatum, zeitraum)`.
- KPI-Karte „Eingang diesen Monat" bleibt unverändert (nutzt aktuellen Monat unabhängig vom Filter).

### Edit: `src/routes/angebote.tsx` (FilterBar)
- Die `FilterBar` hat bereits einen `extra`-Slot — der wird beim Desktop-Layout sichtbar. Für Mobile ergänzen wir den ZeitraumFilter ebenfalls in der Mobile-FilterBar (in der Sheet-Auswahl, als eigene Sektion „Zeitraum" über den Status-Tabs).

## Technische Details

- Filter-Datum-Felder im Datenmodell sind ISO-Strings (`YYYY-MM-DD`). Vergleich rein per String-Slice (`slice(0,4)` für Jahr, `slice(5,7)` für Monat) — schnell, kein Date-Parsing nötig.
- Filter wird **nicht** in URL-Search-Params gespeichert (lokaler Komponenten-State). Reicht für den Use-Case und vermeidet Routen-Schema-Änderungen.
- Bestehende Status-Tabs, Suche und KPI-Karten bleiben unverändert.

## Akzeptanzkriterien

- In `/angebote` und `/rechnungen` gibt es Dropdowns „Jahr" und „Monat" neben den Status-Tabs.
- Wahl von Jahr 2025 + Monat Mai zeigt nur Belege mit Datum im Mai 2025.
- „Alle Jahre" als Default — keine Liste wird zunächst eingeschränkt.
- Reset-Button (×) erscheint, sobald ein Filter aktiv ist.
- Funktioniert auf Mobil (Filter-Sheet) und Desktop (Pillen-Leiste).
