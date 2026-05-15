# Option A — Versendete E-Mails landen im Strato „Gesendet"-Ordner (IMAP-Append)

## Ziel & harte Regeln

- Jede E-Mail, die unser System per SMTP versendet, erscheint danach **automatisch im Strato-Webmail unter „Gesendet"** (und damit auch in Outlook/Handy via IMAP).
- **Niemals den Versand brechen.** SMTP ist die Wahrheit: Wenn die Mail rausgegangen ist, gilt sie als „erfolgreich versendet" — auch wenn das nachgelagerte IMAP-Append fehlschlägt. Der User sieht weiterhin den grünen Toast.
- Reuse der **bereits eingestellten SMTP-Credentials** (Benutzer + Passwort). Kein zweiter Login-Dialog, keine doppelte Konfiguration.
- Keine Berührung der Daten in `/var/lib/mycleancenter/`. Kein Schema-Bruch. Keine neuen Pflichtfelder. Keine UI-Pflichtklicks.

## Warum überhaupt IMAP-Append?

SMTP ist nur Versand — Strato sieht das nie als „von dir gesendet". Der „Gesendet"-Ordner im Webmail/Outlook wird ausschließlich befüllt, wenn ein IMAP-Client die Mail dort selbst per `APPEND` ablegt. Genau das machen wir jetzt im Backend nach jedem erfolgreichen `transport.sendMail(...)`.

Strato-Eckdaten (öffentlich dokumentiert, identische Credentials wie SMTP):
- Host: `imap.strato.de`
- Port: `993` (TLS, `secure: true`)
- Benutzer/Passwort: dieselben wie SMTP
- Sent-Ordner: meistens `Sent` oder `Gesendet` — wir erkennen ihn dynamisch über IMAP-`SPECIAL-USE \Sent`, mit Fallbacks.

## Architektur — minimal, isoliert, fehlertolerant

```text
sendNow(row)
   │
   ├─► transport.sendMail(...)          ← SMTP (unverändert, hartes „erfolgreich"-Kriterium)
   │
   └─► archiveToSentFolder(rawMime)     ← NEU, „fire-and-forget", non-blocking
          │
          ├─ IMAP-Connect (Pool, 1 Verbindung, Lazy-Init)
          ├─ Sent-Ordner ermitteln (\Sent SPECIAL-USE → "Sent" → "Gesendet" → "INBOX.Sent")
          ├─ APPEND mit Flag \Seen
          └─ Bei Fehler: leise loggen + Status in versand-Zeile vermerken,
             NIEMALS den Send-Result auf "fehler" kippen.
```

Die IMAP-Schicht lebt in **einer einzigen neuen Datei**: `backend/src/email/imap-archive.ts`. Kein anderer Code darf direkt mit IMAP reden.

## Änderungen im Detail

### 1) Neue Dependency
- `imapflow` (modernes, gepflegtes Promise-IMAP für Node, läuft sauber auf Pi/ARM, keine native Builds).
- Installation: `cd backend && bun add imapflow` (oder `npm install imapflow`).

### 2) Neue Datei `backend/src/email/imap-archive.ts`
Verantwortlich für **alles** rund um „Mail in Sent-Ordner ablegen":
- Re-uses `loadSmtpRuntime()` aus `transport.ts` für Benutzername + Absender, und `readSmtpPassword()` (intern) für das Passwort. Damit ist garantiert: **dieselben Credentials wie SMTP, keine Doppel-Eingabe.**
- IMAP-Host wird abgeleitet aus `smtp.host`:
  - `smtp.strato.de` → `imap.strato.de`
  - generischer Fallback: `smtp.X` → `imap.X`, sonst Wert aus optionalem Setting `imap.host`.
- Singleton-Connection mit `imapflow`-Client, Lazy-Open, automatisches Reconnect bei `NoConnect`.
- Funktion `appendToSent(rawMime: Buffer, opts?: { flags?: string[] })`:
  1. Verbindung sicherstellen.
  2. Sent-Ordner ermitteln (Cache nach erstem Erfolg):
     - `client.list({ statusQuery: { messages: false } })` und nach `\Sent` filtern.
     - Fallback-Reihenfolge: `Sent`, `Gesendet`, `INBOX.Sent`, `INBOX.Gesendet`.
  3. `client.append(folder, rawMime, ['\\Seen'], new Date())`.
  4. Timeout 15 s pro Operation.
- Funktion `resetImapClient()` — wird vom `PUT /einstellungen/smtp`-Endpoint mit aufgerufen, damit nach Konfig-Änderung die alte IMAP-Session entsorgt wird (analog zu `resetTransport()`).
- Funktion `verifyImap()` für späteren Test-Button (siehe optional).

### 3) Anpassung `backend/src/email/worker.ts` (sendNow)
Direkt nach erfolgreichem `transport.sendMail(...)`:

```ts
// Raw MIME mit nodemailer bauen, damit IMAP-Append IDENTISCH zur gesendeten Mail ist.
const built = await transport.sendMail({ ...sameOptions, ...attachments });
//   nodemailer liefert info.messageId; raw via "buildOnly"-Option erzeugen wir parallel:
const rawMime = await new Promise<Buffer>((resolve, reject) => {
  transport.sendMail({ ...sameOptions, attachments, _builderOnly: true } as any)... 
});
```

