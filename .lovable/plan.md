## Ziel

Die Umsatz-Grafik im Dashboard wird vom statischen Balkendiagramm zu einem kompakten, interaktiven Chart-Modul — mit eigenem Zeitraum, Diagramm-Typ und sinnvollen Vergleichswerten. Übersichtlich, nicht überladen.

## Was sich ändert

### 1. Neue Komponente `UmsatzChartCard`

Datei: `src/components/dashboard/UmsatzChartCard.tsx`
Ersetzt im Dashboard den bisherigen Inline-Chart-Block (Zeilen 190–236 in `src/routes/index.tsx`).

Enthält drei kleine, schlichte Bedien-Elemente in der Card-Header-Zeile (rechtsbündig, dezent):

1. **Zeitraum** (eigener, lokaler Zeitraum — unabhängig vom globalen Dashboard-Filter, damit man oben „aktueller Monat" sehen und in der Grafik trotzdem 12 Monate vergleichen kann):
   - `Letzte 6 Monate` (Default)
   - `Letzte 12 Monate`
   - `Aktuelles Jahr`
   - `Letztes Jahr`
   - `Quartalsweise (4 Quartale)`
2. **Diagramm-Typ** (Icon-Toggle, 3 Optionen):
   - Balken (Default)
   - Linie
   - Fläche
3. **Wert** (kleines Segment-Toggle):
   - Brutto (Default)
   - Netto

### 2. Was die Karte zusätzlich anzeigt

Über dem Chart eine schlanke Kennzahlen-Zeile mit drei Werten — knapp, eine Zeile:

- **Summe** im gewählten Zeitraum
- **Ø pro Monat** (bzw. pro Quartal im Quartals-Modus)
- **Δ vs. Vorperiode** mit kleinem Pfeil + Prozent (grün/rot, dezent)

Der vorhandene „Summe" rechts oben entfällt — geht in die neue Zeile auf.

### 3. Chart-Verhalten

- Eine `<ResponsiveContainer>` rendert je nach Auswahl `BarChart` / `LineChart` / `AreaChart` aus `recharts`.
- Tooltip zeigt: Label, Brutto **und** Netto (egal welche Option aktiv ist) + Monatsname lang.
- Klick auf einen Datenpunkt setzt den **globalen** Dashboard-Zeitraum oben auf diesen Monat (so springt man von der Grafik in die Detailsicht der KPI-Kacheln und der Listen unter dem Chart).
- Quartals-Modus aggregiert die 12 Monate des Jahres clientseitig zu Q1–Q4.
- Achsen, Grid, Farben bleiben wie bisher (`var(--primary)`, `var(--border)`), Linien-/Flächen-Variante nutzt eine sanfte `primary`-Tönung (`color-mix` mit transparent für die Fläche).

### 4. Datenbeschaffung

- `useUmsatz()` wird mit dem **lokalen** Chart-Zeitraum aufgerufen, nicht mit dem globalen Dashboard-Filter.
  - „Letzte 12 Monate" → `useUmsatz()` ohne Argumente (Backend liefert bereits 12 Monate).
  - „Letzte 6 Monate" → `useUmsatz()` ohne Argumente, clientseitig auf die letzten 6 gekürzt.
  - „Aktuelles Jahr" / „Letztes Jahr" → `useUmsatz({ jahr, monat: "alle" })` (Backend liefert genau diese 12 Monate).
  - „Quartalsweise" → wie aktuelles Jahr, danach clientseitig zu 4 Quartalen aggregiert.
- Keine Backend-Änderung nötig — die bestehende Route `/dashboard/umsatz` deckt alle Fälle ab.
- „Δ vs. Vorperiode" wird mit einem zweiten `useUmsatz`-Aufruf für die Vorperiode geholt (gleiche Länge, davorliegender Zeitraum).

### 5. Persistenz der Auswahl

Die drei Bedien-Werte werden in `localStorage` unter dem Key `dashboard.umsatzChart` gespeichert (Zeitraum / Typ / Wert), sodass die Einstellung beim nächsten Besuch erhalten bleibt. Reine Client-State, kein Backend-Roundtrip.

### 6. Mobile

- Die drei Toggles fließen unter den Titel, nicht in die Header-Zeile rechts (Stack auf `< sm`).
- Chart-Höhe bleibt 256 px (`h-64`).

### 7. Was bewusst NICHT kommt

- Kein Export-Button, kein Datums-Picker, keine Vergleichs-Overlays — würden die Karte überladen.
- Kein zweites Diagramm (z. B. Kunden-Anteile) auf dem Dashboard — gehört auf eine spätere Auswertungs-Seite.
- Keine Animationen/Verzierungen (Memory-Regel: keine Deko-Icons, keine Gradients in Cards).

## Technische Details (Kurz)

- Recharts ist bereits installiert (`Bar`, `BarChart`, `CartesianGrid`, `ResponsiveContainer`, `Tooltip`, `XAxis`, `YAxis` werden heute schon genutzt).
- Neu importiert: `Line`, `LineChart`, `Area`, `AreaChart` aus `recharts`.
- Lucide-Icons für Toggles: `BarChart3`, `LineChart` (als Icon), `AreaChart` (als Icon), `TrendingUp`, `TrendingDown`.
- `src/routes/index.tsx` schrumpft um ca. 50 Zeilen, der Chart-Block wird zu `<UmsatzChartCard onMonatKlick={(monat) => setZeitraum({ jahr, monat })} />`.
- Keine neuen Dependencies.

## Ergebnis

Eine einzige, ruhige Card mit:

```text
┌─ Umsatz ──────────────────  [6M] [12M] [Jahr] …  [Bal│Lin│Flä]  [Brutto│Netto] ┐
│ Summe 24.300 €    Ø 4.050 €/Monat    +12 % vs. Vorperiode                       │
│                                                                                  │
│   ▮  ▮  ▮▮  ▮▮▮  ▮▮▮▮  ▮▮▮                                                       │
│                                                                                  │
└─ Klick auf Balken → globaler Zeitraum springt auf diesen Monat ────────────────┘
```