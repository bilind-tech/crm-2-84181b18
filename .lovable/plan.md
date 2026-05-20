## Ziel
Einmaliger „Testdaten löschen"-Button in den Einstellungen, der genau Kunden, Angebote, Rechnungen und Protokolle (samt aller Abhängigkeiten) wegräumt. Danach ist die Funktion **dauerhaft deaktiviert** — kein zweiter Klick mehr möglich, auch nicht nach Neustart oder Re-Login.

## Was wird gelöscht
- `kunde` (alle), `objekt` (alle — hängen am Kunden), `ansprechpartner`
- `angebot`, `rechnung`, `protokolle`
- Transitive Abhängigkeiten: `zahlung`, `mahn_lauf_eintraege`, `email_versand` (für angebot/rechnung/protokoll), `drive_upload_queue`-Einträge, `dokumente` + zugehörige Dateien auf Disk, `aktivitaet`-Einträge zu diesen Objekten
- Belegnummern-Zähler werden zurückgesetzt, damit neue Beleg-Nummern wieder bei `/01` starten

## Was bleibt unangetastet
Firma, SMTP, Drive-OAuth-Token, Backups, E-Mail-Vorlagen & Signaturen, Steuern, Login/Recovery-Code, Dauerträge (`dauerauftrag` — wird in der Auswahl nicht genannt, bleibt also).

## Schutzkette
1. Button nur sichtbar wenn `reset_state.testdaten_reset_genutzt_am IS NULL`.
2. Klick öffnet Modal, das verlangt:
   - Eingabe des exakten Strings `ALLES LÖSCHEN`
   - Account-Passwort
   - Hinweis: „Diese Aktion kann nur **ein einziges Mal** ausgeführt werden."
3. Vor dem Löschen erstellt das Backend automatisch ein Sicherheits-Backup über die bestehende Backup-Pipeline.
4. Lösch-Transaktion läuft. Bei Erfolg wird `testdaten_reset_genutzt_am = datetime('now')` gesetzt — der Endpunkt sperrt sich danach selbst.

## Technisch

### Backend
- **Migration `031_testdaten_reset_sentinel.sql`**
  ```text
  CREATE TABLE reset_state (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    testdaten_reset_genutzt_am TEXT NULL,
    testdaten_reset_von_user_id TEXT NULL
  );
  INSERT INTO reset_state (id) VALUES (1);
  ```
- **Neue Route `backend/src/routes/testdaten-reset.ts`**
  - `GET /testdaten-reset/status` → `{ verfuegbar: boolean, genutztAm: string | null }`
  - `POST /testdaten-reset` mit Body `{ passwort, bestaetigung: "ALLES LÖSCHEN" }`
    - `requireAuth`
    - Sentinel prüfen → wenn schon genutzt: `410 Gone`
    - `bestaetigung` exakt? sonst `400`
    - Passwort via `verifyPassword` → sonst `403`
    - `await createBackup({ grund: "vor_testdaten_reset" })`
    - Eine SQLite-Transaktion mit DELETEs in korrekter Reihenfolge (Kinder zuerst): `zahlung`, `mahn_lauf_eintraege`, `email_versand` (WHERE beleg_art IN angebot/rechnung/protokoll), `drive_upload_queue` analog, `dokumente` (Dateien später unlinken), `protokolle`, `rechnung`, `angebot`, `ansprechpartner`, `objekt`, `kunde`, `aktivitaet`, `belegnummern_zaehler`
    - Storage-Files der gelöschten Dokumente werden nach der Transaktion ent-linkt (Fehler nur loggen, nicht werfen)
    - Sentinel setzen `UPDATE reset_state SET testdaten_reset_genutzt_am = datetime('now'), testdaten_reset_von_user_id = ?`
    - Aktivitäts-Eintrag „Testdaten zurückgesetzt durch <user>" schreiben
    - `200 { geloescht: { kunden, angebote, rechnungen, protokolle, dokumente } }`
- Server registriert die neue Route in `backend/src/server.ts`.

### Frontend
- **Neue Komponente** `src/components/einstellungen/TestdatenResetCard.tsx`
  - Lädt Status via React Query. Wenn `verfuegbar === false` → Card zeigt nur einen kleinen, ausgegrauten Info-Satz „Testdaten-Reset wurde bereits am … verwendet." Kein Button.
  - Wenn `verfuegbar === true` → roter „Testdaten löschen" Button (`variant="destructive"`).
  - Modal (`AlertDialog`) mit:
    - Warnliste der zu löschenden Tabellen
    - Hinweis „Vorher wird automatisch ein Sicherheits-Backup erstellt"
    - Hinweis „Diese Funktion ist danach **dauerhaft deaktiviert**"
    - Text-Input „Tippe `ALLES LÖSCHEN`" — Bestätigen-Button bleibt bis exakt match disabled
    - Passwort-Input
    - Roter „Endgültig löschen"-Button
  - Nach Erfolg: Toast mit Zahlen, `queryClient.invalidateQueries()` für alle Belege/Kunden, Card refetched Status → Button verschwindet.
- Einbinden in `src/routes/einstellungen.tsx` ganz unten unter „Gefahrenzone" (eigene Section mit `border-destructive`).

### Schutz vor versehentlichem Wieder-Freischalten
- Memory-Eintrag `mem://features/testdaten-reset` dokumentiert: Sentinel niemals manuell zurücksetzen; Migration darf bei einem System-Update niemals `reset_state` antasten.

## Nicht im Umfang
- Selektives Löschen (z. B. nur Kunden eines Jahres) — dafür gibt es bereits die Datenbank-Seite mit Soft-Delete + Hart-Löschen pro Eintrag.
- Reset von Firma/SMTP/Drive/Backups/Steuern/Mail-Vorlagen — diese bleiben absichtlich.
- Reaktivierungs-Mechanismus über die UI.
