## Ziel

Beide Fehler werden an der Ursache behoben:

1. **Testdaten löschen** ist wieder einmalig nutzbar und zeigt den Lösch-Button wieder an.
2. **Firmendaten** bleiben nach dem Speichern erhalten, inklusive Leerzeichen in `My Clean Center GmbH` und gespeicherter Website; PDFs/Rechnungen/Angebote zeigen sofort die aktuellen Werte im Footer.

## Gefundene Ursachen

### 1. Testdaten-Reset

Die vorherige Einmal-Migration wurde als `032_testdaten_reset_unlock_once.sql` angelegt. Es gibt aber bereits eine andere `032_...` Migration.

Der Migrationslauf merkt sich nur die **Versionsnummer**. Wenn Version `032` schon bekannt ist, wird die neue Datei mit derselben Nummer übersprungen. Deshalb wurde `reset_state` auf deinem System sehr wahrscheinlich nie zurückgesetzt.

### 2. Firmendaten / Website / PDF-Footer

Es gibt mehrere Schwachstellen zusammen:

- Nach dem Speichern wird der React-Query-Cache für Firmendaten nur invalidiert, aber nicht sofort mit der Server-Antwort aktualisiert. Dadurch kann das Formular kurz oder dauerhaft wieder alte Werte anzeigen.
- Die PDF-Query hängt aktuell nicht von den Firmendaten ab. Wenn eine Rechnung/Angebot-PDF schon einmal geladen wurde, kann der alte PDF-Blob im Cache bleiben, obwohl Firmendaten geändert wurden.
- Alte Datenbanken können noch exakt den alten Namen `MyCleanCenter GmbH` gespeichert haben. Updates dürfen Daten normalerweise nicht überschreiben, aber für diesen exakten Legacy-Wert brauchen wir eine sichere Korrektur, ohne echte eigene Firmennamen anzufassen.

## Umsetzung

### A. Testdaten-Reset wirklich freischalten

1. Die fehlerhafte doppelte Migration `032_testdaten_reset_unlock_once.sql` wird entfernt oder in eine eindeutige Version überführt.
2. Neue eindeutige Migration anlegen, z. B. `038_testdaten_reset_unlock_once.sql`:
   - setzt nur `reset_state.id = 1` zurück
   - `testdaten_reset_genutzt_am = NULL`
   - `testdaten_reset_von_user_id = NULL`
   - läuft durch die eindeutige Versionsnummer garantiert beim nächsten Backend-Start genau einmal
3. Den eigentlichen Reset-Endpunkt nicht lockern:
   - Passwort bleibt Pflicht
   - Bestätigung `ALLES LÖSCHEN` bleibt Pflicht
   - Sicherheits-Backup vor dem Löschen bleibt Pflicht
   - nach erfolgreichem Löschen sperrt sich die Funktion wieder selbst
4. Zusätzlich eine kleine technische Schutzprüfung/Test ergänzen, damit doppelte Migrationsnummern künftig auffallen und nicht wieder still Migrationen übersprungen werden.

### B. Firmendaten stabil speichern und anzeigen

1. Frontend-Hook `useUpdateFirmendaten` stabilisieren:
   - nach erfolgreichem `PATCH /einstellungen/firma` sofort `qk.einstellungen.firma` mit der Antwort setzen
   - danach gezielt neu laden
   - zusätzlich alle PDF-Queries invalidieren, damit Rechnung/Angebot nicht den alten Footer behalten
2. Firmendaten vor dem Speichern normalisieren:
   - `firmenname` und `webseite` bleiben die UI-Felder
   - zusätzlich werden die Backend-Aliasse `name` und `web` konsistent mitgeschickt
   - interne Leerzeichen werden nicht entfernt; nur äußere Leerzeichen werden wie bisher bereinigt
3. Einstellungen-Formular robuster machen:
   - nach erfolgreichem Speichern wird der Formularzustand auf die gespeicherte Server-Antwort gesetzt
   - dadurch wird das Feld nicht wieder leer oder auf alte Daten zurückgesetzt
4. PDF-Cache-Abhängigkeit erweitern:
   - PDF-Signatur enthält relevante Firmendaten: `firmenname`, `webseite`, Adresse, Steuerdaten, Bankdaten, Logo
   - wenn Firmendaten geändert werden, erzeugt die Rechnung/Angebot-PDF automatisch eine neue Version
5. Backend/PDF-Legacy-Namen absichern:
   - nur der exakte Altwert `MyCleanCenter GmbH` wird beim Lesen/Rendern als `My Clean Center GmbH` behandelt
   - eigene Firmennamen werden nicht verändert
   - `webseite`/`web` werden weiterhin sauber gemappt

### C. Tests / Prüfung

1. Backend-Test ergänzen/erweitern:
   - Firmendaten-Roundtrip mit `My Clean Center GmbH` und Website bleibt exakt erhalten
   - interne Felder `name/web` und UI-Felder `firmenname/webseite` bleiben synchron
2. PDF-relevante Prüfung:
   - PDF-Firmendatenquelle liefert den Firmennamen mit Leerzeichen und die Website korrekt
3. Migrationstest:
   - keine doppelten Migrationsnummern mehr
   - neue Reset-Unlock-Migration ist höher als die aktuelle letzte Migration
4. Nach Umsetzung in der Preview prüfen:
   - Einstellungen → Firmendaten: Name mit Leerzeichen + Website speichern
   - Seite/Tab wechseln und zurück: Werte bleiben erhalten
   - Rechnung/Angebot öffnen: Footer zeigt neuen Namen + Website
   - Einstellungen → Sicherheit: Testdaten löschen zeigt wieder den Button, solange noch nicht erneut gelöscht wurde

## Nach dem Update auf dem Pi

Nach Installation/Update einmal Backend neu starten:

```text
systemctl restart mycleancenter
```

Danach sollte gelten:

- **Einstellungen → Sicherheit** zeigt den Button **Testdaten löschen…** wieder an.
- Nach erfolgreichem Testdaten-Reset sperrt er sich wieder dauerhaft.
- **Einstellungen → Firmendaten** speichert `My Clean Center GmbH` mit Leerzeichen und die Website dauerhaft.
- **Rechnungen/Angebote** zeigen den aktuellen Namen und die Website im Footer.