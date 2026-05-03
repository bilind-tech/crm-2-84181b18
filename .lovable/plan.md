# „Versendet"-Schritt nicht mehr automatisch ableiten, sondern nur bei echtem Versand zeigen

## Ursache

In `src/lib/flow/flows.ts` wird der Schritt **„Versendet"** rein aus dem Status abgeleitet:

```ts
// Angebot (Z. 30):
const versendet = status !== "entwurf";
// Rechnung (Z. 112):
const istVersendet = status !== "entwurf";
```

Wenn eine Rechnung im Entwurf direkt als bezahlt markiert wird, springt sie auf Status `"bezahlt"` (Backend `rechnungStatusAuto`, `src/lib/mock/backend.ts` Z. 338) — und damit erscheint der Schritt „Versendet" automatisch grün, obwohl nie eine Mail rausging. Analog beim Angebot, wenn es direkt auf „angenommen" gesetzt wird.

Das `versendetAm`-Feld wird **ausschließlich** im echten Versand-Pfad gesetzt (`backend.ts` Z. 743 + 896). Es ist also der zuverlässige Indikator, ob wirklich versendet wurde.

## Fix (1 Datei)

`src/lib/flow/flows.ts` umstellen auf:

- **Angebot**: `const versendet = !!a.versendetAm;`
- **Rechnung**: `const istVersendet = !!r.versendetAm;`

Damit:
- bleibt der Schritt „Versendet" grau, solange nicht real versendet wurde — auch wenn die Rechnung schon bezahlt/Angebot schon angenommen ist;
- der Schritt „Bezahlt" / „Angenommen" wird trotzdem korrekt grün, weil er an `status` / `zahlungen` hängt;
- echtes Senden setzt `versendetAm` → Schritt springt sofort auf grün.

Alle anderen Stellen (`status === "versendet"` Vergleiche für „current") bleiben — sie beschreiben den Zwischenzustand „versendet, aber noch keine Antwort".

## Risiko

Minimal. Backend-Verhalten unverändert. Nur die FlowBar-Anzeige wird ehrlicher.
