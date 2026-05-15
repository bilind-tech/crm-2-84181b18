# Plan: „Versand fehlgeschlagen: Unbekannter Fehler" beheben

## Was wirklich passiert

Das vorherige `require`-Problem ist gelöst — der PDF-Drucker läuft, das Backend antwortet jetzt sauber. Der jetzt sichtbare Fehler kommt **nicht mehr vom Backend, sondern vom Frontend**, das die Antwort falsch interpretiert.

## Ursache (mit Belegen)

Backend (`backend/src/routes/email.ts`, Zeile 222–229) antwortet bei Erfolg mit HTTP **201** und folgendem Body:

```ts
{ ...row, sendOk: true, sendError: undefined, sendErrorCode: undefined }
```

`row.status` aus der DB ist im **deutschen** Wertebereich:
`"pending" | "sending" | "gesendet" | "manuell"` (siehe `backend/src/email/versand-repo.ts`).
Bei einem echten Sendefehler liefert es HTTP **502** mit `sendOk:false, sendError:"…", sendErrorCode:"…"`.

Frontend dagegen prüft in `EmailVersandDialog.tsx`:
- Zeile 281: `if (res.status === "sent")` — der englische Wert kommt nie vom Pi.
- Zeile 294: Wenn ungleich `"sent"` → Toast `Versand fehlgeschlagen: ${res.fehlerGrund ?? "Unbekannter Fehler"}`.
- Das Feld heißt im Backend aber `fehlerText`, nicht `fehlerGrund`.

Auch der TypeScript-Typ ist falsch (`src/lib/api/types.ts` Z. 565):
```ts
export type EmailVersandStatus = "queued" | "sending" | "sent" | "failed";
```
Die echten Werte sind `"pending" | "sending" | "gesendet" | "manuell"`.

**Konsequenz:** Selbst wenn die E-Mail erfolgreich verschickt wurde (HTTP 201, `sendOk:true`, `status:"gesendet"`), zeigt das UI „Versand fehlgeschlagen: Unbekannter Fehler". Der vorherige `require`-Fix hat die Mail real ausgeliefert — das UI hat das nur nicht erkannt.

## Fix — minimal, nur Frontend

Drei kleine Änderungen, kein Backend-Touch, kein Datenmodell:

### 1) `src/lib/api/types.ts`
- `EmailVersandStatus` auf die echten Werte ändern:
  ```ts
  export type EmailVersandStatus = "pending" | "sending" | "gesendet" | "manuell";
  ```
- Im `EmailVersand`-Interface das Feld `fehlerGrund?: string` umbenennen / ergänzen zu `fehlerText?: string` (passend zum Backend-Mapping).
- Optionale Antwort-Zusatzfelder ergänzen, damit das Versand-Endpoint-Result typisiert ist:
  ```ts
  sendOk?: boolean;
  sendError?: string;
  sendErrorCode?: string;
  ```

### 2) `src/components/email/EmailVersandDialog.tsx`
- Zeile 281: Erfolgskriterium auf das tatsächliche Backend-Schema umstellen:
  ```ts
  if (res.sendOk === true || res.status === "gesendet")
  ```
- Zeile 294: Fehlertext aus den realen Feldern ziehen:
  ```ts
  toast.error(`Versand fehlgeschlagen: ${res.sendError ?? res.fehlerText ?? "Unbekannter Fehler"}`);
  ```

### 3) Andere Stellen, die noch `"sent"`/`"failed"`/`fehlerGrund` lesen
Kurze Suche und Anpassung in betroffenen Dateien (`MahnSektion`, ggf. Listen/Filter, `types.ts`-Konsumenten):
- `=== "sent"` → `=== "gesendet"`
- `=== "failed"` → `=== "manuell"`
- `.fehlerGrund` → `.fehlerText`

Nur Lesepfade, keine Logikänderung. Falls in der DB-/API-Seed-Schicht (`localPreviewData`) Mock-Werte mit `"sent"` stehen, dort ebenfalls auf `"gesendet"` ändern, damit Preview und Pi konsistent sind.

## Was NICHT angefasst wird

- Kein Backend-Code (`backend/**`), kein Datenbank-Schema, keine Migration.
- Keine Änderung am `piClient.ts` (zeigt bereits `sendError` korrekt im Fehlerfall an).
- Keine Änderung am PDF-Renderer, an Detailseiten, am PDF-Editor oder an der Vorschau.
- Keine neuen Dependencies, keine Versionsbumps.

## Deployment

Nur Frontend-Änderung. Auf dem Pi: nach Update den Frontend-Build deployen wie üblich (Code in `/opt/mycleancenter/current/`, Daten in `/var/lib/mycleancenter/` werden nicht berührt — Regel eingehalten).

## Verifikation

1. „E-Mail senden" auslösen.
2. Erwartet: Toast „E-Mail versendet" + Erfolgs-Animation, Dialog schließt.
3. SMTP-Fehler künstlich provozieren (z. B. falsches Passwort temporär): Erwartet konkrete Server-Message statt „Unbekannter Fehler".
4. Liste „Versand"-Status zeigt deutsche Werte korrekt an.
