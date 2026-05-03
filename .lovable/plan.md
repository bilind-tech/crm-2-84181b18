# SMTP / E-Mail-Versand — Stabilisierung & Korrektur

## Befund (was aktuell wirklich passiert)

Der „Manual-Only"-Schutz im Backend sitzt — aber **mehrere Verträge zwischen Frontend und Pi-Backend passen nicht zusammen**. Im Mock klappt der Flow, gegen das echte Backend würde Speichern/Senden mit 422 fehlschlagen.

### Kritische Mismatches

1. **SMTP-Settings — Feldnamen passen nicht**
   - Frontend sendet/erwartet: `server, port, ssl, benutzer, absenderName, absenderEmail, passwort, passwortGesetzt`
   - Backend (`SmtpSchema`) kennt: `host, port, secure, user, fromName, fromEmail, password, passwordIsSet`
   - Folge: Speichern überschreibt nichts, Anzeige ist leer, Verify ist „nicht konfiguriert".

2. **`POST /email/versand` — komplett anderer Body**
   - Frontend sendet: `{ belegTyp, belegId, kundeId, empfaenger[], cc[], bcc[], betreff, koerperHtml, vorlageId, signaturId, anhaenge[], mahnStufe }` — **ohne `idempotenzKey`**.
   - Backend `VersandSchema` erwartet: `{ empfaengerTo, empfaengerCc, empfaengerBcc, betreff, bodyHtml, belegArt, belegId, vorlageId, signaturId, idempotenzKey }`.
   - Folge: jede Mail → 422. Doppelklick-Schutz greift nicht, weil `idempotenzKey` fehlt.

3. **`mahnStufe`** wird vom Frontend mitgeschickt, das Backend kennt das Feld nicht. Mahn-Audit-Spur fehlt damit.

4. **Test-SMTP**: `useTestSmtp` ruft `/einstellungen/smtp/test` (reiner TCP-Connect, sagt nichts über Auth/TLS aus). Der echte Verify (`/email/verify`) ist bereits eingebaut, aber „Schnelltest" suggeriert Funktion ohne Aussagewert.

### Kleinere Findings

5. **Sparkles im SendOverlay** des `EmailVersandDialog` — verstößt gegen die Memory-Regel „Keine Sparkles/Deko-Icons".
6. **Gradient-Header** im `EmailVersandDialog` (`bg-gradient-to-br …`) — verstößt gegen „Dialoge ohne Gradient".
7. **`KeyCooldown.map`-Cleanup** läuft erst ab >1000 Einträgen → Memory-Drift möglich, harmlos aber unschön. Cleanup pro Aufruf billig machbar.
8. **`EmailVersandDialog` Stub-Kommentare** behaupten noch, alles ginge an Mock. Verwirrt zukünftige Wartung.
9. **Mock-Backend** (`/email/versand`) akzeptiert das alte Frontend-Schema → blendet das Vertragsproblem in der Preview weg. Sollte den realen Vertrag spiegeln, sonst fällt der Bug erst auf dem Pi auf.
10. **Audit-Log**: Beim echten Versand wird kein `audit({ action: "email.send" })` geschrieben — wir wollen aber nachweisen können, „wer/wann/wozu hat eine Mail rausgeschickt". Bei einer Funktion mit „darf niemals automatisch passieren" ist das Pflicht.

---

## Geplante Änderungen

### Backend

- **`backend/src/email/transport.ts`** unverändert (Vertrag bleibt bei `host/port/secure/user/...`).
- **`backend/src/routes/email.ts`**:
  - `VersandSchema` so erweitern, dass es **das tatsächliche UI-Schema** annimmt:
    `{ empfaenger[]|empfaengerTo, cc[]?, bcc[]?, betreff, bodyHtml|koerperHtml, belegArt|belegTyp, belegId?, vorlageId?, signaturId?, mahnStufe?, idempotenzKey? }`
    und intern auf das Repo-Schema normalisieren. Wenn `idempotenzKey` fehlt → server-seitig deterministisch erzeugen aus `belegArt+belegId+empfaenger+betreff-Hash` (Doppelklick-Schutz bleibt aktiv).
  - Beim erfolgreichen Versand `audit({ action: "email.send", details: { quelle:"manuell", belegArt, belegId, an, mahnStufe } })` schreiben — explizite Spur, dass die Mail per User-Klick raus ist.
  - `mahnStufe` als optionales Feld in der Versand-Tabelle protokollieren (neue Migration `021_email_mahnstufe.sql` mit `ALTER TABLE email_versand ADD COLUMN mahn_stufe INTEGER NULL`).
  - Hartes Verbot bleibt: `enqueueVersand` lehnt jede andere `quelle` weiter ab. Zusätzlich loggen wir bei Verstoßversuch `audit("email.send.blocked")`.
