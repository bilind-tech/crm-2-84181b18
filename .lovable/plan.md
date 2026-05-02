## Step 6 — Mail (Strato) + Google Drive

Ziel: Rechnungs-/Angebots-PDFs per E-Mail verschicken (manuell + Daueraufträge) **und** automatisch nach Google Drive hochladen. Beides läuft als Queue mit Retry, idempotent, geräteübergreifend, Tokens verschlüsselt.

---

### 1. E-Mail-Versand (SMTP, Strato)

**Datenmodell** (Migration `009_email.sql`):
- `email_vorlagen`: id, name, betreff, body_html, kontext (`rechnung`/`angebot`/`mahnung`/`allgemein`), ist_standard, created_at, updated_at
- `email_signaturen`: id, name, html, ist_standard, created_at, updated_at
- `email_versand`: id, an, cc, bcc, betreff, body_html, anhaenge_json, status (`pending`/`sending`/`gesendet`/`fehler`), beleg_id?, beleg_art?, vorlage_id?, idempotenz_key UNIQUE, fehler_text?, versendet_am?, naechster_versuch_at?, versuche, created_at
- Indexe: `idempotenz_key`, `(status, naechster_versuch_at)`, `beleg_id`

**Backend-Module** (`backend/src/email/`):
- `transport.ts` — nodemailer-Singleton, baut Transport aus `setting.smtp` + `SENSITIVE_KEYS.smtpPassword` (entschlüsselt). Lazy + Reload bei Settings-Änderung.
- `templates.ts` — CRUD, Default-Vorlagen seeden (Rechnung, Angebot, Mahnung 1/2/3), Platzhalter-Engine (`{{kunde.name}}`, `{{beleg.nummer}}`, `{{firma.name}}`, …). Render via simpler Token-Replace, HTML-escape pro Wert, Whitelist statt eval.
- `signaturen.ts` — CRUD, ist_standard-Switch.
- `versand-repo.ts` — enqueue, list, byId, markRunning, markErfolg, markFehler (Backoff: 1m/5m/15m/1h/4h/24h, danach manuell).
- `attachments.ts` — holt Beleg-PDF via `renderAngebotPdf`/`renderRechnungPdf` aus Step 5 als Buffer, baut `nodemailer.Attachment`.
- `worker.ts` — `node-cron` alle 30 s: nimmt fällige Rows (`status=pending` AND `naechster_versuch_at<=now`), `LIMIT 5`, `FOR UPDATE`-Ersatz via SQLite `BEGIN IMMEDIATE` + Statusflip auf `sending`. Sendet, schreibt zurück. Doppel-Worker-Schutz via Prozess-Lock.
- `events.ts` — emittiert `email-versand-changed` für SSE (Step 8 später).

**Routes** (`backend/src/routes/email.ts`, requireAuth):
- `GET/POST/PATCH/DELETE /email/vorlagen[/:id]`
- `GET/POST/PATCH/DELETE /email/signaturen[/:id]`
- `GET /email/versand` (Filter: status, beleg_id, q, paginiert)
- `GET /email/versand/:id`
- `POST /email/versand` — body: `{ an, cc?, bcc?, betreff, bodyHtml, vorlageId?, signaturId?, belegArt?, belegId?, idempotenzKey }`. Bei `belegArt+belegId`: PDF wird beim Senden frisch geholt (immer aktuell).
- `POST /email/versand/:id/retry` — setzt `naechster_versuch_at=now`, Versuche bleiben.
- `POST /email/versand/:id/abbrechen`
- `POST /email/test` — Body `{ an }`, sendet Test-Mail synchron mit aktuellen SMTP-Settings, gibt Fehler 1:1 zurück.
- `PUT /einstellungen/smtp` (existiert) erweitert um Password-Setter (verschlüsselt) + Reset-Hook für Transport-Singleton.

**Sicherheit / Härtung**:
- SMTP-Passwort nie im GET zurückgeben (`isSet` reicht).
- Anti-Loop: gleicher `idempotenzKey` → 409.
- Rate-Limit auf `/email/test` (5/min).
- Body-HTML nur sanitized rendern (kein eval, keine externen Skripte).

---

### 2. Google Drive — OAuth + Upload-Queue

**Migration ergänzt 009**: `drive_upload_queue`: id, beleg_art, beleg_id, datei_name, idempotenz_key UNIQUE (`{belegnummer}-{sha256pdf}`), status, drive_file_id?, drive_web_link?, fehler_text?, versuche, naechster_versuch_at?, abgeschlossen_am?, created_at.

**Backend-Module** (`backend/src/drive/`):
- `oauth.ts` — `googleapis`-Client. `buildAuthUrl()` mit `scope=drive.file`, `access_type=offline`, `prompt=consent`. `exchangeCode(code)` → speichert Refresh-Token verschlüsselt unter `googleDrive.refreshToken`, Klartext-Email als `googleDrive.kontoEmail` in DB.
- `client.ts` — liefert authentisierten `drive_v3.Drive`-Client; refresht Access-Token automatisch. Bei `invalid_grant` → Status `disconnected` + Notiz im Log.
- `folders.ts` — `ensureRootFolder()`, `ensureMonthFolder(art, jahr, monat)`. Cached Folder-IDs im Setting `googleDrive.folderCache` (JSON: { rootId, "Rechnungen/2026/05": id, … }).
- `upload-repo.ts` — enqueue, fällige holen, status-flips, Backoff identisch zu Mail.
- `upload-worker.ts` — node-cron alle 60 s, parallel max 2. Holt PDF via Step-5-Renderer → `drive.files.create` (multipart, mit `parents`-Folder-ID + `name`). Schreibt `drive_file_id`/`webViewLink` zurück, emittiert `drive-upload-changed`.
- `events.ts` (für Step 8 SSE).

