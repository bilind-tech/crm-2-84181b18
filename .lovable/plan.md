## Problem

Beim Öffnen des `EmailVersandDialog` (auf Angebot- / Rechnung-Detail) wird das Feld „An" derzeit nur mit `kunde.email` vorbelegt — also der allgemeinen Kunden-Mail. Wenn auf dem Beleg ein **Ansprechpartner** ausgewählt ist (`angebot.ansprechpartnerId` / `rechnung.ansprechpartnerId`), wird dessen E-Mail ignoriert. Der User muss die Adresse jedes Mal manuell eintippen.

## Fix

Eine Datei: `src/components/email/EmailVersandDialog.tsx`.

### 1. Ansprechpartner laden

Zusätzlich zu den bestehenden Hooks `useKunde(kunde.id)` ziehen — der Endpoint liefert ohnehin `ansprechpartner: Ansprechpartner[]` mit. Hook bedingt aktivieren (`enabled: !!kunde?.id`).

### 2. Empfänger-Resolver

Neue lokale Funktion `resolveEmpfaenger()`:

1. Wenn `angebot?.ansprechpartnerId` oder `rechnung?.ansprechpartnerId` gesetzt → in der geladenen Ansprechpartner-Liste suchen, dessen `.email` (falls vorhanden) verwenden.
2. Sonst: `primaer === true && email`-Ansprechpartner verwenden, falls vorhanden.
3. Sonst: Fallback auf `kunde?.email` (heutiges Verhalten).
4. Sonst: leerer String.

### 3. Vorbelegen-Effekt aktualisieren

Im bestehenden `useEffect`, der bei `open` triggert, Zeile 152 ersetzen:
```ts
setAn(resolveEmpfaenger());
```
Dependencies um die geladenen Ansprechpartner und `angebot?.ansprechpartnerId` / `rechnung?.ansprechpartnerId` erweitern.

### 4. Kein Eingriff für „allgemein"-Kontext

Wenn weder `angebot` noch `rechnung` gesetzt ist (z. B. allgemeiner Mail-Dialog), bleibt das Verhalten unverändert (`kunde.email`).

## Out of scope

- CC/BCC-Vorbelegung (User will nur „An" automatisch).
- Mehrere Ansprechpartner gleichzeitig anschreiben.
- Backend-Änderungen — Ansprechpartner-Daten kommen schon mit `useKunde`.
- Aufrufer-Komponenten (`angebote.$id.tsx`, `rechnungen.$id.tsx`, `MahnSektion`, `NaechsteSchritteCard`) — keine Anpassung nötig.

## Verifikation

- Auf Rechnung mit Ansprechpartner → Dialog öffnen → „An" enthält Ansprechpartner-E-Mail.
- Ansprechpartner ohne E-Mail → Fallback auf Kunden-E-Mail.
- Beleg ohne Ansprechpartner → Kunden-E-Mail wie bisher.
- User kann den vorgefüllten Wert weiterhin überschreiben.
