## Steuer-Modul fertigstellen

Das Modul ist bereits zu ~85 % gebaut (Auto-Posten USt/KSt/Soli/GewSt, Bezahlt-Overlay, Detail-Dialog, Backend-Tabellen + Cron für manuelle Fristen, Settings-Tab). Es fehlen die letzten Bausteine, damit es im Alltag rund läuft.

## Was gebaut wird

### A) Manuelle Steuer-Termine sichtbar & verwaltbar
Aktuell existiert `ManuellerPostenDialog` + Backend-CRUD, ist aber auf `/steuern` nicht eingebunden.

- Zweiter Header-Button neben „Zahlung erfassen": **„Manueller Termin"** (öffnet `ManuellerPostenDialog`).
- Eigener Bereich „Weitere Steuer-Termine" auf `/steuern` listet alle manuellen Posten (Grundsteuer, Kfz, IHK, BG, Rundfunk, KESt, …) sortiert nach Fälligkeit, mit FlowBar-Status.
- Klick auf einen manuellen Posten → bestehender Detail-Dialog, dort neu: **Bearbeiten** + **Löschen** (mit Confirm).
- `allePosten`-Memo merged jetzt Auto-Posten + manuelle Posten + Bezahlt-Overlay (auch für Manuelle).

### B) „Als bezahlt markieren" direkt im Detail-Dialog
Memory-Regel: zweistufiger Mini-Dialog wie bei Rechnungen.

- Neuer Primary-Button im `SteuerDetailDialog` (für offene Posten): „Als bezahlt markieren".
- Stufe 1: „Wurde der vorgeschlagene Betrag (X €) so überwiesen?" → Ja / Anderer Betrag / Abbrechen.
- „Ja" → speichert direkt mit `bezahltAm = heute`, `tatsaechlicherBetrag = geschaetzterBetrag`.
- „Anderer Betrag" → Stufe 2 mit nur einem Betragsfeld, Datum/Notiz automatisch.
- Bestehender Top-Header-Button „Zahlung erfassen" bleibt (für freie Erfassung ohne Posten-Bezug).

### C) Jahres-Wechsler
- Kleines Pill-Tab oben rechts neben dem Header: `[2024] [2025] **2026**`.
- Wechselt das `jahr` des `useMemo`-Blocks. Vorjahre laufen rein read-only; Auto-Posten werden für das ausgewählte Jahr berechnet, Bezahlt-Markierungen filterbar.
- Vorhandene Daten reichen — kein Backend-Change nötig.

### D) Backend-Frist-Cron auch für Auto-Posten
Heute warnt `runSteuerFristCheck` nur vor manuellen Posten. USt-Voranmeldungen und KSt/GewSt-Quartalstermine bekommen keine Push-Erinnerung.

- In `backend/src/steuern/fristen.ts` neue Funktion `naechsteAutoFristen(now)`, die deterministische Fälligkeiten berechnet:
  - USt: 10. des Folgemonats für jede USt-Periode mit erfasster Aktivität.
  - KSt/Soli: 10.03/06/09/12.
  - GewSt: 15.02/05/08/11.
- Wenn 7 Tage / 1 Tag vor Fälligkeit → Notification mit Titel „Steuer bald fällig: …" + Route `/steuern`.
- Dedupe via bestehende `steuer_frist_benachrichtigung_log`-Tabelle (posten_id = `auto-ust-2026-M05` etc.).
- KEINE E-Mails — strikt Memory-Regel.

### E) Steuerberater-Export
Ein Klick → ZIP mit allem, was der Berater für Jahresabschluss / USt-VA braucht.

- Header-Button „Export" → öffnet Mini-Dialog: Jahr + Format (Monat / Quartal / Jahr).
- Generiert client-seitig:
  - `einnahmen-{jahr}.csv` — alle bezahlten Rechnungen (Datum, Nummer, Kunde, Netto, USt 19 %, USt 7 %, Brutto).
  - `ausgaben-{jahr}.csv` — alle steuerrelevanten Belege (Datum, Titel, Lieferant, Brutto, USt-Satz, Vorsteuer, Netto).
  - `ust-uebersicht-{jahr}.csv` — pro Periode: Σ USt, Σ Vorsteuer, Zahllast.
  - `gewinn-{jahr}.csv` — eine Zeile mit Netto-Einnahmen, Netto-Ausgaben, Gewinn.
- Download als ZIP über `JSZip`.

## Was NICHT gebaut wird (bewusst draußen)

- Lohnsteuer / Sozialabgaben / § 48 Bauabzugsteuer → bleiben als manuelle Posten anlegbar.
- Echte Steuererklärungs-Formulare (ELSTER) — Übergabe nur per CSV.
- E-Rechnungs-Empfang (XRechnung/ZUGFeRD) → eigenes späteres Modul.
- Auto-Mails an irgendwen — strikt verboten.

## Technische Details

- `src/routes/steuern.tsx`: erweitern um Jahr-Wechsler, manuelle Posten-Sektion, Export-Button. `allePosten` merged Auto + Manuell.
- `src/components/steuern/SteuerDetailDialog.tsx`: Primary-Button + 2-Stufen-Mini-Dialog, ggf. Bearbeiten/Löschen für manuelle Posten.
- `src/lib/steuern/export.ts` (neu): CSV-Builder + JSZip-Wrapper. `bun add jszip`.
- `backend/src/steuern/fristen.ts`: zweite Funktion für Auto-Fristen, im selben Cron-Tick aufgerufen wie die manuelle Prüfung; Lese-Quellen sind bestehende `rechnungen`/`dokumente`-Repos.
- Keine Schema-Migration nötig — alle Tabellen existieren.

Soll ich so loslegen?
