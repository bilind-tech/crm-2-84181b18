## Problem

Wenn aus dem `EmailVersandDialog` eine E-Mail zu einem Angebot oder einer Rechnung erfolgreich rausgeht, wird die zugehörige `email_versand`-Zeile zwar korrekt auf `gesendet` gesetzt — der **Beleg selbst** bleibt aber im Status `entwurf` und hat kein `versendet_am`. Dadurch sieht es überall (Detailseite, Listen, FlowBar, Dashboard "nächste Schritte") so aus, als wäre nie eine Mail rausgegangen.

**Ursache:** Die Route `POST /email/versand` (`backend/src/routes/email.ts`, ~Zeile 203) ruft `sendNow(row)` auf, aktualisiert aber danach nicht den Beleg. Es gibt bereits passende Helper:
- `sendeAngebot(id)` in `backend/src/belege/angebote-repo.ts` — setzt `status='versendet'`, `versendet_am=now()`, gating via `isValidAngebotTransition`
- `sendeRechnung(id)` in `backend/src/belege/rechnungen-repo.ts` — setzt `status='versendet'`, `versendet_am=now()`, nur wenn aktueller Status `entwurf`

Beide werden aktuell nirgends vom E-Mail-Pfad aufgerufen.

## Fix

In `backend/src/routes/email.ts`:

1. **`POST /email/versand`** — direkt nach `const result = await sendNow(row);` und vor `getById(row.id)`, falls `result.ok && belegArt && d.belegId`:
   - `belegArt === "angebot"` → `sendeAngebot(d.belegId)`
   - `belegArt === "rechnung"` → `sendeRechnung(d.belegId)`
   - Zusätzlich `emitBelegVersendet(belegArt, d.belegId)` für die SSE-Aktivitäts-Wireup.
   - Beide Repo-Funktionen sind idempotent (gating eingebaut), Mahn-Mails auf bereits-versendete Rechnungen ändern also nichts.

2. **`POST /email/versand/:id/retry`** — analog: nach erfolgreichem `sendNow` denselben Block ausführen, mit `belegArt`/`belegId` aus der `existing`-Zeile.

3. Imports am Dateikopf ergänzen:
   - `import { sendeAngebot } from "../belege/angebote-repo.js";`
   - `import { sendeRechnung } from "../belege/rechnungen-repo.js";`
   - `import { emitBelegVersendet } from "../belege/events.js";`

## Effekt

- Angebot / Rechnung springen sofort nach erfolgreichem Versand auf Status `versendet` mit korrektem `versendet_am`.
- FlowBar, Listen-Status-Pills, Dashboard "nächste Schritte" und der Mahn-Lifecycle (Fälligkeitsprüfung) funktionieren wieder korrekt.
- Keine Auto-Mail-Regel verletzt — Versand bleibt user-getriggert, nur die Status-Folge wird konsistent gemacht.
- Keine Migration, keine Frontend-Änderung nötig — Repo + SSE-Event reichen, das Frontend invalidiert ohnehin auf `beleg:mutated`.

## Risiken

- Keine. Beide `sende*`-Funktionen prüfen den aktuellen Status und sind no-ops, wenn der Beleg schon versendet/anderweitig fortgeschritten ist (z. B. Mahnungen auf `ueberfaellig`-Rechnungen).
