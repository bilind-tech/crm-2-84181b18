## Problem

Beim Erstellen einer Rechnung oder eines Angebots zeigt die Belegnummer-Vorschau (nach Auswahl des Kunden) immer `…/01`, auch wenn der Kunde im aktuellen Monat schon mehrere Belege hat oder der Start-Zähler in den Stammdaten z. B. auf `12` gesetzt wurde. Die tatsächlich gespeicherte Nummer ist korrekt — nur die Vorschau lügt und das ist verwirrend.

## Ursache

`src/lib/belegNummer.ts` → `vorschauBelegnummer()` hängt hart `"/01"` an, statt den nächsten freien Zähler aus dem Backend zu lesen.

Im Backend existiert bereits der passende Endpoint:
- `GET /kunden/:id/zaehler` → `{ periode, naechsterStart }`
- React-Hook: `useKundenZaehler(id)` (in `src/hooks/useApi.ts`)

Dieser Hook wird heute nur im Kunden-Bearbeiten-Dialog verwendet, nicht in den Erstell-Formularen.

## Lösung

Vorschau in den Forms gegen den echten nächsten Zähler des gewählten Kunden austauschen.

### `src/lib/belegNummer.ts`
Zweiten Parameter ergänzen, der den nächsten Zähler erhält (Fallback `1`, wenn noch nicht geladen):

```
vorschauBelegnummer(kuerzel, fallbackPraefix, naechsterZaehler = 1, basisDatum = new Date())
```
- Mit Kürzel: `${KUERZEL}${MM}${YY}/${String(naechsterZaehler).padStart(2,"0")}`
- Ohne Kürzel: bestehender Fallback, aber `{####}` / `{###}` mit `naechsterZaehler` statt `1`.

### `src/components/forms/RechnungForm.tsx` und `AngebotForm.tsx`
- `useKundenZaehler(kundeId)` aufrufen (greift dank `enabled: !!id` nur wenn Kunde gewählt).
- `vorschauNummer` neu berechnen mit `zaehlerQ.data?.naechsterStart ?? 1`.
- Während `zaehlerQ.isLoading`: dezenter Hinweis „wird ermittelt …" statt einer falschen Nummer.

### Frische Daten beim Öffnen
Damit nach dem Anlegen einer Rechnung sofort `…/02` als nächste Vorschau erscheint, in den `onSuccess`-Handlern von `useCreateRechnung` und `useCreateAngebot` die Query `["kunden", kundeId, "zaehler"]` invalidieren.

## Was sich nicht ändert
- Vergabe der echten Belegnummer im Backend bleibt unverändert (`nextCustomerNumber` in `src/lib/mock/backend.ts`).
- Format `{KÜRZEL}{MM}{YY}/{NN}` bleibt identisch.
- Start-Zähler-Logik in den Kundenstammdaten bleibt unverändert — sie wird durch die korrekte Vorschau jetzt sichtbar.

## Ergebnis
Nach Auswahl des Kunden im Erstell-Dialog steht die Belegnummer, die der Beleg auch wirklich bekommen würde — z. B. `GFU0526/13`, wenn im Mai 2026 schon 12 Belege für diesen Kunden existieren.