Konkrete Umsetzung — sauber, ohne Hack:
- `nodemailer` bietet `transport.sendMail(...)` und parallel **denselben Mail-Builder** über `mailer.use("compile", ...)` bzw. einfach `nodemailer.createTransport({ streamTransport: true, buffer: true }).sendMail(opts)` für die Raw-MIME-Erzeugung.
- Wir bauen einen **lokalen Stream-Transport** einmal als Singleton (`mimeBuilder`) und rufen ihn parallel/unmittelbar nach dem echten Send auf. Output: `info.message` (Buffer) — exakt das MIME, das auch verschickt wurde (gleicher Header inkl. `Message-ID`, weil wir die `Message-ID` aus dem echten Send mitgeben: `messageId: realInfo.messageId`).
- `archiveToSentFolder(rawMime)` wird **nicht awaited im kritischen Pfad**, sondern via `void appendToSent(...).catch(logQuietly)` aufgerufen → User-Antwort bleibt schnell.
- Optional kleine Verbesserung: 1 Retry nach 2 s bei IMAP-Fehler, danach aufgeben.

### 4) Erweiterung `email_versand`-Zeile (rein additiv, optional)
Neue Migration `022_email_imap_archive.sql`:
```sql
ALTER TABLE email_versand ADD COLUMN imap_archived INTEGER NOT NULL DEFAULT 0;
ALTER TABLE email_versand ADD COLUMN imap_archive_fehler TEXT NULL;
```
Beim erfolgreichen Append → `imap_archived = 1` setzen. Bei Fehler → Klartext in `imap_archive_fehler` schreiben. **Beides hat null Einfluss auf den Sende-Status der Mail.** Reines Audit/Diagnose.

### 5) Reset bei Konfig-Änderung
In `backend/src/routes/einstellungen.ts` (PUT /einstellungen/smtp und PUT /einstellungen/smtp/passwort): nach `resetTransport()` zusätzlich `resetImapClient()` aufrufen. Damit ist garantiert, dass eine geänderte Strato-Zugangsdaten-Eingabe sofort auch für IMAP greift.

### 6) Optional, aber empfohlen: Test-Button in Einstellungen
- Backend: `POST /email/imap/verify` → ruft `verifyImap()` auf, gibt `{ ok, latencyMs, sentFolder }` zurück.
- Frontend: in „Einstellungen → E-Mail" neben dem bestehenden „SMTP testen"-Button ein zweiter Button **„Sent-Ordner-Verbindung testen"**. Zeigt bei Erfolg z. B. `Verbunden mit imap.strato.de — Sent-Ordner: "Sent" (123 ms)`.
- Rein optional — wenn dir das zu viel ist, lassen wir es weg, der Versand funktioniert auch ohne.

## Sicherheits- & Stabilitätsgarantien

- **Versand kann durch IMAP NIE fehlschlagen.** `archiveToSentFolder` ist hinter `void ...catch(...)` entkoppelt, plus Timeout. Im worst case landet die Mail einfach nicht im Strato-Sent — der User hat aber trotzdem versendet.
- **Keine zusätzliche Klartext-Speicherung des Passworts.** Wir lesen das bereits verschlüsselte SMTP-Passwort über die existierende `decryptString`-Pipeline. Kein neuer Speicherort.
- **Single-Connection-Pool** (`maxConnections: 1`) — Strato mag keine parallelen IMAP-Sessions; passt zur SMTP-Strategie.
- **Idempotent**: Doppel-Append würde im worst case zwei identische Mails im Sent-Ordner erzeugen. Verhindern wir, indem wir das `imap_archived`-Flag prüfen, bevor wir bei einem Retry erneut anhängen.
- **Manual-Only-Garantie bleibt unangetastet.** Kein Cron, kein Hook, kein automatischer Trigger ruft IMAP. `archiveToSentFolder` läuft nur im selben Aufruf-Stack wie der User-getriggerte SMTP-Versand.

## Was NICHT angefasst wird

- `EmailVersandDialog.tsx`, `EmailVersandHistorie.tsx`, `versand-repo.ts` Status-Werte, `routes/email.ts` Antwort-Schema (außer optional 2 neue Felder spiegeln) — alles bleibt wie es ist.
- Kein Mahn-Cron, kein Auto-Versand, keine Datenmigration ausserhalb der einen ALTER TABLE.
- Keine Änderung am PDF-Renderer, am Drive-Upload, am Backup, am Auth, an UI-Layout.

## Deployment auf dem Pi

1. `cd backend && bun install` (zieht `imapflow` rein).
2. `bun run build` (Migration `022_email_imap_archive.sql` wird mitkopiert).
3. Standard-Update-Flow (Code in `/opt/mycleancenter/current/`, Daten in `/var/lib/mycleancenter/` unangetastet).
4. Beim ersten Start: Migration läuft, Spalten werden ergänzt — keine manuelle Aktion nötig.

## Verifikation (Akzeptanzkriterien)

1. **Echter Send aus dem CRM** → Strato-Webmail → „Gesendet" → Mail ist mit korrektem Empfänger, Betreff, Body und PDF-Anhang sichtbar (innerhalb weniger Sekunden).
2. **Outlook / iPhone Mail** → Sent-Ordner zeigt dieselbe Mail.
3. **Künstlicher IMAP-Fehler** (z. B. falscher IMAP-Host für 60 s) → SMTP-Versand bleibt grün, UI sagt „E-Mail versendet". In `email_versand` steht `imap_archived = 0` und `imap_archive_fehler = "..."`. **Kein roter Toast.**
4. **Konfig-Änderung** des SMTP-Passworts → nächste Mail landet weiterhin korrekt im Sent-Ordner (Reset hat gegriffen).
5. **PDF-Anhang** ist im Sent-Ordner identisch zur tatsächlich versendeten Mail (selber Hash).

## Was mache ich nicht ohne deine Freigabe

Du hast den Plan. Sag „los" und ich setze genau das um — keine Scope-Erweiterung, keine zusätzlichen Buttons außer dem optionalen Test-Button, den du explizit freigeben kannst.