- **`backend/src/routes/einstellungen.ts`**:
  - `GET /einstellungen/smtp` zusätzlich „lovable-style" mappen → liefert beide Schreibweisen (`host`+`server`, `secure`+`ssl`, `user`+`benutzer`, `fromName`+`absenderName`, `fromEmail`+`absenderEmail`, `passwordIsSet`+`passwortGesetzt`). UI darf weiter ihre deutschen Felder verwenden, der Backend-Kern bleibt englisch.
  - `PATCH /einstellungen/smtp` akzeptiert beide Schreibweisen (Adapter-Layer am Eingang).
  - `POST /einstellungen/smtp/test` ersatzlos zur **Vorab-Connect-Diagnose** zurückgestuft („Server erreichbar?"), klar im Response-Text gekennzeichnet. Echter SMTP-Healthcheck = `/email/verify`.
- **Anti-Flood**: `KeyCooldown.tryTake` räumt jedes Mal abgelaufene Einträge auf (kostet O(n) nur einmal pro Minute pro Key, vernachlässigbar).

### Frontend

- **`src/lib/api/types.ts`** `SmtpEinstellungen` bleibt deutsch (UI-stabil) — Mapping liegt jetzt im Backend.
- **`src/hooks/useApi.ts`**:
  - `useTestSmtp` entfernen oder als „Schnellcheck (TCP)" umbenennen, **primärer Button bleibt `useVerifySmtp`**.
  - `useSendEmail`-Mutation um `idempotenzKey` erweitern (Frontend erzeugt einen pro Dialog-Öffnung + Empfänger-Hash).
- **`src/components/email/EmailVersandDialog.tsx`**:
  - Pro Versand `idempotenzKey = crypto.randomUUID()` mitgeben (in `handleSend`), wird nach Erfolg neu erzeugt.
  - **Sparkles raus** → ersatzlos, kleine `Check`-Animation reicht.
  - Gradient-Header → schlichter `bg-background` Header (Memory-Regel).
  - Stub-Kommentare oben löschen / aktualisieren („Geht direkt an Pi-Backend `/email/versand`").
  - Beim Schließen während `phase="sending"` → harter Block (bereits da, bleibt).
- **`src/components/email/EmailEinstellungen.tsx`**:
  - „Schnelltest"-Button entfernen, nur „Verbindung prüfen" (verify) + „Test-Mail senden" behalten — sauberer und unmissverständlich.
  - Status-Banner zeigt zusätzlich `passwordUpdatedAt`, falls vorhanden.

### Mock-Backend

- **`src/lib/mock/backend.ts`**:
  - `POST /email/versand` an den realen Vertrag anpassen (akzeptiert beide Schreibweisen, verlangt `idempotenzKey`-Verhalten via Hash-Fallback).
  - SMTP-GET/PATCH liefert `passwordIsSet` UND `passwortGesetzt` synchron — damit Preview & Pi identisch reagieren.

### Memory

- `mem://constraints/no-auto-email` bleibt; ergänzen um „Audit-Trail `email.send` ist verpflichtend, jede Mail muss eindeutig einer User-Aktion zugeordnet sein."

---

## Was bewusst NICHT geändert wird

- Keine Reaktivierung von Cron / Auto-Versand. Hard-Guard `quelle !== "manuell"` bleibt der einzige Sende-Pfad.
- Keine Hintergrund-Retry-Worker. `markFehler` schiebt Status weiterhin nur in `pending`/`manuell`; ein Retry passiert ausschließlich per User-Klick (`/email/versand/:id/retry`).
- Keine Änderung am Pool-Sizing (`maxConnections=1`, `maxMessages=50`, TLS≥1.2). Strato-konservativ bleibt.

---

## Reihenfolge der Umsetzung

1. Backend: Versand-Schema-Adapter + Audit + Migration 021.
2. Backend: SMTP-Settings-Adapter (deutsche/englische Aliase).
3. Frontend: `idempotenzKey` + Sparkles/Gradient-Cleanup im Dialog.
4. Frontend: Schnelltest-Button entfernen.
5. Mock-Backend an realen Vertrag angleichen.
6. Memory ergänzen.

Sag „weiter", dann setze ich Schritt 1–6 in einem Rutsch um.