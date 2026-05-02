## Ziel
Den separaten **„Zeitraum"-Balken** (Jahr/Monat) auf der Rechnungs- und Angebotsseite entfernen — er hängt aktuell als zweite Leiste unter der FilterBar und sieht „hässlich" aus. Stattdessen wird der Zeitraum **in den bestehenden Filter integriert**: auf Desktop kompakt in der FilterBar selbst, auf Mobile im Filter-Sheet (das man über das Filter-Icon öffnet).

## Änderungen

### 1. `src/routes/angebote.tsx` & `src/routes/rechnungen.tsx`
- Den eigenständigen `<ZeitraumFilter ... />`-Block (eigene Zeile unter der FilterBar) entfernen.
- Stattdessen `zeitraum` + `setZeitraum` + `verfuegbareDaten` als neue Props an `FilterBar` übergeben.

### 2. `src/routes/angebote.tsx` — `FilterBar` erweitern
Neue Props auf `FilterBarProps`:
```ts
zeitraum?: ZeitraumState;
setZeitraum?: (v: ZeitraumState) => void;
verfuegbareDaten?: string[];
```

**Desktop (`DesktopFilterBar`):** Zwischen den Status-Pillen und dem Such-Input zwei kompakte `Select`s (Jahr + Monat) einfügen — keine eigene umrandete Karte mehr, sondern als nahtlose Pills im selben Bar-Container. Optisch wie die Status-Pillen (h-9, rounded-full, border-border). Wenn ein Zeitraum gesetzt ist, ein kleines „×" zum Zurücksetzen anzeigen.

**Mobile (`MobileFilterBar`):** Das Sheet bekommt zwei Sektionen mit Trennlinie:
- **Status** (wie bisher: Pill-Liste mit Check)
- **Zeitraum** (neu): Jahr-Select + Monat-Select untereinander, plus „Zurücksetzen"-Link, wenn aktiv.

Das Filter-Icon-Button im Mobile-Header zeigt einen kleinen Punkt/Badge, wenn entweder ein Status ≠ „alle" **oder** ein Zeitraum aktiv ist — so sieht der User auf einen Blick, dass im Sheet etwas eingestellt ist.

### 3. `src/components/filters/ZeitraumFilter.tsx`
- `passtInZeitraum`, `ZEITRAUM_ALLE`, `ZeitraumState` und die `MONATE`-Konstante bleiben als Exporte erhalten (werden weiterhin von beiden Routen + neu von `FilterBar` importiert).
- Die `ZeitraumFilter`-Komponente selbst wird nicht mehr verwendet — kann gelöscht werden, oder als interne Hilfs-Komponente bleiben (lösche ich, um Tote Code zu vermeiden).

### 4. Mobile-Verhalten
Auf 390px-Viewport: keine zweite Leiste mehr unter der FilterBar, dadurch kompakteres Layout, kein versehentliches Horizontal-Scrollen mehr durch die breiten Zeitraum-Pills.

## Ergebnis
- Eine einzige, einheitliche Filter-Karte pro Liste.
- Desktop: Zeitraum als zwei dezente Pills inline mit den Status-Pills.
- Mobile: Zeitraum sauber im Filter-Sheet, Filter-Icon zeigt aktiven Zustand.
- Keine doppelten Filter-Container mehr.