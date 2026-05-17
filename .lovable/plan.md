## Ziel

Alle „Löschen"-Buttons im CRM verhalten sich gleich:
- Datensatz wird **soft-gelöscht** (`geloescht_am = jetzt`)
- Erscheint nicht mehr in Listen/Details/Suche
- Bleibt komplett wiederherstellbar in **Einstellungen → Datenbank**
- **Hart-Löschen passiert nur noch dort** (mit Passwort)

`archiviert` bleibt unverändert — das ist eine eigene Funktion (Kunde inaktiv schalten, Beleg in Archiv legen) und hat nichts mit Löschen zu tun.

## Backend-Änderungen

### `kunden/repo.ts`
- `deleteKunde(id)` → setzt `geloescht_am`, statt zu archivieren oder zu kaskadieren. Kein `force`-Parameter mehr.
- `deleteObjekt`, `deleteAnsprechpartner`, `deleteNotiz` → analog: `UPDATE … SET geloescht_am = datetime('now')`.
- Alle `list…`/`get…`-Queries kriegen `WHERE geloescht_am IS NULL`.
- `hasKundeReferences` bleibt — wird aber nicht mehr für „Soft vs. Hard" benutzt.

### `belege/angebote-repo.ts` und `belege/rechnungen-repo.ts`
- `deleteAngebot(id)` / `deleteRechnung(id)` → setzen `geloescht_am`. Kein `force`. Keine Cleanups in `email_versand`, `drive_upload_queue`, `mahn_lauf_eintraege`, `zahlung` — die räumt das Hart-Löschen in der DB-Seite via `hardDeleteExtra`.
- `listAngebote` / `getAngebot` / `listRechnungen` / `getRechnung` + interne Lookups: `WHERE geloescht_am IS NULL`.
- Belegnummern-Zähler bleibt unangetastet (gelöschte Nummern werden nicht recycelt).

### `protokolle/repo.ts`
- `deleteProtokoll(id)` → soft. Verknüpftes Dokument bleibt bestehen (auch soft-gelöscht?: nein, Dokument bleibt sichtbar — Protokoll ist separat).
- `listProtokolle` / `getProtokoll` / `getProtokollByDokumentId` → `WHERE geloescht_am IS NULL`.

### `steuern/repo.ts`
- `removeManuellerPosten(id)` → soft.
- `listManuellePosten` / `getManuellerPosten` → `WHERE geloescht_am IS NULL`.
- `setBezahlt`/`removeBezahlt` bleiben unverändert (Markierungs-Tabelle, kein eigener Datensatz).

### `routes/belege.ts`, `routes/stammdaten.ts`, `routes/protokolle.ts`, `routes/steuern.ts`
- `?force=1`-Pfad komplett raus. Route ruft nur noch das soft-delete-Repo auf, gibt `{ ok: true }` zurück.
- Audit-Eintrag bleibt erhalten.

### Weitere Stellen, die gelöschte Daten ausblenden müssen
- `aktivitaet`-Feeds / Dashboards / Mahnungs-Cron-Reads → `WHERE geloescht_am IS NULL` ergänzen, wo Belege/Kunden joinen.
- Belegnummern-Eindeutigkeit / Kürzel-Live-Check ignorieren gelöschte Kunden (bewusst, damit Kürzel erst nach Hart-Löschen wieder frei wird — sonst Kollisionen beim Wiederherstellen).

## Frontend-Änderungen

### `src/hooks/useApi.ts`
- `force`-Parameter aus `deleteKunde` / `deleteAngebot` / `deleteRechnung` entfernen, URL ohne `?force=…`.

### Toast-Texte (alle Lösch-Erfolgsmeldungen)
Einheitlich: „… gelöscht. Wiederherstellbar in Einstellungen → Datenbank."

### Lösch-Bestätigungsdialoge
- Keine separate „endgültig löschen"-Option mehr im CRM. Nur noch ein Schritt: „Wirklich löschen?" → soft-delete.
- Bestehende „kann nicht gelöscht werden, weil verknüpft"-Pfade entfallen (immer löschbar, immer wiederherstellbar).

### Datenbank-Seite (bereits da)
- Bekommt automatisch alle neu soft-gelöschten Einträge zu sehen, inkl. Restore + Hart-Löschen mit Passwort. Keine Änderung nötig.

## Was bewusst NICHT angefasst wird

- `archiviert` bleibt als eigenständige Funktion (Status-Wechsel, nicht „weg").
- `dokumente.geloescht_am` (gab es schon) und der 30-Tage-Auto-Purge bleiben unverändert.
- Belegnummern-Zähler — gelöschte Nummern werden NICHT freigegeben, damit beim Wiederherstellen keine Doppel-Nummern entstehen.
- Mahn-Cron bleibt deaktiviert (Core-Regel).

## Reihenfolge der Umsetzung

1. Repos umstellen (Kunden, Angebote, Rechnungen, Protokolle, Steuern, Objekt, Ansprechpartner, Notiz).
2. Alle SELECT-Queries auf `WHERE geloescht_am IS NULL` ergänzen.
3. Routen entschlacken (`force` raus).
4. Frontend-`useApi`-Aufrufe vereinfachen.
5. Toast-Texte vereinheitlichen.
6. Aktivitäts-/Dashboard-Joins prüfen und ggf. ausblenden.

Nichts an der Datenbank-Seite selbst ändert sich — sie spiegelt automatisch das neue Verhalten.
