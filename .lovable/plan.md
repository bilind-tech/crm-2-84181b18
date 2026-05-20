# Fix: Rechnung mit „Stundenweise"-Position → Internal Server Error

## Ursache

In Migration `007_angebote_rechnungen.sql` haben die Tabellen `angebot_position` und `rechnung_position` einen CHECK-Constraint:

```sql
modus TEXT NOT NULL DEFAULT 'einzel' CHECK (modus IN ('einzel','pauschal'))
```

Code, API-Schema (`positionSchema`) und PDF-Layout kennen aber bereits den dritten Wert `'stunden'`. Beim Insert einer Stunden-Position bricht SQLite mit „CHECK constraint failed" ab → das Backend antwortet 500 „Internal Server Error" → Frontend zeigt „Rechnung konnte nicht angelegt werden".

SQLite kann CHECK-Constraints nicht per `ALTER TABLE` ändern — die Tabellen müssen neu aufgebaut werden.

## Lösung

Neue Migration `032_position_modus_stunden.sql` anlegen, die für beide Positions-Tabellen den CHECK-Constraint auf `('einzel','pauschal','stunden')` erweitert. Schritte je Tabelle (Standard-SQLite-Pattern):

1. `PRAGMA foreign_keys = OFF;`
2. Neue Tabelle `*_position_new` mit identischem Schema, aber erweitertem CHECK anlegen.
3. Daten 1:1 per `INSERT INTO ..._new SELECT * FROM ...` kopieren.
4. Alte Tabelle droppen, neue umbenennen.
5. Bestehende Indizes (`ix_angebot_position_angebot`, `ix_rechnung_position_rechnung`) neu erstellen.
6. `PRAGMA foreign_keys = ON;`

Alle Spalten, Defaults, NOT-NULL-Regeln und FK-Verweise (`angebot_id`/`rechnung_id` → `angebot`/`rechnung` ON DELETE CASCADE) bleiben unverändert. Keine Datenverluste — bestehende Positionen haben modus `einzel` oder `pauschal` und passen weiter in den erweiterten CHECK.

## Betroffene Datei

- `backend/src/db/migrations/032_position_modus_stunden.sql` (neu)

Kein Code- oder Frontend-Change nötig — Mapper, API-Validator und PDF-Renderer kennen `stunden` bereits.

## Verifikation

Nach Migration: Rechnung mit Position-Modus „Stunden" anlegen → 200/201 statt 500, Position wird gespeichert, PDF rendert die Stunden-Spalte.
