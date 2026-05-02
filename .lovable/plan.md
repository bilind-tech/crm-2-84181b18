## Ziel

1. **Filter-Pillen (Status) auch am Desktop in ein Dropdown** verschieben — genau wie auf dem Handy. Suchleiste links groß, rechts ein „Filter"-Dropdown mit Status (Alle/Entwurf/Versendet/…). Die Jahr/Monat-Auswahl bleibt am Desktop sichtbar wie aktuell (vom User explizit gewünscht: „die Monate sollen ganz normal wie jetzt aktuell sein").
2. **KPI-Reihenfolge angleichen**: Das Widget mit dem **eingegangenen/aktuellen Geld** steht auf jeder Seite (Dashboard, Angebote, Rechnungen) **immer ganz links / oben links** — auf Desktop wie auf Handy als erstes der vier Kacheln.

## Änderungen im Detail

### A) `src/routes/angebote.tsx` — `DesktopFilterBar`

Ersetzen der Pillen-Reihe durch ein Layout analog zur Mobile-Variante:

```text
[ 🔎  Suche, große Eingabe …………………………………… ]   [ Jahr ▾ ]  [ Monat ▾ ]   [ ⚙ Filter: Versendet ▾ ]
```

- Suchfeld links, `flex-1`, volle Breite des Containers minus Controls.
- Jahr/Monat-Selects (bestehende `ZeitraumPills`) bleiben rechts daneben unverändert sichtbar.
- Status-Dropdown ganz rechts: ein `Select` (shadcn) mit Trigger „Filter: {aktiver Label}", Optionen aus `tabs`. Aktiver Status sichtbar im Trigger; kleiner blauer Punkt wenn nicht „alle".
- Reset-X für Status erscheint nur wenn `filter !== "alle"`.
- Mobile-Variante (`MobileFilterBar`) bleibt unverändert.

### B) KPI-Reihenfolge — „Geld zuerst"

**`src/routes/rechnungen.tsx`** (Zeilen 126–146):
- Reihenfolge ändern auf:
  1. **Eingang diesen Monat** (success) — neu Position 1
  2. Offene Posten (primary)
  3. Überfällig (danger)
  4. Gesamt
- Auf Mobile (`grid-cols-2`) landet „Eingang diesen Monat" damit oben links — wie gewünscht.

**`src/routes/angebote.tsx`** (Zeilen 132–137):
- Reihenfolge ändern auf:
  1. **Offenes Volumen** (success, EUR) — neu Position 1 (das ist hier der Geldwert)
  2. Gesamt
  3. Entwürfe
  4. Versendet

**`src/routes/index.tsx`** (Dashboard, Zeilen 77–105):
- Reihenfolge ändern auf:
  1. **Umsatz Monat** (success, EUR) — neu Position 1
  2. Kunden
  3. Aufträge
  4. Offene Rechnungen

So steht auf jeder dieser Seiten — Desktop wie Handy (`grid-cols-2`) — die Geld-Kachel an erster Stelle bzw. oben links.

### C) Keine weiteren Seiten betroffen

Andere Listen (`/kunden`, `/objekte`, …) zeigen aktuell keine 4 KPI-Widgets im selben Muster und werden nicht angefasst. Sollten später weitere Seiten dieses Muster bekommen, gilt dieselbe Regel.

## Technische Notizen

- `FilterBar` wird auch von `src/routes/rechnungen.tsx` importiert (`import { FilterBar } from "@/routes/angebote"`) — eine Änderung wirkt automatisch auf beiden Seiten.
- Keine API-, Daten- oder Backend-Änderungen.
- Keine neuen Abhängigkeiten; `Select` aus `@/components/ui/select` ist bereits importiert.

## Betroffene Dateien

- `src/routes/angebote.tsx` (DesktopFilterBar umbauen, KPI-Reihenfolge)
- `src/routes/rechnungen.tsx` (KPI-Reihenfolge)
- `src/routes/index.tsx` (KPI-Reihenfolge)
