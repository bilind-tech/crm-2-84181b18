## Was wir ändern und warum

Du hast drei Punkte zu Daueraufträgen genannt — alle drei werden gefixt.

### 1. Rechnungs-Detailseite: keine destruktiven Aktionen mehr

Unten links auf einer Rechnungs-Detailseite zeigt der Bereich „Dauerauftrag" aktuell die Buttons **Pausieren · Sofort erzeugen · Beenden**. Du willst dort nichts „wegschießen" können — und genau das tun diese Buttons im Moment.

**Neu auf der Detailseite:**
- Info bleibt: Frequenz, Status-Badge, nächster Lauftermin, Anzahl bisheriger Läufe, letzte 3 Läufe als klickbare Liste.
- Einziger Button: **„Dauerauftrag bearbeiten"** — öffnet denselben Bearbeiten-Dialog, den du auch über die Listen-Seite erreichst (Bezeichnung, Frequenz, Status, Steuersatz, Rabatt, Notizen).
- **Pausieren / Sofort erzeugen / Beenden** werden auf der Rechnungs-Detailseite vollständig entfernt. Beenden / Pausieren bleibt im Bearbeiten-Dialog erreichbar (über das Status-Feld), versehentliches Klicken auf einen Button schießt aber nichts mehr ab.

### 2. „Aus Dauerauftrag" auf der Rechnungs-Liste: jeder Monat wählbar

Aktuell bietet der Dialog nur die Auswahl „letzter / dieser / nächste 2 / nächste 3 Monate" — vergangene Perioden weiter zurück oder ein Monat vor einem Jahr sind nicht erreichbar.

**Neu im Dialog:**
- Statt fester Offset-Liste: zwei klare Selects **Monat (Januar … Dezember)** und **Jahr** (heutiges Jahr ±2, also 5 Jahre Spannweite — reicht für ein ganzes Geschäftsjahr rückwärts und etwas Puffer nach vorn).
- Aus dem gewählten Monat/Jahr leitet sich pro Dauerauftrag automatisch die passende Periode ab — also bei einem Quartals-DA z. B. „Q2 2026", bei einem Jahres-DA „2026", bei monatlichen DAs der Monat selbst (genau wie heute, nur eben für jeden beliebigen Monat).
- Pro Zeile bleibt sichtbar, **welche Periode** die Rechnung bekommt und ob für diese Periode bereits eine Rechnung erzeugt wurde (Warnhinweis bleibt).

### 3. Nach dem Erzeugen direkt zur Rechnung springen

Wenn du im Dialog **eine** Vorlage auswählst und auf „Erzeugen" klickst, wirst du sofort auf die Detailseite der eben erzeugten Rechnung weitergeleitet (`/rechnungen/{id}`). Bei Mehrfach-Auswahl bleibt das Verhalten wie heute (Toast mit Anzahl, zurück zur Liste) — alles andere wäre verwirrend, weil nicht klar ist, zu welcher Rechnung gesprungen werden sollte.

### 4. Aufgeräumt, ohne unnötige Erklär-Texte

- Hinweiszeile „Quartals-/Jahres-DA bekommen die passende Periode automatisch" bleibt knapp drin (gehört zur Bedienung), die längliche Fußzeile „Jeder Monat ist eine eigene Rechnung …" auf der Detailseite verschwindet.
- Edit-Button und Bearbeiten-Dialog werden zu einer geteilten Komponente (`DauerauftragEditDialog`), damit Detailseite und Listen-Dialog exakt dieselbe Maske öffnen — gleiche Beschriftung, gleiches Verhalten.

## Was bleibt unverändert

- Backend (`/dauerauftraege/:id/sofort-lauf`, `PATCH /dauerauftraege/:id`) unterstützt all das bereits — keine Schema-/Migrations-Änderungen, keine neuen Endpunkte, keine Auto-Mails.
- Logik in `periodeFuer` / `periodeBezeichnung` / `periodeBereich` bleibt 1:1. Wir bauen nur einen anderen UI-Aufsatz drumherum, der ein beliebiges `Date` reinreicht statt eines kleinen Offsets.
- Status-Lifecycle der erzeugten Rechnung, Belegnummern, Drive-Upload, Teilzahlungen — nichts daran wird angefasst.

## Technische Details

- **Neue Datei** `src/components/dauerauftrag/DauerauftragEditDialog.tsx` — der bereits vorhandene `DauerauftragEditDialog` wird aus `RechnungAusDauerauftragDialog.tsx` extrahiert, exportiert und in beiden Stellen importiert.
- **`DauerauftragVerwaltungCard.tsx`** — Buttons Pausieren/Sofort/Beenden raus, neuer „Bearbeiten"-Button, der den Dialog öffnet. Import von `usePausiereDauerauftrag`, `useBeendeDauerauftrag`, `useSofortLauf`, `useConfirm` entfällt.
- **`RechnungAusDauerauftragDialog.tsx`** — Offset-Select wird zu Monat-/Jahr-Select; `periodeMitOffset(frequenz, offset)` ersetzt durch `periodeFuerDatum(frequenz, date)` (lokale Helper, ruft die bestehenden `periodeFuer`/`periodeBezeichnung` mit `new Date(jahr, monat, 1)` auf). Nach `bulk.mutate(...)`: wenn `rechnungIds.length === 1`, mit `useNavigate({ to: "/rechnungen/$id", params: { id } })` springen.
- Keine neuen Dependencies. Keine Tests müssen geändert werden (bestehende Test-Suites prüfen Backend-Verhalten, das hier nicht angefasst wird).

## Risiko / Rollback

Reine Frontend-Änderung in 3 Dateien. Wenn etwas hakt, Komponenten auf vorherigen Stand setzen — keine Datenmigration, keine API-Verträge berührt.
