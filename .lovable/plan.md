## Ziel

1. Den Lebenszyklus-Balken (FlowBar) in den Listenansichten von Angeboten und Rechnungen anzeigen — mobil und Desktop.
2. Bei Rechnungen den Schritt „Teilbezahlt" aus dem Flow entfernen, sodass nur noch Entwurf → Versendet → Bezahlt sichtbar ist.

## Was passiert visuell

**Desktop-Tabellen** (Angebote + Rechnungen)
- Neue Spalte „Fortschritt" zwischen Status-Badge und Aktionen.
- Verwendet `FlowBar size="sm"` — kompakte Punkte-mit-Linien-Darstellung, passt sauber in die Tabellenzeile.

**Mobile Card-View** (390px Viewport)
- Unterhalb der Meta-Zeile (Nummer, Datum) und über/neben dem Trailing-Betrag eine eigene Zeile mit `FlowBar size="sm"`.
- Volle Breite, Dots klar erkennbar, kein horizontaler Overflow.
- Bei sehr engen Karten optional `size="mini"` — wir nehmen `sm` für bessere Lesbarkeit.

**Detailseiten bleiben unverändert** (große FlowBar wie bisher).

## Änderungen

### `src/lib/flow/flows.ts` — `rechnungFlow`
- Schritt 3 „Teilbezahlt" komplett entfernen. Neue Reihenfolge: `Entwurf → Versendet → Bezahlt` (3 Schritte statt 4).
- Teilbezahlt-Info bleibt als `hint` am Schritt „Bezahlt" erhalten (z. B. „120 € von 300 € · noch 180 € offen"), damit die Information in der Detail-Ansicht nicht verloren geht.
- `current` für „Bezahlt" wird `true`, wenn teilweise oder vollständig bezahlt wurde; `tone` ist `active` bei Teilzahlung, `success` bei Vollzahlung.
- Storniert: weiterhin als gemuteter Endzustand am letzten Schritt.

### `src/routes/angebote.tsx`
- Import: `FlowBar` aus `@/components/flow/FlowBar` und `angebotFlow` aus `@/lib/flow/flows`.
- Bei Bedarf `useRechnungen` einmalig laden, um `hatRechnung` pro Angebot zu bestimmen (Lookup-Set über `quellAngebotId`).
- **Mobile Card**: Neue Zeile in `MobileListCard` (über `meta` oder als zusätzliches `subContent`-Element) mit `<FlowBar steps={angebotFlow(a, hatRechnung).steps} size="sm" />`. Falls `MobileListCard` keinen passenden Slot hat, schauen wir kurz in die Component und ergänzen einen `footer`-Slot oder rendern die Bar als Teil von `meta`.
- **Desktop-Tabelle**: Neue `<th>Fortschritt</th>` und `<td>` mit `FlowBar size="sm"`. `colSpan` der Leerzeile von 7 → 8.

### `src/routes/rechnungen.tsx`
- Import: `FlowBar` und `rechnungFlow`.
- **Mobile Card**: analog zu Angeboten, neue Zeile mit `<FlowBar steps={rechnungFlow(r).steps} size="sm" />`.
- **Desktop-Tabelle**: Neue Spalte „Fortschritt" mit `FlowBar size="sm"`. `colSpan` von 8 → 9.
- Status-Filter „Teilbez." in den Tabs bleibt funktional (Daten-Status existiert weiter, nur die FlowBar-Visualisierung wird vereinfacht).

### `src/components/ui/mobile-list-card.tsx`
- Falls noch nicht vorhanden: optionalen `footer`-Slot ergänzen, der unter Title/Meta und über Actions gerendert wird. Damit bleibt die FlowBar sauber abgesetzt und überlappt nicht mit `trailing`.

## Technische Details

- `FlowBar size="sm"` ist bereits im Design vorhanden (Punkte 2.5 × 2.5, Linien 5 × 0.5) — kein neues CSS nötig.
- Auf 390px-Mobile passt 3-Schritt-Bar (Rechnung) und 4-Schritt-Bar (Angebot) bequem auf eine Zeile.
- Tooltip via `title`-Attribut (nativer Browser-Tooltip) bleibt für Hover-Info auf Desktop.
- Rechnung-Flow vorher: `[entwurf, versendet, teilbezahlt, bezahlt]`. Nachher: `[entwurf, versendet, bezahlt]`.

## Akzeptanzkriterien

- In `/angebote` und `/rechnungen` ist der Fortschrittsbalken sichtbar — sowohl in der mobilen Karte als auch in der Desktop-Tabellenzeile.
- Auf 390px Viewport gibt es keinen horizontalen Scroll und keine Überlappung mit Aktions-Icons.
- Rechnungs-FlowBar zeigt nur noch 3 Schritte: Entwurf, Versendet, Bezahlt. Teilzahlungs-Info erscheint als Hint am Schritt „Bezahlt" (in Detailansicht sichtbar, bei `size="sm"` als Tooltip).
- Detailseiten von Angebot und Rechnung funktionieren weiterhin korrekt.
