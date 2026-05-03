# Release Notes (Vorlage)

Wird vom Release-Builder beim nächsten `bun run release` ins Manifest-Feld
`hinweise` kopiert (max. 4000 Zeichen). Diese Datei kann leer bleiben — dann
wird kein Hinweis gesetzt. Versionierung passiert per Git, nicht hier.

## Unreleased

- PDF-Vorschau stabilisiert: React-Query mit `staleTime: Infinity`, LRU-Cache
  pro Beleg, sauberes Revoke der Blob-URLs beim Beleg-Wechsel, Re-Mount des
  PDF-Viewers via `key={pdfUrl}`. Kein Flicker mehr beim Öffnen/Schließen
  der Detailseite.
- Mock-Modus ist jetzt ehrlich: SMTP-Tests, Verbindungsprüfungen und
  Test-/Beleg-Versand liefern im Browser ein `demo: true`-Flag und einen
  Info-Toast statt vorgetäuschter Erfolgsmeldungen. Banner in den Einstellungen
  und im Versand-Dialog weisen darauf hin, dass echte Mails erst nach
  Pi-Deployment versendet werden.
- Belege-Scheduler: Fehler werden nicht mehr verschluckt. Jeder Lauf loggt
  den Fehler mit Stacktrace; nach 3 Fehlversuchen in Folge zusätzlich eine
  Warn-Zeile.
- GitHub-Actions-CI (`.github/workflows/ci.yml`): Frontend-Lint,
  Backend-Typecheck + Tests, Release-Smoke-Test mit Artifact-Upload des
  ZIPs. Neuer Smoke-Test `backend/test/release-bundle-smoke.spec.ts`
  validiert das gebaute ZIP (Manifest, Signatur, `server.js`).
- Dokumente-Übersicht: globales Drive-Sync-Badge im Header zeigt aggregierten
  Status (synchronisiert / ausstehend / Fehler) auf einen Blick.
- `/health` (public, ohne Auth) liefert keine sensiblen Felder mehr —
  DB-Pfad und Master-Key-Status sind nach `/health/detail` (auth-pflichtig)
  gewandert. Public-Body bleibt: `status`, `version`, `schemaVersion`,
  `db.{ok,wal}`, `maintenance`, `uptimeSec`.
- Stundenzettel-URL wird im Backend serverseitig validiert: nur leer oder
  echte `http(s)://`-URLs. `javascript:`/`data:`/`file:` werden mit
  klarer Fehlermeldung abgelehnt (im Tab inline angezeigt).
- Neue Karte „Demo-Daten in diesem Browser löschen" im Tab
  „Backend-Verbindung". Räumt alle `mcc_mock_*`/`mcc.*`-LocalStorage-Keys
  weg und lädt neu. Nur sichtbar, wenn solche Daten existieren.
