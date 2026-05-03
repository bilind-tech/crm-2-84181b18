# Fix: Button bleibt nach Zahlungsbestätigung als „Zahlung bestätigen" stehen

## Ursache (gefunden)

Sowohl im Mock-Backend (`rechnungStatusAuto`) als auch im optimistischen UI-Update (`berechneRechnungStatus` in `useApi.ts`) gibt es ganz oben diesen Frühausstieg:

```ts
if (r.status === "storniert" || r.status === "entwurf") return r.status;
```

Wenn die Rechnung also noch im Status `entwurf` ist und du auf „Zahlung bestätigen" klickst, wird die Zahlung zwar gespeichert (Toast: „1.190,00 € als bezahlt eingetragen"), aber der Status bleibt `entwurf` — und damit liefert `istVollBezahlt(r)` `false`, der Button bleibt als blauer „Zahlung bestätigen"-Button stehen.

## Fix (3 kleine Änderungen, gleicher Ort)

In allen drei Funktionen wird die Prüfung „vollständig bezahlt" **vor** den Entwurf-Frühausstieg gezogen — Storniert bleibt unverändert geschützt.

**1. `src/lib/mock/backend.ts` (Zeile 334–342)** — Persistenter Status:
```ts
function rechnungStatusAuto(r: Rechnung): RechnungStatus {
  if (r.status === "storniert") return r.status;
  const { brutto } = summenRechnung(r.positionen, r.rabattGesamt);
  const bezahlt = r.zahlungen.reduce((s, z) => s + z.betrag, 0);
  if (bezahlt >= brutto - 0.005 && bezahlt > 0) return "bezahlt";
  if (r.status === "entwurf") return r.status;
  if (bezahlt > 0) return "teilbezahlt";
  if (new Date(r.faelligkeitsdatum) < new Date()) return "ueberfaellig";
  return r.status;
}
```

**2. `src/hooks/useApi.ts` (Zeile 405–420)** — Optimistisches Update (gleiche Logik, damit UI sofort umspringt, ohne auf Server-Roundtrip zu warten).

**3. `src/routes/rechnungen.tsx` (Zeile 79–84)** — `istVollBezahlt(r)` darf nicht mehr `entwurf` blockieren:
```ts
function istVollBezahlt(r: Rechnung) {
  if (r.status === "bezahlt") return true;
  if (r.status === "storniert") return false;
  const offen = brutto(r) - bezahlt(r);
  return offen <= 0.005 && bezahlt(r) > 0;
}
```

## Effekt

- Klick auf „Zahlung bestätigen" → „Ja, voll bezahlt" → Dialog schließt → der Button wird **sofort** durch das grüne, nicht-klickbare „Bezahlt"-Badge ersetzt (in Liste, Mobil-Karte und Detailseite).
- Status `bezahlt` wird korrekt im Backend gespeichert (im echten Pi-Backend muss diese Logik beim Implementieren ebenfalls so umgesetzt werden — bisher nur Mock).
- Funktioniert auch bei Teilzahlung: Bei „Nein, nur ein Teil" mit < Bruttobetrag bleibt Status `entwurf` (richtig, da Entwurf noch nicht versendet ist) — Button bleibt klickbar für Restzahlung.

## Risiko

Minimal: Drei punktuelle Änderungen, keine Schemaänderung, kein Email-Versand betroffen, Storniert weiterhin geschützt.
