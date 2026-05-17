## Problem

Das Dashboard ist seit jeher leer/falsch, weil die Endpunkte `/dashboard/kennzahlen`, `/dashboard/umsatz` und `/dashboard/warnungen` im Backend **gar nicht existieren**. Frontend ruft sie auf, Backend antwortet mit 404 → KPI-Kacheln und Umsatz-Chart bleiben leer. Bezahlte Rechnungen tauchen deshalb nirgends auf.

Zusätzlich ist der Default-Charttyp aktuell „Balken" (`DEFAULT_STATE.typ = "bar"`), gewünscht ist die Flächen-Grafik als Start-Ansicht.

## Lösung

### 1. Backend: neue Dashboard-Routen (`backend/src/routes/dashboard.ts`)

`GET /dashboard/kennzahlen?jahr=&monat=`
- `aktiveKunden` = `COUNT` Kunden ohne `archiviert`
- `aktiveObjekte` = `COUNT` Objekte mit Status aktiv
- `offeneAngebote` = `COUNT` Angebote mit Status `versendet`
- `offeneRechnungen` = `COUNT` Rechnungen mit Status in (`versendet`,`teilbezahlt`,`ueberfaellig`), optional gefiltert auf `rechnungsdatum` im Zeitraum
- `ausstehendEUR` = Σ (`brutto − bezahlt`) der offenen Rechnungen

`GET /dashboard/umsatz?jahr=&monat=`
- Liefert `UmsatzPunkt[]` (`monat: "YYYY-MM"`, `netto`, `brutto`)
- **Definition**: alle Rechnungen mit Status ∈ (`versendet`,`teilbezahlt`,`bezahlt`,`ueberfaellig`) — gruppiert nach Monat des `rechnungsdatum`. Stornos zählen nicht. Bezahlt + Teilbezahlt fließen voll ein → sobald eine Rechnung als bezahlt markiert wird, erscheint sie sofort im Umsatz.
- Nutzt `rechnungBruttoCt`/`rechnungNettoCt` aus `backend/src/belege/totals.ts` (Netto = Brutto − MwSt., kleine Helferfunktion ergänzen).
- Ohne Parameter: letzte 12 Monate inkl. leerer Monate (0/0), damit das Chart sauber aufgefüllt ist.
- Mit `jahr=YYYY&monat=alle`: alle 12 Monate des Jahres. Mit konkretem Monat: ein einzelner Punkt.

`GET /dashboard/warnungen`
- MVP: leere Liste `[]` (bestehende Fronten zeigen daraus bereits Mahn-/Überfälligkeits-Signale aus anderen Quellen). Endpoint muss existieren, damit `useWarnungen` kein 404 wirft.

Registrierung in `backend/src/server.ts`:
- `app.register(dashboardRoutes)` einhängen
- `isBackendApi`: `url.startsWith("/dashboard")` ergänzen

Alle Routen mit `requireAuth` (Single-User-Standard).

### 2. Frontend: Standard-Chart auf „Fläche"

`src/components/dashboard/UmsatzChartCard.tsx`
- `DEFAULT_STATE.typ` von `"bar"` auf `"area"` setzen
- `STORAGE_KEY` bumpen (`dashboard.umsatzChart.v2`), damit alte gespeicherte „bar"-Auswahl nicht weiter greift und User auf der Fläche starten

Keine weiteren UI-Änderungen — Toggle bleibt, User kann manuell auf Balken wechseln.

### 3. Tests

- `backend/test/dashboard.spec.ts` (neu): legt Kunde + Rechnung + Zahlung an, prüft dass
  - Umsatz die Rechnung im richtigen Monat enthält
  - `offeneRechnungen` nach Voll-Zahlung um 1 sinkt
  - Storno aus Umsatz verschwindet

## Technische Details

```text
GET /dashboard/umsatz?jahr=2026&monat=alle
→ [
    { monat: "2026-01", netto: 1260.50, brutto: 1500.00 },
    { monat: "2026-02", netto: 0,       brutto: 0       },
    ...
  ]
```

SQL (vereinfacht):
```sql
SELECT substr(rechnungsdatum,1,7) AS m, id
  FROM rechnung
 WHERE status IN ('versendet','teilbezahlt','bezahlt','ueberfaellig')
   AND (:jahr IS NULL OR substr(rechnungsdatum,1,4) = :jahr)
   AND (:monat IS NULL OR substr(rechnungsdatum,6,2) = :monat)
```
Brutto/Netto je Rechnung per `rechnungBruttoCt(db, id)` aufsummiert (autoritative Serverberechnung, identisch zur Status-Logik).

## Out of Scope

- Definition „Umsatz nach Zahlungsdatum" (Ist-Versteuerung) — bleibt Soll-Versteuerung wie oben. Bei Bedarf später als Toggle.
- Echte Warnungs-Engine — vorerst leerer Endpoint.
