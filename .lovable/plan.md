## Ziel

Wenn du im Zahlung-Dialog auf „Ja, voll bezahlt" oder „Speichern" klickst, sollen sich **sofort und ohne Reload** aktualisieren:

1. KPI-Kacheln oben auf `/rechnungen` (Eingang diesen Monat, Offene Posten, Überfällig, Gesamt)
2. Die Tabellen-/Card-Zeile der bezahlten Rechnung (Status-Badge, Spalte „Offen", Bezahlt-Badge statt „Zahlung bestätigen")
3. Dashboard-Kacheln auf `/` (Umsatz, offene Posten, überfällige Beträge, Umsatz-Chart, Nächste Schritte)

Außerdem ein kurzes Audit für alle anderen Rechnungs-Aktionen, damit nirgendwo eine veraltete Ansicht zurückbleibt.

## Was bereits funktioniert (geprüft)

- `useAddZahlung` invalidiert `["rechnungen"]`, `qk.rechnung(id)`, `qk.dashboard.kennzahlen`, `qk.aktivitaeten`.
- KPI-Kacheln auf `/rechnungen` rechnen direkt aus `useRechnungen()` → reagiert automatisch.
- Status (`bezahlt` / `teilbezahlt`) wird im Mock-Backend per `rechnungStatusAuto(r)` aus Summe der Zahlungen abgeleitet.

## Tatsächliche Lücken, die der Fix schließt

### A) Dashboard-Umsatzchart aktualisiert nicht
`useAddZahlung` invalidiert nur `qk.dashboard.kennzahlen`, **nicht** `qk.dashboard.umsatz` und `qk.dashboard.warnungen`. Folge: Kacheln auf der Startseite springen, aber das Umsatz-Diagramm und die Warnungen bleiben stehen, bis man die Seite neu lädt.

### B) `useDeleteZahlung` invalidiert das Dashboard gar nicht
Wer eine fehlerhafte Zahlung wieder löscht, sieht KPIs und Dashboard nicht aktualisiert.

### C) Weitere Rechnungs-Mutationen ohne komplette Invalidierung
- `useUpdateRechnung` → invalidiert `qk.dashboard.kennzahlen` nicht (Brutto/Netto-Änderung wirkt sich auf KPIs aus).
- `useSendRechnung` → invalidiert `qk.dashboard.kennzahlen` und `qk.aktivitaeten` nicht (Status-Wechsel auf „versendet" verändert Offene Posten).
- `useDeleteRechnung` → kein Invalidate für Dashboard.

### D) „Nächste Schritte"-Card auf Startseite
Liest aus `useRechnungen()` / `useAngebote()` → reagiert bereits korrekt, sobald `["rechnungen"]` invalidiert wird. Kein Code-Fix nötig, nur als Verifizierung.

## Änderungen

**1) `src/hooks/useApi.ts` — Invalidierungs-Set vereinheitlichen**

Helper einführen, damit alle rechnungs-relevanten Mutationen denselben Invalidate-Sweep machen:

```ts
function invalidateRechnungScope(qc: QueryClient, rechnungId?: string) {
  qc.invalidateQueries({ queryKey: ["rechnungen"] });
  if (rechnungId) qc.invalidateQueries({ queryKey: qk.rechnung(rechnungId) });
  qc.invalidateQueries({ queryKey: qk.dashboard.kennzahlen });
  qc.invalidateQueries({ queryKey: qk.dashboard.umsatz });
  qc.invalidateQueries({ queryKey: qk.dashboard.warnungen });
  qc.invalidateQueries({ queryKey: qk.aktivitaeten });
  qc.invalidateQueries({ queryKey: qk.benachrichtigungen });
}
```

Verwenden in: `useAddZahlung`, `useDeleteZahlung`, `useUpdateRechnung`, `useSendRechnung`, `useDeleteRechnung`, `useCreateRechnung`.

**2) Mobile Card auf `/rechnungen` (Zeile ~165–175)**

`r.status === "bezahlt"` zeigt schon den grünen „Bezahlt"-Badge. Zusätzlich `r.status === "teilbezahlt"` Fall ergänzen: dezenter warnung-farbener Badge „Teilbezahlt" + weiterhin Button „Restzahlung bestätigen", damit der Live-Übergang sichtbar ist.

**3) Desktop-Tabelle (Zeile ~277–293)**

Analog: Bei `teilbezahlt` zusätzlichen Mini-Hinweis „Teilbezahlt" rechts vom Button und Button-Text auf „Restzahlung bestätigen" setzen, sonst wirkt es so, als sei nichts passiert.

## Abnahmekriterien

- Auf `/rechnungen` Zahlung „voll bezahlt" klicken → ohne Reload: Status-Badge wird grün „Bezahlt", Spalte „Offen" zeigt grünes „bezahlt", Aktions-Button verschwindet, KPI-Kachel „Eingang diesen Monat" steigt, „Offene Posten" sinkt.
- Teilzahlung erfassen → Status-Badge wechselt auf „Teilbez.", Spalte „Offen" zeigt Restbetrag, Button-Text wird zu „Restzahlung bestätigen".
- Auf `/` (Dashboard) sind nach dem Buchen alle Kacheln, der Umsatz-Chart und die „Nächste Schritte"-Liste live aktualisiert.
- Zahlung wieder löschen → Kacheln und Dashboard kehren live zurück.
