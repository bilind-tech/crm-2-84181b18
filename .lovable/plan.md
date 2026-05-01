## Mobile-Optimierung: Sidebar, horizontaler Scroll & Suche

Drei klar abgegrenzte Probleme auf dem Handy:

1. **Sidebar bleibt offen** nach Klick auf einen Menüpunkt
2. **Horizontaler Scroll** in den Listen (Rechnungen/Angebote) und in den Anlege-Formularen (Positionen-Tabelle, breite Filter-Bar)
3. **Globale Suche** öffnet einen hässlichen zentrierten Dialog — soll auf Mobil als saubere Top-Bar erscheinen

---

### 1. Sidebar nach Klick automatisch schließen (Mobil)

**Datei:** `src/components/layout/AppSidebar.tsx`

- Aus `useSidebar()` zusätzlich `setOpenMobile` und `isMobile` ziehen.
- Auf jedem `<Link>` im Menü (innerhalb von `SidebarMenuButton`) `onClick` hinzufügen, das `setOpenMobile(false)` aufruft, wenn `isMobile === true`.
- Greift nur am Handy — am Desktop ändert sich nichts.

---

### 2. Horizontaler Overflow vollständig verhindern

**a) Listen-Seiten — `overflow-x-auto` ist nur am Desktop nötig**

- `src/routes/rechnungen.tsx` (Zeile 215–216): Der Tabellen-Wrapper ist bereits `hidden md:block`. Trotzdem rutscht er manchmal raus, weil die Mobile-Card-Liste darüber `overflow-visible` hat. → Sicherstellen, dass die äußere Page-Container (Top-Level `<div>` der Route) `min-w-0` und `overflow-x-hidden` bekommt.
- `src/routes/angebote.tsx`: gleiche Behandlung.
- Zusätzlich in `src/routes/__root.tsx` den `<main>` mit `min-w-0 overflow-x-hidden` versehen, damit kein Kind die Viewport-Breite sprengen kann.

**b) FilterBar (`src/routes/angebote.tsx`, Zeile 275–304) — wird auch in Rechnungen genutzt**

- Aktuell: `min-w-[200px]` auf dem Such-Input erzwingt Mindestbreite, dazu `flex-wrap` auf dem Container → das Such-Feld bricht zwar um, sprengt aber bei sehr schmalen Viewports (<360 px) trotzdem.
- Fix: `min-w-[200px]` durch `min-w-0` ersetzen, Container behält `flex-wrap` + `gap-2 sm:gap-3`. Tabs-Pillen-Container bekommt `flex-wrap`, damit auch die Status-Filter umbrechen statt zu überlaufen.

**c) Positionen-Editor im Anlege-Formular**

- `src/components/forms/BelegForm.tsx` Zeile 213/230: aktuell `sm:grid-cols-[24px_1fr_70px_80px_110px_70px_110px_32px]` — das addiert sich auf ~530 px Mindestbreite und bricht auf 360-px-Viewports.
- Fix: Die Mobile-Variante (`grid-cols-2`) nicht erst ab `sm:` umschalten, sondern erst ab `md:` (≥768 px) auf das 8-Spalten-Grid wechseln. Dazu Header-Zeile (213) ebenfalls auf `md:grid` statt `sm:grid` ändern.
- `src/components/forms/PositionenEditor.tsx` Zeile 165: Wrapper-`overflow-x-auto` bleibt, ist aber bereits in `hidden md:block` gekapselt → ok, kein Eingriff nötig.

**d) Belegformular-Grids**

- `BelegForm.tsx` Zeile 372 `sm:grid-cols-5` (Rechnungs-Daten) → wird auf 360 px bei Beschriftung „Skontofrist (Tage)" zu eng. Auf `sm:grid-cols-2 md:grid-cols-5` ändern.
- Gleiches Schema präventiv für Zeile 360 (`sm:grid-cols-3` → `grid-cols-2 md:grid-cols-3`).

---

### 3. Suche als Top-Bar statt Center-Dialog (nur Mobil)

**Datei:** `src/components/layout/GlobalSearch.tsx` und `AppHeader.tsx`

Aktuell wird `CommandDialog` (shadcn) genutzt — der rendert ein zentriertes Modal mit Backdrop, das auf dem Handy mittig „schwebt".

**Neue Struktur:**

- Über `useIsMobile()` (`src/hooks/use-mobile.tsx`) erkennen, ob Mobile-Viewport.
- **Desktop:** Verhalten bleibt wie bisher (CommandDialog mittig — passt da gut).
- **Mobile:** Statt `CommandDialog` ein eigenes Overlay mit `fixed inset-0 z-50 bg-background flex flex-col`:
  - Oben (`sticky top-0`) eine Suchleiste mit Zurück-Pfeil + `<input>` (autoFocus) + X-Button
  - Darunter scrollbare Resultliste (`Command` ohne Dialog-Wrapper, nur `CommandList` + `CommandGroup`)
  - Animation: Slide von oben (`animate-in slide-in-from-top duration-200`)

So sieht es aus wie eine native iOS/Android-Suche: Tippt der User auf die Lupe, klappt sofort eine Suchleiste am oberen Rand auf, der Cursor steht im Feld, Tastatur fährt hoch — keine zentrale Dialog-Box mehr.

**`AppHeader.tsx`** bleibt fast unverändert — der Lupen-Button öffnet weiterhin `setSearchOpen(true)`, die Render-Logik liegt in `GlobalSearch.tsx`.

---

### Technische Details

```text
AppSidebar.tsx
└── const { state, isMobile, setOpenMobile } = useSidebar()
└── <Link onClick={() => isMobile && setOpenMobile(false)}>

__root.tsx <main>
└── className="... min-w-0 overflow-x-hidden"

FilterBar (angebote.tsx)
└── min-w-[200px] → min-w-0
└── tabs-container: + flex-wrap

BelegForm.tsx
└── sm:grid-cols-[24px_1fr_...] → md:grid-cols-[24px_1fr_...]
└── sm:grid-cols-5 → grid-cols-2 md:grid-cols-5

GlobalSearch.tsx
└── if (isMobile) return <MobileSearchSheet/>
└── else return <CommandDialog/>  (wie bisher)
```

### Was NICHT angefasst wird

- Desktop-Layout der Listen, Formulare, Suche
- Funktionalität (Suche-Endpoint, Sidebar-Routing, Form-Logik)
- Sidebar-Struktur, Icons, Badges
