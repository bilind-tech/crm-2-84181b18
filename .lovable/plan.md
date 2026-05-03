# Plan 3 — Technische Schulden & CI absichern

Vorbereitung für die Pi-Auslieferung: was heute leise schiefgehen könnte, soll laut werden, und der Release-Build muss vor jedem Merge automatisch grün sein.

## A. Scheduler-Fehler nicht mehr verschlucken

Heute fängt `backend/src/belege/scheduler.ts` jeden Fehler in `markOverdueRechnungen()` mit einem leeren `catch {}`. Wenn die DB-Tabellen fehlen, ein Schema-Mismatch da ist oder die Funktion abstürzt, **merkt es niemand** — keine Mahnung, keine Überfällig-Markierung, keine Spur im Log.

Änderungen:
- `console.error` mit Tag `[belege-scheduler]`, Nachricht und Fehlerstack.
- Beim ersten Tick (Bootstrap): wenn die Tabellen wirklich noch fehlen (`SQLITE_ERROR: no such table`), bleibt es ein freundlicher Info-Log statt Error — alle anderen Fehler werden lautstark geloggt.
- Counter `consecutiveFailures` — nach 3 Fehlern in Folge kommt eine zusätzliche Warn-Zeile „Scheduler scheint dauerhaft zu scheitern, bitte prüfen". Reset bei erstem Erfolg.

Datei: `backend/src/belege/scheduler.ts` (alleinstehend, ~30 Zeilen Diff).

## B. Release-Bundle validieren

`scripts/build-release.ts` baut das ZIP, das später per System-Update auf den Pi geschoben wird. Es gibt zwar `backend/test/release-bundle.spec.ts`, der die Signatur-Formel prüft — aber **nicht den ganzen Build**. Vor der Pi-Auslieferung will ich einmal sauber durchspielen.

Änderungen:
- Neuer Smoke-Test `backend/test/release-bundle-smoke.spec.ts`: ruft den Builder im `--skip-frontend`-Modus auf (Frontend-Build dauert zu lange für CI), prüft danach:
  1. ZIP existiert in `dist-release/`.
  2. ZIP enthält `manifest.json` mit `appVersion`, `schemaVersion`, `signature`.
  3. `validateManifest()` aus `backend/src/system/manifest.ts` akzeptiert die Signatur.
  4. ZIP enthält `backend/dist/server.js` (also wirklich gebaut, nicht leer).
- Ein neues npm-Script `release:dry` in `package.json`: `tsx scripts/build-release.ts --skip-frontend --allow-same-version --out=dist-release-dry`.

## C. GitHub-Actions-CI

Die Tests existieren, aber nichts startet sie automatisch. Ich legen einen Workflow an:

`/.github/workflows/ci.yml`:
- Trigger: `push` und `pull_request` auf `main`.
- Node 20, Bun für Frontend-Lint, Vitest für Backend.
- Jobs (parallel):
  1. **frontend-lint**: `bun install` → `bun run lint`.
  2. **backend-test**: `cd backend && npm ci && npm run typecheck && npm run test`.
  3. **release-smoke**: nach `backend-test`, ruft `npm run release:dry` auf, lädt das ZIP als Artifact hoch (Retention 7 Tage) — so kannst du dir aus jedem grünen Run direkt ein Test-ZIP ziehen.

Frontend-Build wird bewusst ausgespart (Lovable baut den ohnehin selbst). Falls du es trotzdem willst, sag Bescheid — ich nehme es dann als 4. Job dazu.

## D. Globaler Drive-Sync-Indikator (klein)

Auf der Dokumente-Übersichtsseite fehlt heute ein kompakter Status „Drive: synchronisiert / X ausstehend / Fehler". Pro Beleg gibt es schon eine Anzeige, aber kein Gesamt-Glance.

Änderung: kleines Badge oben rechts in `src/routes/dokumente.tsx` (oder dem entsprechenden Komponenten-Header), das aus dem bestehenden Drive-Status-Hook eine Aggregation rendert. Klick öffnet die Drive-Einstellungen. Keine neuen Backend-Endpoints — reines Aggregieren clientseitig.

## Geänderte / neue Dateien

| Datei | Änderung |
|---|---|
| `backend/src/belege/scheduler.ts` | echtes Logging + Failure-Counter |
| `backend/test/release-bundle-smoke.spec.ts` | **neu**, Smoke-Test |
| `package.json` | `release:dry`-Script |
| `.github/workflows/ci.yml` | **neu**, 3 Jobs |
| `src/routes/dokumente.tsx` (oder Komponente) | kleines globales Drive-Badge |

## Akzeptanzkriterien

1. Ein simulierter Scheduler-Fehler (z. B. korrupte DB) erzeugt **eine** klare Error-Zeile pro Tick im Konsolen-Log, nach 3 Tries zusätzlich eine Warnung.
2. `bun run release -- --skip-frontend` produziert ein gültiges ZIP, das `validateManifest` akzeptiert.
3. Auf einem Push gegen `main` läuft die CI grün durch und stellt das Test-ZIP als Artifact bereit.
4. Auf der Dokumente-Übersicht ist auf einen Blick erkennbar, ob alle Belege auf Drive synchron sind.
5. Keine Änderung am echten Versand-, Mahn- oder Daten-Pfad.

## Risiko

Niedrig. Keine Datenbank-Migrationen, keine Änderung am Versand- oder Backup-Flow. CI ist additiv.

Sag „Go", dann setze ich Plan 3 um.