**Routes** (`backend/src/routes/drive.ts`, requireAuth außer Callback):
- `GET /einstellungen/google-drive` → `{ verbunden, kontoEmail?, rootOrdnerId?, letzteSynchronisation?, letzterFehler? }` (KEIN Refresh-Token).
- `POST /einstellungen/google-drive/connect` → `{ authorizeUrl }` (state = HMAC-signierter CSRF-Token aus Server-Secret).
- `GET /einstellungen/google-drive/callback?code&state` (PUBLIC, validiert state, tauscht Code, speichert Token, redirected zu `/einstellungen?tab=drive&status=ok|err`).
- `POST /einstellungen/google-drive/disconnect` → löscht Tokens + Folder-Cache, setzt Status.
- `POST /einstellungen/google-drive/test` → erstellt/aktualisiert Test-Datei `verbindungstest.txt` im Root.
- `GET /drive/uploads` (Filter: status, beleg_id), `POST /drive/uploads/:id/retry`.

**Auto-Enqueue-Hook**:
- In `belege/events.ts`: bei `mutated` mit `status === "versendet"` (Rechnung) bzw. `status === "akzeptiert"` (Angebot) → `enqueueDriveUpload(art, id)` (idempotent über UNIQUE-Key).
- Konfigurierbar via `setting.backup.driveUploadEnabled` (existiert bereits) — wenn `false`, Queue nicht befüllen.

**Sicherheit**:
- `client_id` + `client_secret` kommen aus DB (User trägt sie in Einstellungen ein, Secret verschlüsselt).
- Refresh-Token niemals loggen, nicht über GET zurückgeben.
- State-Token CSRF-geschützt + 10 min TTL.
- Scope minimal: `drive.file` (nur eigene Dateien).

---

### 3. Frontend-Anpassungen

- `src/lib/api/client.ts`: Pi-Prefixes ergänzen (`/email/`, `/drive/`).
- `src/components/email/EmailEinstellungen.tsx`: SMTP-Test-Button verdrahten, Passwort-Feld als „•••• gesetzt"/Edit.
- `src/components/einstellungen/GoogleDriveTab.tsx`: Connect/Disconnect/Test, Status-Pille, letzter Fehler, Upload-Queue-Liste mit Retry.
- `src/components/dokumente/DriveSyncBadge.tsx` + `src/components/pdf/DriveStatusBadge.tsx`: an `/drive/uploads?beleg_id=...` koppeln, dezenter Status (pending/erfolg/fehler).
- Neue Hook-Datei `src/hooks/useDrive.ts` (TanStack Query) — refetch alle 5 s wenn pending.
- Im Beleg-Detail: Button „Per E-Mail senden" öffnet Dialog mit Vorlagen-Auswahl + Empfänger (vorbelegt aus Kunde) + Vorschau; submit → `POST /email/versand` mit `belegArt+belegId+idempotenzKey=email-{belegnummer}-{ts}`.

---

### 4. Tests (`backend/test/email.spec.ts` + `drive.spec.ts`)

E-Mail:
- Vorlage-CRUD inkl. Default-Switch (genau eine `ist_standard` pro Kontext).
- Platzhalter-Render escaped HTML korrekt, unbekannte Token bleiben leer.
- Worker: pending → sending → erfolg (mit gemocktem Transport via `nodemailer.createTransport({ jsonTransport: true })`).
- Backoff bei Fehler, max-Versuche → manuell.
- Idempotenz-Key UNIQUE → 409.
- PDF-Anhang via Step-5-Renderer enthält `%PDF-`-Header.

Drive:
- OAuth-State HMAC verify, abgelaufener State → 400.
- Folder-Cache wird bei zweitem Upload nicht neu erstellt (Mock googleapis).
- Auto-Enqueue bei `rechnung.status=versendet`, idempotent bei Doppel-Mutation.
- Upload-Worker: success setzt `drive_file_id`, fehler setzt Backoff, `disconnect` invalidiert Tokens.

---

### 5. Memory-Updates

- Neue Datei `mem://features/backend-step6-mail-drive` mit Architektur-Zusammenfassung.
- Index-Eintrag „Step 6 — Mail+Drive".
- `mem://features/google-drive` aktualisieren: Routenpfade, Folder-Cache-Setting-Key, `drive.file`-Scope, Auto-Enqueue-Trigger.

---

### 6. Reihenfolge der Umsetzung (1 Prompt, ohne Rückfragen)

```
1. Migration 009 (email_*, drive_upload_queue) + Default-Vorlagen seed
2. backend/src/email/* (transport, templates, signaturen, versand-repo, attachments, worker, events)
3. backend/src/routes/email.ts + server.ts wiring + Worker-Start
4. backend/src/drive/* (oauth, client, folders, upload-repo, upload-worker, events)
5. backend/src/routes/drive.ts + server.ts wiring + Auto-Enqueue-Hook in belege/events
6. SmtpSettings-Reload-Hook bei PUT /einstellungen/smtp
7. Frontend: api/client.ts Prefixe, GoogleDriveTab, EmailEinstellungen-SMTP-Test, DriveSyncBadge, useDrive, „Per E-Mail senden"-Dialog im Beleg-Detail
8. Tests email.spec.ts + drive.spec.ts (mit nodemailer-jsonTransport + googleapis-mock)
9. mem-Updates
```

**Sag „weiter", dann lege ich mit Migration 009 + Mail-Modul los.**
