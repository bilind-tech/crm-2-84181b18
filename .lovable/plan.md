## KPI-Kacheln auf dem Handy: 2 Spalten, sauber, kein Text-Overflow

Aktuell: Auf den Listen-Seiten (Dashboard, Angebote, Rechnungen, Kunden, Dokumente) sind die 4 KPI-Kacheln auf dem Handy einspaltig untereinander → langes Scrollen, große Zahlen brechen aus dem Kästchen heraus.

Ziel: Auf dem Handy **2 × 2 Raster**, kompakter aber weiterhin schlicht und clean — nichts wirkt eingequetscht, kein Text läuft heraus.

### Änderungen

**1. `src/components/layout/PageHeader.tsx` — `KpiCard`**

- Padding kleiner auf Mobile: `p-3` statt `p-5` (`sm:p-5` bleibt für Desktop).
- Label-Schrift kleiner und mit `truncate`: `text-[10px]` mobil, `sm:text-xs` Desktop.
- Wert-Schrift kleiner und mit `truncate`: `text-lg` mobil, `sm:text-2xl` Desktop — verhindert Überlauf bei großen Zahlen wie „123.456,78 €".
- Sublabel ebenfalls `truncate` und `text-[11px]` mobil.
- Dekoratives Icon (rechts oben) wird auf Mobile **ausgeblendet** (`hidden sm:block`) — schafft den Platz, den die Zahl braucht.
- Container bekommt `min-w-0`, damit `truncate` im Flex-Layout greift.

**2. Grid-Layouts auf den fünf Seiten umstellen**

Überall, wo aktuell `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` steht, wird auf der Handy-Breakpoint-Stufe ebenfalls auf 2 Spalten gewechselt:

- `grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4`

Betroffene Dateien:
- `src/routes/index.tsx` (Dashboard)
- `src/routes/angebote.tsx`
- `src/routes/rechnungen.tsx`
- `src/routes/kunden.tsx`
- `src/routes/dokumente.tsx`

### Ergebnis

- 2 × 2 Raster auf Handy → eine Bildschirmhöhe statt vier.
- Schrift bleibt lesbar und schlicht, dezenter als Desktop, aber nicht eingequetscht.
- Lange Geldbeträge / hohe Zahlen werden notfalls mit `…` abgeschnitten statt das Kästchen zu sprengen.
- Auf Tablet (`sm:`) und Desktop bleibt das bisherige Aussehen unverändert.
