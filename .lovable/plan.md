## Ziel

Beide dedizierten Dauerauftrag-Seiten löschen — Liste und Posteingang. Die Funktionalität existiert bereits in den normalen Rechnungs-/Angebotslisten (jede generierte Rechnung ist eine ganz normale Rechnung mit Belegnummer und Bezahlt-Markierung). Der „wiederkehrend"-Charakter wird auf der Rechnungs-/Angebot-**Detailseite** sichtbarer gemacht, sodass man den Dauerauftrag dort prüfen, pausieren und beenden kann — und Monat für Monat als bezahlt markieren.

## Was gelöscht wird

- `src/routes/dauerauftraege.tsx` — Übersichts-Seite
- `src/routes/dauerauftraege.posteingang.tsx` — Posteingang-Seite
- `src/routes/dauerauftraege.$id.tsx` — Detail-Seite
- Alle Sidebar-/Dashboard-Links, die auf `/dauerauftraege*` zeigen (siehe unten).

Routen, die im Backend bleiben (weil sie der Hintergrund-Generator und der Rechnungs-Detail-Block weiter nutzen):

- `GET/POST/PATCH/DELETE /dauerauftraege` und `…/:id`
- `…/:id/sofort-lauf`, `…/:id/pausieren`, `…/:id/beenden`
- `useDauerauftraege`, `useDauerauftrag`, `useUpdateDauerauftrag`, `useDeleteDauerauftrag`, `usePausiereDauerauftrag`, `useBeendeDauerauftrag`, `useSofortLauf`

`DauerauftragForm.tsx` wird nicht mehr direkt aufgerufen → entfernen. Daueraufträge werden ausschließlich über das Häkchen „wiederkehrend" beim Anlegen einer Rechnung/eines Angebots erzeugt (existierende Logik in `OptionenBlock` + `RechnungForm`/`AngebotForm`).

## Was sich an bestehenden Stellen ändert

### `src/routes/index.tsx` (Dashboard)

- Die Karte „Daueraufträge" mit „Aktive Aufträge / MRR / Posteingang" entfällt komplett (Zeilen ~258–308).
- Der Posteingang-Hinweis wandert in eine kleine Banderole **oben** im Dashboard (nur sichtbar, wenn offene Entwürfe aus Daueraufträgen existieren): „N Rechnungs-Entwürfe aus Daueraufträgen warten auf Freigabe → zur Rechnungsliste mit Filter Entwurf".
- MRR (`Wiederkehrender Umsatz`) wandert als zusätzlicher KPI nicht mit — gehört thematisch nicht ins Übersichts-Dashboard. Falls gewünscht, könnten wir es später einer Statistik-Seite hinzufügen.

### `src/routes/rechnungen.$id.tsx` (Rechnungsdetail) — Hauptort für „Dauerauftrag verwalten"

Wenn die Rechnung aus einem Dauerauftrag stammt (`r.optionen?.wiederkehrend === true` und im Backend ein verknüpfter `dauerauftragId` existiert), wird im rechten Optionen-Block aus dem heutigen reinen Info-Eintrag eine **Dauerauftrag-Karte**:

```text
┌─ Dauerauftrag · monatlich ────────────────┐
│ Nächster Lauf: 01.06.2026                 │
│ Modus: Entwurf zur Freigabe               │
│                                            │
│ [Pausieren]  [Beenden]  [Sofort erzeugen] │
└────────────────────────────────────────────┘
```

- Pausieren/Beenden/Sofort-Lauf nutzen die bestehenden Hooks (`usePausiereDauerauftrag`, `useBeendeDauerauftrag`, `useSofortLauf`).
- Bezahlt-Markierung pro Monat ist **kein neuer Mechanismus** — jede generierte Monatsrechnung hat eine eigene Belegnummer und ihren eigenen „Als bezahlt markieren"-Button (existiert schon). Ein Hinweis im Card-Footer macht das transparent: „Jeder Monat ist eine eigene Rechnung — bezahlt-Markierung erfolgt pro Monat in der jeweiligen Rechnung."
- Eine kleine Liste „Letzte 3 Läufe" mit Status (bezahlt/offen/entwurf) und Link zur jeweiligen Rechnung darunter — so sieht man auf einen Blick, welche Monate schon bezahlt sind.

