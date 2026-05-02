## Ziel

Drei zusammenhängende Verbesserungen:

1. **Angebot annehmen/ablehnen klarer machen** — sowohl in der Übersicht (Liste) als auch auf der Detailseite mit deutlich beschrifteten Buttons statt nur Daumen-Icons.
2. **Rechnung „bezahlt markieren" verständlicher machen** — der grüne Haken in der Liste wird ersetzt durch einen beschrifteten Button.
3. **Überfällige Rechnungen → automatisches Pop-up** oben rechts beim App-Start, sobald das Fälligkeitsdatum (Standard 14 Tage) überschritten ist und keine Zahlung erfasst wurde. Schließbar, aber bei jedem Neuladen wieder sichtbar (bis Zahlung erfasst ist).

## 1) Angebot „Angenommen / Abgelehnt" — verständlicher

### Übersicht (`src/routes/angebote.tsx`)
Der bisherige `AngebotAnnahmeButtons` (zwei Icon-Buttons Daumen-hoch/runter) ist zu kryptisch.

**Mobile Card-View:**
- Zwei volle Buttons mit Text + Icon nebeneinander in der Action-Row, nur sichtbar wenn `status === "versendet"`:
  - Grüner Button: „Angenommen" + `ThumbsUp`
  - Outline-Button: „Abgelehnt" + `ThumbsDown`
- Wenn bereits angenommen/abgelehnt: Statt Buttons ein deutlicher Status-Text in der Card-Meta (z. B. „✓ Angenommen am 15.04." in Grün oder „✗ Abgelehnt am 15.04." in Grau).

**Desktop-Tabelle:**
- In der Aktionen-Spalte: bei `status === "versendet"` zwei kleine Buttons mit Text („✓ Annehmen" / „✗ Ablehnen") statt Icon-only.
- Status-Badge bleibt zusätzlich erhalten — die FlowBar zeigt den Verlauf, der Badge den aktuellen Stand.

### Detailseite (`src/routes/angebote.$id.tsx`)
Bereits vorhanden (Buttons „Angenommen" / „Abgelehnt" in der Action-Leiste bei Status `versendet`) — funktioniert gut. Wir prüfen nur, dass die Buttons:
- prominent als grüner Primary („Angebot annehmen") + Outline („Ablehnen") sichtbar sind
- nach Klick eine klare Toast-Bestätigung zeigen (vorhanden)
- die FlowBar sich sofort aktualisiert (vorhanden)

Keine zusätzlichen Änderungen auf der Detailseite nötig.

## 2) Rechnung „Als bezahlt markieren" — verständlicher

### Übersicht (`src/routes/rechnungen.tsx`)
Der grüne `CheckCircle2`-Icon-Button ohne Beschriftung ist nicht selbsterklärend.

**Mobile Card-View (390 px):**
- Button mit Icon + Text: „Bezahlt" oder besser „Zahlung erfassen" (passt zum bestehenden `ZahlungErfassenDialog`).
- Variante: grüner Button mit kompakter Beschriftung, nur sichtbar wenn `status !== "bezahlt" && status !== "storniert"`.

**Desktop-Tabelle:**
- Button mit Icon + Text-Label „Zahlung" (kompakt, passt in die Aktionen-Spalte).
- Tooltip „Zahlung erfassen — markiert Rechnung als bezahlt".

Beide Buttons öffnen wie bisher den `ZahlungErfassenDialog` mit Schnell-Buttons (Voll / Hälfte / Viertel).

## 3) Überfällige Rechnungen — Pop-up oben rechts

### Verhalten
- Beim App-Start (Mount der Root-Layout) prüft ein Hook, ob es überfällige Rechnungen gibt:
  - `faelligkeitsdatum < heute` AND `status !== "bezahlt"` AND `status !== "storniert"`
- Wenn ja: Ein **Toast-artiges Pop-up oben rechts** wird automatisch eingeblendet — nicht der Bell-Icon-Popover, sondern ein eigenes, deutlich sichtbares Banner.
- Pop-up zeigt:
  - Titel: „X überfällige Rechnung(en)"
  - Liste der ersten 3 überfälligen Rechnungen mit Kundenname, Nummer, Tagen Überfälligkeit, offenem Betrag
  - Button „Alle ansehen" → navigiert zu `/rechnungen?filter=ueberfaellig`
  - Bei nur einer Rechnung: direkter „Zur Rechnung"-Link
  - X-Button zum Schließen
