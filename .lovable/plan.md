## Ziel

Auf dem Dashboard (`/`) soll der gleiche **Jahr/Monat-Filter** verfügbar sein wie auf den Listen für Angebote/Rechnungen. Alle Kennzahlen, das Umsatz-Diagramm und die Listen-Widgets reagieren live auf den gewählten Zeitraum, sodass man z. B. „Mai 2026" oder „2025 gesamt" oder „letzter Monat" einsehen kann. Design schlicht, dezent, mobile-first.

## UX / Design

**Position:** Direkt unter dem `PageHeader` („Übersicht"), oberhalb der KPI-Karten. Eine schmale, ruhige Filter-Leiste — kein Karten-Container, nur eine Inline-Zeile mit zwei Dropdowns + dezentem Reset-X (X erscheint nur wenn Filter aktiv).

**Komponente:** Wir verwenden die bereits bestehende `ZeitraumPills`-Logik aus `src/routes/angebote.tsx` und ziehen sie in eine eigenständige, wiederverwendbare Komponente `src/components/filters/ZeitraumSelect.tsx` hoch. So nutzen Dashboard, Angebote und Rechnungen exakt denselben Baustein (eine Quelle der Wahrheit).

**Mobile (390px, aktuelle Viewport):**
- Volle Breite, zwei gleich große Dropdowns nebeneinander (`grid-cols-2 gap-2`), Reset-X als Icon-Button rechts (nur sichtbar wenn aktiv) → kein horizontales Scrollen.
- Höhe `h-9`, Pill-Style (`rounded-full`), `bg-background border-border` — passt zum bestehenden Stil.

**Desktop:**
- Inline links, Dropdowns mit fixer Breite (Jahr 120 px, Monat 140 px), kompakt.

**Aktiv-Hinweis:** Wenn ein Zeitraum gewählt ist, zeigt eine kleine, dezente Sub-Zeile unter dem PageHeader-Subtitle den aktiven Zeitraum als Text (z. B. „Zeitraum: Mai 2026") — keine Badges/Buttons. Reines `text-xs text-muted-foreground`.

**Default:** „Alle Zeiten" (analog zu Listen). Auswahl bleibt nur lokal im Component-State, kein URL-Param (Dashboard ist Übersicht, kein Sharing-Use-Case). Optional später auf Search-Params umstellbar — kein Teil dieses Tasks.

## Was reagiert auf den Filter

1. **KPI „Umsatz Monat"** → wird zu **„Umsatz im Zeitraum"** (brutto-Summe aller `UmsatzPunkt`-Werte, die in den Zeitraum fallen). Sublabel zeigt dynamisch „Mai 2026" / „2026" / „gesamt".
2. **KPI „Offene Rechnungen"** → zählt nur Rechnungen mit `rechnungsdatum` im Zeitraum.
3. **KPI „Aufträge"** und **„Kunden"** → bleiben unverändert (Stammdaten ohne Zeitbezug); Sublabel deutet das nicht an.
4. **Umsatz-Chart**:
   - Wenn `monat = "alle"` und `jahr = "alle"`: bisheriges Verhalten (letzte 6 Monate).
   - Wenn `jahr` gesetzt + `monat = "alle"`: zeigt alle 12 Monate dieses Jahres.
   - Wenn `jahr` + `monat` gesetzt: zeigt diesen einen Monat als Einzel-Bar mit prominentem Wert daneben (kompakter Single-Value-Block statt Chart, damit es nicht leer wirkt).
5. **Widget „Offene Rechnungen"** (Liste): filtert Einträge nach `rechnungsdatum` im Zeitraum. Empty-State wird angepasst („Im gewählten Zeitraum keine offenen Rechnungen").
6. **Widget „Mahnwesen"**: Zähler werden auf Rechnungen im Zeitraum begrenzt (siehe Backend-Sektion).
7. **Widget „Daueraufträge"**: bleibt unverändert (zeigt aktuellen Bestand, kein Zeitbezug — würde Filter verwirrend machen).

## Technische Änderungen (Frontend)

### A) Neue gemeinsame Komponente `src/components/filters/ZeitraumSelect.tsx`
- Exportiert `<ZeitraumSelect zeitraum setZeitraum verfuegbareDaten variant="inline" | "card" />`.
- Inhalt = aktuelle `ZeitraumPills`-Implementierung aus `angebote.tsx`, leicht generalisiert (responsive: auf Mobile `flex-1` statt fixer Breite).
- `angebote.tsx` und `rechnungen.tsx` werden so umgestellt, dass sie diese Komponente importieren statt eine lokale Kopie zu halten (Refactor ohne UI-Änderung dort).

### B) `src/routes/index.tsx` (Dashboard)
- Lokaler State `const [zeitraum, setZeitraum] = useState<ZeitraumState>(ZEITRAUM_ALLE)`.
- `verfuegbareDaten` = `rechnungen.map(r => r.rechnungsdatum)` + Umsatz-Monate.
- Neuen Filter-Block direkt unter `PageHeader` rendern (Inline-Layout).
- Helper-Funktion `formatZeitraumLabel(z)` → „Mai 2026" / „2026" / „gesamt" für Sublabels.
- `useMemo` für:
  - `umsatzImZeitraum`: Filter über `umsatz`-Array nach `monat`-String (`YYYY-MM`).
  - `chartData`: 6/12/1-Punkte je nach Filter (siehe oben).
  - `offeneImZeitraum`: `offene.filter(r => passtInZeitraum(r.rechnungsdatum, zeitraum))`.
  - `summeZeitraum`: brutto-Summe.
- KPI-Karten und Chart-Header dynamisch beschriften.

### C) `src/hooks/useMahnZaehler.ts`
- Optionalen Parameter `zeitraum?: ZeitraumState` ergänzen.
- Wenn gesetzt: vorab `rechnungen.filter(r => passtInZeitraum(r.rechnungsdatum, zeitraum))`. Default-Verhalten unverändert (rückwärtskompatibel mit Sidebar-Badge-Nutzung).

### D) Refactor (begleitend, klein)
- `src/routes/angebote.tsx`: lokale `ZeitraumPills` entfernen, neue `ZeitraumSelect` importieren.
- `src/routes/rechnungen.tsx`: dito (falls dort eigene Variante existiert; ansonsten unverändert).

## Backend-Vorbereitung (für später, ohne API-Bruch)

Damit der Pi-Backend-Server den Zeitraum sauber unterstützt, ohne dass das Frontend nochmal angefasst werden muss:

- **`/dashboard/kennzahlen`**: optionale Query-Params `?jahr=YYYY&monat=MM` (beide optional, „alle" = weglassen). Backend filtert `rechnungen`/`angebote` analog zur Frontend-`passtInZeitraum`-Regel. Antwort-Shape bleibt `DashboardKennzahlen` (unverändert), Werte spiegeln den Zeitraum.
- **`/dashboard/umsatz`**: optionale Query-Params `?jahr=YYYY&monat=MM`. Verhalten:
  - keine Params → letzte 12 Monate (heutiges Verhalten beibehalten).
  - nur `jahr` → alle 12 Monate dieses Jahres als `UmsatzPunkt[]`.
  - `jahr` + `monat` → genau ein `UmsatzPunkt`.
- **Hooks** `useDashboardKennzahlen(zeitraum?)` und `useUmsatz(zeitraum?)` werden so erweitert, dass sie den Zeitraum als Query-String anhängen und in den `queryKey` aufnehmen. Solange kein Zeitraum übergeben wird, identisches Verhalten — keine Mock-/Backend-Anpassung **zwingend** nötig für diesen Schritt.
- **Mock-Backend** (`src/lib/mock/backend.ts`): Im selben Schritt erweitern wir die Match-Regeln auf `path.split("?")[0]` (für Kennzahlen schon nötig, für Umsatz bereits vorhanden) und parsen `jahr`/`monat` aus `path` — so funktioniert die Demo nahtlos.

Damit ist die End-to-End-Funktion komplett: Wenn das echte Pi-Backend dieselben Query-Params unterstützt, läuft alles ohne weitere Frontend-Änderung.

## Betroffene Dateien

- **Neu:** `src/components/filters/ZeitraumSelect.tsx`
- **Geändert:** `src/routes/index.tsx`, `src/hooks/useMahnZaehler.ts`, `src/hooks/useApi.ts` (`useDashboardKennzahlen`, `useUmsatz` um optionalen Zeitraum erweitern), `src/lib/mock/backend.ts` (Query-Param-Parsing für Kennzahlen + Umsatz), `src/routes/angebote.tsx` und `src/routes/rechnungen.tsx` (Refactor auf `ZeitraumSelect`).

## Nicht enthalten

- Kein Wechsel auf URL-Search-Params für den Dashboard-Filter (bewusst lokaler State).
- Keine Änderung am Daueraufträge-Widget (bleibt zeitraumlos, da Bestandsgröße).
- Keine Änderung an `Warnungen`/Sidebar-Badge (Mahn-Zähler bleibt ungefiltert für globalen Sidebar-Badge — nur Dashboard-Widget filtert).
