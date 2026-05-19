## Ziel

Alle Jahres-Auswahlen sollen sich **automatisch mit dem Kalender mitbewegen** — kein hartcodiertes Startjahr, keine sinnlose Zukunft, keine leere Vergangenheit.

Regel überall gleich:
- **Default-Anzeige:** aktuelles Jahr.
- **Auswählbare Jahre:** alle Jahre, in denen tatsächlich Daten existieren (Rechnungen/Läufe/Posten/Dokumente) — plus aktuelles Jahr — plus die nächsten N zukünftigen Jahre nur dort, wo Zukunft sinnvoll ist (Dauerauftrag-Erzeugung).
- **Keine Phantasie-Vergangenheit:** 2024/2025 erscheinen nur, wenn auch 2024er/2025er Daten vorhanden sind.

---

## Konkrete Änderungen

### 1. Dauerauftrag „Aus Dauerauftrag" Dialog
`src/components/dauerauftrag/RechnungAusDauerauftragDialog.tsx` (Zeile 67–73)

Aktuell: fest `[heute-2 … heute+2]` → zeigt 2024 obwohl es keine Daten gibt.

Neu — dynamische Jahresliste aus drei Quellen, dedupliziert + sortiert:
- aktuelles Jahr (immer)
- aktuelles Jahr + 1 und + 2 (Zukunft für Voraus-Erstellung)
- jedes Jahr, in dem bereits ein Dauerauftrag-Lauf existiert (`alleLaeufe[].periode`) → erlaubt Rückblick auf real erzeugte Monate, ohne leere 2024er anzubieten

### 2. Steuern-Seite
`src/routes/steuern.tsx` (Zeile 73–82)

`STEUER_STARTJAHR = 2026` entfernen. Stattdessen:
- erstes vorhandenes Jahr aus `rechnungen[].rechnungsdatum`, `dokumente[].dokumentdatum`, `manuellePosten[].zeitraum.jahr`
- bis `max(aktuellesJahr, frühestesJahr)`
- Default-Auswahl bleibt `aktuellesJahr` → bei Jahreswechsel automatisch 2027 etc.

### 3. Gemeinsamer Helper
Neu: `src/lib/zeitraum/jahre.ts`

```text
verfuegbareJahre(daten: Iterable<string|number|undefined>, opts?: {
  zukunftJahre?: number,   // wie viele zukünftige Jahre zusätzlich (Default 0)
  inklAktuelles?: boolean, // Default true
}): number[]
```

Sortiert absteigend, dedupliziert. Wird genutzt von Steuern und Dauerauftrag-Dialog. (Bestehender `jahreAusDaten` in `ZeitraumFilter.tsx` bleibt, erfüllt das Muster bereits korrekt für Rechnungen/Angebote/Kunden-Filter — keine Änderung nötig, weil er schon „aktuelles Jahr + tatsächliche Datenjahre" liefert.)

### 4. Verifikation (kein Code-Change, nur Sichtprüfung)
Diese Stellen nutzen `jahreAusDaten` bereits korrekt und bleiben unverändert:
- `src/routes/angebote.tsx` (zweimal)
- `src/components/filters/ZeitraumSelect.tsx` (Rechnungen, Kunden, …)
- `UmsatzChartCard` zeigt nur aktuelles + letztes Jahr → bleibt.

---

## Nicht im Scope
- Backend-Änderungen.
- Belegnummern-Format (`RE-{YYYY}-…` ist bereits dynamisch via `getFullYear()`).
- Datentyp-Migrationen.

## Akzeptanzkriterien
- Im DA-Dialog erscheint heute (2026) kein 2024. Nach Erzeugung eines Laufs für 2025 erscheint 2025 in der Liste.
- Auf der Steuern-Seite ist 2026 vorausgewählt; am 01.01.2027 wechselt der Default automatisch auf 2027, 2026 bleibt wählbar.
- Keine fest verdrahtete Jahreszahl mehr außerhalb von Beispieltexten/Placeholders.