- **Verhalten:** Das Pop-up wird bei jedem Seitenaufruf/Reload erneut gezeigt (kein localStorage-„dismissed"), solange es überfällige Rechnungen gibt. Schließen blendet es nur für die aktuelle Session aus (React-State, kein Persist).
- Sobald für eine Rechnung eine Zahlung erfasst wird und sie damit nicht mehr überfällig ist, verschwindet sie aus der Berechnung.

### Standard-Fälligkeit 14 Tage
- Im Datenmodell existiert bereits `Kunde.zahlungszielTage: number = 14`.
- Beim Erstellen einer Rechnung wird `faelligkeitsdatum = rechnungsdatum + zahlungszielTage` automatisch gesetzt (in `RechnungForm` prüfen — falls nicht der Fall, ergänzen).
- Default bleibt 14 Tage; user kann pro Kunde überschreiben (bereits möglich).

### Komponenten

**Neu: `src/components/notifications/UeberfaelligPopup.tsx`**
- Eigenständige Karte, fixed positioniert oben rechts (`fixed top-20 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]`).
- Mobile: voll responsive, etwas kleinere Breite.
- Slide-in-Animation, manuell schließbar via X.
- Schließen setzt nur `isOpen=false` im lokalen State — kein Persist.
- Verwendet bestehende Card-Styles, kein Gradient (laut Memory-Regel).

**Neu: `src/hooks/useUeberfaelligeRechnungen.ts`**
- Liefert `{ count, gesamtOffen, rechnungen: [{ id, nummer, kundeName, tageUeber, offen }] }` aus `useRechnungen()`.
- Memoized, automatisch reaktiv via React Query Cache.

**Edit: `src/routes/__root.tsx`**
- Das `UeberfaelligPopup` wird einmal global gerendert (innerhalb der Auth-geschützten Layout-Sektion), damit es auf jeder Seite verfügbar ist und beim ersten Mount erscheint.

### Beziehung zum Bell-Icon
- Der bestehende Benachrichtigungs-Popover (Bell + roter Zähler-Badge) bleibt unverändert und zeigt weiterhin alle Benachrichtigungen.
- Das neue Pop-up ist **zusätzlich** und gezielt nur für überfällige Rechnungen — ohne dass der Nutzer den Bell-Button öffnen muss.

## Technische Details

### Dateien

| Datei | Änderung |
|---|---|
| `src/routes/angebote.tsx` | `AngebotAnnahmeButtons` umbauen: Text + Icon, Mobil + Desktop |
| `src/routes/rechnungen.tsx` | Zahlung-Button mit Text-Label statt nur Icon |
| `src/components/notifications/UeberfaelligPopup.tsx` | **neu** — fixed Pop-up oben rechts |
| `src/hooks/useUeberfaelligeRechnungen.ts` | **neu** — Berechnung |
| `src/routes/__root.tsx` | `<UeberfaelligPopup />` global einbinden |
| `src/components/forms/RechnungForm.tsx` | sicherstellen, dass `faelligkeitsdatum = heute + zahlungszielTage` (Default 14) |

### Datenfluss Pop-up
```text
useRechnungen() (React Query Cache)
   │
   └─▶ useUeberfaelligeRechnungen()  ── filtert + reichert mit Kundenname an
           │
           └─▶ UeberfaelligPopup       ── rendert nur wenn count > 0 && !manuelGeschlossen
```

### Routing
- „Alle ansehen" navigiert zu `/rechnungen` mit gesetztem Filter `ueberfaellig` (über lokalen State oder URL-Query-Param — Filter ist bereits in der Liste vorhanden).

## Akzeptanzkriterien

- In der Angebots-Liste: bei einem versendeten Angebot sind zwei klar beschriftete Buttons „Annehmen" und „Ablehnen" sichtbar (Mobil + Desktop).
- In der Rechnungs-Liste: Bezahlt-Button hat ein Text-Label und ist auf den ersten Blick als „Zahlung erfassen" erkennbar.
- Beim Öffnen der App erscheint automatisch oben rechts ein Pop-up, wenn überfällige Rechnungen existieren — auch nach Schließen erscheint es beim nächsten Reload wieder.
- Standard-Zahlungsziel ist 14 Tage; Pop-up erscheint erst nach Ablauf.
- Bell-Icon-Popover bleibt funktional und wird nicht doppelt eingeblendet.
- Keine Sparkles, keine Gradient-Hintergründe (Memory-Regel respektiert).
