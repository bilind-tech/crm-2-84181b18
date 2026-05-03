# Plan 4 — Restpolitur vor Pi-Auslieferung

Die großen Brocken (PDF-Vorschau, Mock-Ehrlichkeit, Scheduler-Logging, CI, Drive-Badge) sind durch. Übrig bleiben die kleineren Punkte aus dem ursprünglichen Review (Punkte 5, 7 und die Nice-to-haves). Alles defensiv, kein Eingriff in Versand/Backup/Daten.

## A. `/health` final absichern (Punkt 5 aus Review)

Heute liefert `GET /health` ohne Auth: `version`, `schemaVersion`, `db.path`, `masterKey.present`, `maintenance`, `uptimeSec`. Davon ist `db.path` (absoluter Dateipfad zur SQLite) und `masterKey.present` Information, die ein nicht-eingeloggter Aufrufer im LAN nicht sehen muss.

Änderungen in `backend/src/routes/health.ts`:
- Public-`/health` reduziert auf: `status`, `version`, `uptimeSec`, `maintenance`. Reicht für jeden Healthcheck (auch den internen Smoketest in `system/runner.ts`, der nur HTTP-200 prüft).
- Alles andere (`schemaVersion`, `db.*`, `masterKey.*`) wandert nach `/health/detail` (bleibt `requireAuth`).
- Smoketest in `backend/src/system/runner.ts` braucht keine Anpassung — er prüft nur Status-Code.

## B. Stundenzettel-URL serverseitig validieren (Punkt 7)

`StundenzettelSchema.externeUrl` akzeptiert heute jeden String bis 500 Zeichen. Frontend rendert die URL als `<iframe src=>` und in einem „In neuem Tab"-Link. Auch wenn nur der Single-User selbst speichern kann, ist eine echte URL-Validierung sauberer.

Änderungen in `backend/src/settings/schemas.ts`:
- `externeUrl`: leer erlaubt, sonst `z.string().url()` mit Schema-Whitelist (`http:` / `https:`). Ablehnen: `javascript:`, `data:`, `file:`.
- Beibehalten: `.trim().max(500)`.

Frontend (`StundenzettelTab.tsx`): bei Backend-Fehler 400 die Nachricht inline anzeigen (heute generischer Toast).

## C. „Demo-Daten löschen"-Knopf in Einstellungen (Nice-to-have)

Wenn die App vom Mock-Modus auf das echte Pi-Backend wechselt, bleiben alte Mock-Daten unter `mcc_mock_db_v7` (und Hilfs-Keys wie `mcc.stundenzettel.url`, `mcc_stundenzettel_migrated_v1`) im LocalStorage liegen. Harmlos, aber unsauber.

Neue Mini-Komponente in `src/components/einstellungen/MockDataResetCard.tsx`:
- Wird **nur** gerendert, wenn `!isBackendUrlExplicit()` (Demo-Modus aktiv) oder wenn LocalStorage einen Key mit Prefix `mcc_mock_` / `mcc.` enthält.
- Button „Demo-Daten in diesem Browser löschen" → Bestätigungs-Mini-Dialog (gleicher Stil wie Zahlungs-Dialog) → leert alle `mcc_mock_*`- und `mcc.*`-Keys + `localStorage.removeItem("mcc_mock_db_v7")` → Hard-Reload.
- Eingebunden im Tab „Allgemein" oder „Datenschutz" der Einstellungen — wo es organisch passt, prüfe ich beim Implementieren.

Kein Backend-Aufruf. Wirkt nur auf den aktuellen Browser.

## D. Release-Doku auffrischen

Vor Tag X kurz durchsehen und konsistent mit aktuellem Stand machen:
- `RELEASE_NOTES.md`: aktuelle Version + die seit Plan 1–3 gemachten Änderungen (PDF-Refactor, Mock-Hinweise, Scheduler-Logging, CI, Drive-Badge) als „Unreleased"-Block.
- `BACKEND_INTEGRATION.md`: prüfen, ob neue/geänderte Endpoints (z. B. `/einstellungen/stundenzettel`, geänderter `/health`-Body) korrekt dokumentiert sind.

Reine Doku-Edits, kein Code.

## Geänderte / neue Dateien

| Datei | Änderung |
|---|---|
| `backend/src/routes/health.ts` | Public-Body schlanker, Details bleiben in `/health/detail` |
| `backend/src/settings/schemas.ts` | `externeUrl`: echte URL-Validierung, http/https only |
| `src/components/einstellungen/StundenzettelTab.tsx` | 400-Fehler inline anzeigen |
| `src/components/einstellungen/MockDataResetCard.tsx` | **neu**, Demo-Daten-Reset |
| `src/routes/einstellungen.tsx` | Reset-Karte einhängen (passender Tab) |
| `RELEASE_NOTES.md` | Unreleased-Block aktualisieren |
| `BACKEND_INTEGRATION.md` | `/health`- und `/einstellungen/stundenzettel`-Abschnitte prüfen/anpassen |

## Akzeptanzkriterien

1. `curl http://pi:PORT/health` ohne Login zeigt **keinen** DB-Pfad und **keinen** Master-Key-Status mehr.
2. Stundenzettel-Tab lehnt `javascript:alert(1)` mit klarer Meldung ab; gültige `https://`-URL wird gespeichert.
3. Im Demo-Modus erscheint der Reset-Knopf, leert nach Bestätigung alle Mock-Keys, lädt die App neu — danach ist alles leer.
4. `RELEASE_NOTES.md` listet die Änderungen aus Plan 1–4 unter „Unreleased".
5. Smoketest in `system/runner.ts` läuft unverändert grün (nur HTTP-200-Check).
6. Keine Datenbank-Migration, kein Eingriff in Versand/Backup/Daten-Pfade.

## Risiko

Sehr niedrig. Drei kleine, unabhängige Änderungen + Doku. Kein Schema-Migrations-Bedarf (das `externeUrl`-Default `""` bleibt erlaubt, alle Bestandswerte sind bereits via Frontend-Form gesetzt und werden bei nächstem Save validiert).

Sag „Go", dann setze ich Plan 4 um.
