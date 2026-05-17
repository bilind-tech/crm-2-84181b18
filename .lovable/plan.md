## Problem

Der Button „Aus Dauerauftrag" auf der Rechnungsseite öffnet einen Dialog, der **immer leer** ist. Ursache: Im Backend gibt es die Endpunkte `/dauerauftraege`, `/dauerauftrag-laeufe`, `/dauerauftrag-sonderpositionen` und `/einstellungen/dauerauftrag` (PATCH) gar nicht. Frontend-Hooks rufen ins Leere → `[]`. Außerdem wird beim Anlegen einer „wiederkehrenden" Rechnung kein Dauerauftrag angelegt.

Zusätzlich fehlt im Dialog die Möglichkeit, **gezielt für einzelne Monate / Perioden** Rechnungen zu erzeugen (aktuell nur „Sofort-Lauf" für jetzt) und den Dauerauftrag dort zu **bearbeiten**.

## Ziel

End-to-end funktionierender Dauerauftrag:
1. Ein Dauerauftrag wird einmal angelegt (über `wiederkehrend`-Checkbox einer Rechnung).
2. Auf Rechnungen-Seite → „Aus Dauerauftrag" → Dialog listet alle Daueraufträge, man kann
   - einzeln oder alle auswählen,
   - **die Zielperiode wählen** (z. B. „diesen Monat", „nächsten Monat", konkrete Monate),
   - Daueraufträge direkt im Dialog bearbeiten (Bezeichnung, Frequenz, Positionen, Modus, Status).
3. Allgemeine Standard-Einstellungen unter Einstellungen → Dauerauftrag (bereits UI vorhanden, Backend fehlt) speichern wirklich.

## Umsetzung

### 1. Backend — neue Module

**Migration** `backend/src/db/migrations/0XX_dauerauftrag.sql`
- `dauerauftrag` (id, nummer, kunde_id, objekt_id, ansprechpartner_id, bezeichnung, frequenz, stichtag_typ, stichtag_wert, laufzeit_von, laufzeit_bis, positionen JSON, rabatt_gesamt, steuersatz, betreff_vorlage, text_vorlage, modus, email_empfaenger JSON, status, pausiert_bis, letzte_ausfuehrung, notizen, erstellt_am, geaendert_am)
- `dauerauftrag_lauf` (id, dauerauftrag_id, periode UNIQUE pro DA, geplant_fuer, ausgefuehrt_am, rechnung_id, status, fehler_grund)
- `dauerauftrag_sonderposition` (id, dauerauftrag_id, fuer_periode, position JSON, verbraucht_am)
- Indizes auf kunde_id, status, periode

**Repo** `backend/src/dauerauftrag/repo.ts` — CRUD + `getOrCreateLauf(daId, periode)`, `markLaufErzeugt(id, rechnungId)`, `listLaeufe(status?)`.

**Belege-Generator** `backend/src/dauerauftrag/generator.ts` — analog `src/lib/dauerauftrag/generator.ts`, erzeugt aus DA + Periode eine Rechnung (neue Nummer via bestehender `belegnummern`-Logik, dauerauftrag_id gesetzt, Sonderpositionen einhängen + als verbraucht markieren, Betreff/Text-Templates mit `{{lauf.zeitraum/monat/von/bis}}` füllen).

**Routes** `backend/src/routes/dauerauftrag.ts` (in `server.ts` registrieren):
- `GET /dauerauftraege`, `GET /dauerauftraege/:id` (inkl. laeufe + sonderpositionen)
- `POST /dauerauftraege`, `PATCH /dauerauftraege/:id`, `DELETE /dauerauftraege/:id`
- `POST /dauerauftraege/:id/sofort-lauf` (Body optional: `periode`, sonst aktuelle Periode)
- `POST /dauerauftraege/:id/pausieren` `{ bis }`, `POST /dauerauftraege/:id/beenden` `{ zum? }`
- `GET /dauerauftrag-laeufe?status=…`
- `POST/DELETE /dauerauftrag-sonderpositionen[/id]`
- `PATCH /einstellungen/dauerauftrag` (auf bestehendem Settings-Mechanismus, Schema schon vorhanden)

**Auto-Anlage**: In `backend/src/routes/belege.ts` beim Erstellen einer Rechnung mit `optionen.wiederkehrend === true && !dauerauftrag_id`: Dauerauftrag aus Rechnungsdaten ableiten (Frequenz/Stichtag aus `optionen.wiederkehrend_details`), Rechnung als ersten Lauf eintragen, `rechnung.dauerauftrag_id` setzen, im Response `dauerauftragNeu: { id, nummer }` mitgeben (Typ existiert bereits).

Alle Routes mit `requireAuth` (kein `requireOwner`, Single-User), Zod-Validierung wie üblich.

### 2. Frontend — Dialog erweitern

`src/components/dauerauftrag/RechnungAusDauerauftragDialog.tsx`:

```
┌─ Aus Dauerauftrag erzeugen ───────────────────────┐
│ Periode: [diesen Monat ▼]  (Mai 2026 | Jun 2026 | …)│
│                                                   │
│ [☑] Alle auswählen                  3 ausgewählt  │
│ ─────────────────────────────────────────────────│
│ [☑] Reinigung Bürogebäude    monatlich · 357 €   │
│      Mustermann GmbH        [Bearbeiten] [↻ erz.]│
│      ⚠ bereits erzeugt für 2026-05               │
│ [☑] Treppenhaus Pflege       monatlich · 89 €    │
│      Familie Müller         [Bearbeiten]         │
│ [ ] Fensterreinigung (pausiert)                  │
│                                                   │
│              [Abbrechen]  [Erzeugen (2)]         │
└───────────────────────────────────────────────────┘
```

- Periodenauswahl als Dropdown: aktueller Monat, ±3 Monate (bzw. passende Perioden je Frequenz). Bei Mehrfachauswahl unterschiedlicher Frequenzen wird die Periode pro DA passend aufgelöst.
- „Bereits erzeugt" wird pro gewählter Periode geprüft.
- „Bearbeiten"-Button öffnet neuen `DauerauftragBearbeitenDialog` (Felder: Bezeichnung, Frequenz, Stichtag, Positionen via `PositionenEditor`, Rabatt, Steuersatz, Modus, Status, Notizen) → `useUpdateDauerauftrag`.
- `useSofortLaufBulk` bekommt zweiten Parameter `periode?: string` und sendet ihn an Backend.
- Leerer Zustand bleibt freundlich, mit Hinweis „Häkchen Wiederkehrend bei einer Rechnung setzen".

### 3. Verifikation

- Migration läuft sauber durch (`SELECT name FROM sqlite_master WHERE type='table'`).
- Rechnung mit `wiederkehrend=true` anlegen → `dauerauftraege`-Liste enthält neuen Eintrag, Rechnung hat `dauerauftrag_id`.
- Dialog zeigt Eintrag, „Erzeugen" für nächsten Monat erstellt neue Rechnung mit korrekter Nummer + Betreff aus Template.
- Doppellauf für gleiche Periode wird verhindert (UNIQUE constraint + Warn-Pill).
- Einstellungen → Dauerauftrag speichert tatsächlich (PATCH 200).

## Außer Scope

- Kein Cron / kein automatischer Versand (entspricht Memory: niemals Auto-Mails). „Modus vollautomatisch" bleibt Datenfeld, erzeugt aber weiterhin nur Entwürfe — Versand nur per User-Klick.
- Keine Drive-Anpassung (Rechnungen aus DA nutzen bestehenden Drive-Auto-Upload).
- Mahnungen, Teilzahlungen, PDF-Editor: unverändert.