Backend-Ergänzung dazu (klein):
- `GET /dauerauftraege/:id/laeufe` liefert bereits Läufe mit `rechnungId` — für die „Letzte 3 Läufe"-Liste reicht das.
- Damit `r.dauerauftragId` auf der Rechnung verfügbar ist: bereits im Generator gesetzt (siehe `lib/dauerauftrag/generator.ts`); falls nicht, kleine Anpassung.

### `src/routes/angebote.$id.tsx` (Angebotsdetail)

Analog: Wenn das Angebot als „wiederkehrend" markiert ist und daraus bereits ein Dauerauftrag entstanden ist, kleine Dauerauftrag-Karte mit Pausieren/Beenden + Hinweis. Wenn noch kein Dauerauftrag entstand (Angebot noch nicht in Rechnung umgewandelt), bleibt es bei der reinen Info-Zeile wie heute.

### `src/routes/rechnungen.tsx` (Rechnungs-Liste)

- Neue dezente Spalte/Badge „⟲" (Repeat-Icon) hinter der Belegnummer für Rechnungen aus Dauerauftrag — schnelles visuelles Erkennen.
- Filterleiste bekommt eine zusätzliche Option „nur Daueraufträge" (Checkbox/Toggle, klein).
- Damit ist der „Posteingang" auf natürliche Weise abgebildet: Filter `Status = Entwurf` + `nur Daueraufträge` zeigt genau die Liste, die heute auf der Posteingang-Seite steht.

### `src/routes/__root.tsx`

- Falls in der Sidebar ein Eintrag „Daueraufträge" existiert: entfernen. (Schnell-Check zeigt nur einen Toast-Verweis im Generator-Code, keinen Sidebar-Link — bleibt also nur der Toast-Text.)

## Datei-Operationen

**Löschen:**
- `src/routes/dauerauftraege.tsx`
- `src/routes/dauerauftraege.posteingang.tsx`
- `src/routes/dauerauftraege.$id.tsx`
- `src/components/forms/DauerauftragForm.tsx`

**Anpassen:**
- `src/routes/index.tsx` — Daueraufträge-Card raus, kleine Banderole rein
- `src/routes/rechnungen.$id.tsx` — Optionen-Eintrag „Dauerauftrag" zur Verwaltungs-Card erweitern + „Letzte Läufe"
- `src/routes/angebote.$id.tsx` — analog (nur wenn ein Dauerauftrag verknüpft ist)
- `src/routes/rechnungen.tsx` — Repeat-Badge + Filter „nur Daueraufträge"

`src/routeTree.gen.ts` wird vom TanStack-Router-Plugin automatisch neu generiert — nicht händisch anfassen.

## Was bewusst NICHT entfernt wird

- Der Hintergrund-Generator, der monatlich neue Rechnungs-Entwürfe erzeugt (`__root.tsx` löst das beim App-Start aus).
- Die Datenstrukturen `Dauerauftrag`/`DauerauftragLauf` und alle zugehörigen API-Routen.
- Das Häkchen „wiederkehrend" mit Frequenz-Konfiguration in Rechnung/Angebot anlegen.

## Ergebnis

Keine eigene Daueraufträge-Sektion mehr. Daueraufträge sind nur noch ein **Aspekt** einer Rechnung/eines Angebots — sichtbar als Badge in der Liste und als Verwaltungs-Card auf der Detailseite. Bezahlt wird pro Monat in der jeweiligen erzeugten Rechnung — wie bei jeder anderen Rechnung auch.