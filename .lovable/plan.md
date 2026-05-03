
# Finaler Backend-Härtungs-Pass (vor Pi-Deploy)

Ziel: Vor dem Hochladen auf den Pi alle echten Risiken im Backend schließen. Strikt entlang der Kern-Regeln **Daten/Code-Trennung**, **niemals Auto-Mails**, **Backups dürfen nichts kaputt machen**, **Single-User**.

Status der Analyse: Architektur ist solide, Daten-Schutz im Update-Pfad ist hart abgesichert. Die Punkte unten sind konkrete Fund­stellen, nicht Refactoring.

---

## Kritisch (vor erstem Pi-Boot)

### K1 — DB-Pfad-Mismatch zwischen Backup und Live
- `config.dbPath` heißt `mycleancenter.db`.
- `backup/restore.ts` liest aber `db/mycleancenter.db` aus dem Archiv.
- `backup/create.ts` schreibt `db/mycleancenter.db` ins Archiv.
- Aktuell konsistent – aber `mem/features/backend-step2-backup-restore.md` und `pi-deployment.md` reden teilweise von `mycleancenter.sqlite`. Wir härten:
  - `config.ts`: zentrale Konstante `DB_FILENAME = "mycleancenter.db"`, überall verwenden.
  - `restore.ts`: Dateiname aus dieser Konstante lesen.
  - Test (`test/backup.spec.ts` ergänzen): Round-Trip Backup → Restore mit echter DB, prüft, dass die Datei auch wirklich gelesen wird.

### K2 — Restore: noch keine `safe*`-Guards
- Im Update-Runner laufen alle FS-Mutationen durch `assertNotInDataDir`.
- Im Restore-Flow (`backup/restore.ts`) wird direkt `renameSync`/`rmSync` benutzt — diese **müssen** im Daten-Verzeichnis schreiben (das ist der Sinn des Restores), aber sollten trotzdem durch eine **inverse Guard** gehen: „darf NUR innerhalb `config.dataDir` operieren, niemals außerhalb (z. B. nach `/opt/...` oder `/`)".
- Maßnahme: neue Funktion `assertInsideDataDir(path)` in `system/data-guard.ts`. `restore.ts` ruft sie für jeden Swap-Ziel-Pfad auf. Schützt vor Pfad-Manipulation aus einem manipulierten Backup (tar-Slip ist via `tar`-Lib gemildert, aber Defense-in-Depth).

### K3 — Drive-Backup enthält den Master-Key (aktuell nur Disclaimer)
- `backup/create.ts` packt `keys/master.key` mit ins Archiv. Das **muss** für lokale Restores so sein (sonst verschlüsselte Settings unbrauchbar). Aber: das Drive-Backup ist eine identische Kopie inkl. Key.
- Heute: rotes UI-Banner. Das ist zu wenig für „Pi geht in den Schrank".
- Lösung (kleinster sicherer Eingriff, ohne komplettes Key-Splitting):
  - In `drive-mirror.ts` vor dem Upload: tar im Stream entpacken, `keys/`-Ordner entfernen, neu packen → upload. ODER (einfacher): zweite AES-GCM-Schicht über das gesamte tar.gz mit Passphrase aus dem Recovery-Code-Hash (User kennt ihn beim Restore aus Drive).
  - MVP-Variante: **Variante A (Key entfernen)**. Wenn der User aus Drive restored, fragt das Restore-UI explizit nach dem Recovery-Code → daraus wird der Master-Key NICHT abgeleitet, sondern der User akzeptiert einen Soft-Reset der verschlüsselten Settings (SMTP-Passwort + Drive-Token müssen einmalig neu eingegeben werden). Das ist ehrlich und sicher.
  - Status `drive_status`-Spalte unverändert.

### K4 — `install.sh` kann den Setup-Token-Link kaputt drucken
- Token enthält base64url-Zeichen, aber das Heredoc bricht bei langem Token die Box (Zeile mit `│  http://...:8787/setup?token=…` ohne schließendes `│`). Kosmetik, aber Erstkontakt-Erlebnis.
- Maßnahme: Box weglassen, schlichte 3-Zeilen-Ausgabe drucken.

### K5 — `frontendDir`-Default zeigt im Dev auf `..../dist`, in Prod auf `/opt/.../current/dist`
- systemd-Unit setzt `FRONTEND_DIR=/opt/mycleancenter/current/dist`. Korrekt.
- Aber `release-bundle` legt das Frontend unter `dist/`. Beim Pi-Bootstrap via `--bootstrap=release.zip` wird `dist/` direkt unter `releases/initial/` entpackt — nicht unter `releases/initial/dist`. Bitte verifizieren über `scripts/build-release.ts` (kurz lesen) und ggf. `FRONTEND_DIR` an die tatsächliche Struktur anpassen oder das Release-ZIP so bauen, dass `dist/` als Top-Level-Eintrag drin ist.

---

## Wichtig (Sicherheit / Robustheit)

### W1 — `helmet` CSP `connect-src 'self'`
- `'self'` reicht im LAN. Aber Drive-Status-Polling vom Frontend macht keine externen Calls (alles geht durch das eigene Backend), also ok. Nur dokumentieren in `mem/features/pi-deployment.md`, damit niemand später CDN-Fonts addiert und sich wundert.

### W2 — Cookie `sameSite: "lax"` ist ok, aber `secure: true` nur in Production
- Auf dem Pi läuft alles über HTTP im LAN. Das heißt `secure: false` und Cookies fliegen unverschlüsselt. Akzeptiert (LAN, Single-User). Trotzdem: README-Eintrag „kein WAN-Exposure ohne Reverse-Proxy mit TLS".

### W3 — Background-Sweep läuft alle 10 min, Touch-Cache wächst potenziell unbegrenzt
- `lastTouchedAt` Map wird in `purgeExpiredSessions` mitgeräumt — gut. Aber bei vielen Sessions ohne Expiry-Lauf wächst sie nur. Bei Single-User unkritisch. Kein Code-Change, nur Hinweis im Memory.

### W4 — `/health` ist auth-frei (gewollt für Update-Smoketest)
- Liefert `dataDir`, `schemaVersion` u. ä. zurück. Sollte aus dem LAN ok sein, aber auf dem Pi ggf. hinter `localhost`-only binden für `/health`. **Nicht ändern** — `install.sh` curlt es per `curl localhost:8787/health`. Nur dokumentieren.

### W5 — Rate-Limit global = 200/min, login = 10/min, recovery = 5/min, backup-write = 5/min
- Passt für Single-User im LAN.
- Ergänzen: `/auth/setup` ebenfalls 5/min (verhindert Setup-Token-Bruteforce).

---

## Polish (kann auch nach Erst-Deploy)

### P1 — `npm ci` Timeout 10 min im Update-Runner ist ok, Buffer 50 MB ebenfalls
- Keine Änderung.

### P2 — Tests für Daten-Guard
- `test/system-update.spec.ts` um einen Negativtest erweitern: Update-Runner mit präparierter `paths`-Override, der einen Pfad innerhalb `dataDir` zurückgibt → muss werfen, kein Schreibvorgang.

### P3 — `wrangler.jsonc` im Repo-Root liegt rum
- Wir laufen weder auf Cloudflare noch auf TanStack-Start-Server-Functions (Backend ist Fastify auf dem Pi). Datei löschen, damit niemand sie versehentlich für Pi-Deployments anfasst.

### P4 — Mehrere Backup-Kategorien `pre-restore` + `safety` halten getrennt
- Beide zeigen „Sicherheits-Backup" im UI. Bewusste Trennung (pre-restore vor Restore, safety vor Update). Keine Konsolidierung — wer Auditieren muss, will die Quelle sehen.

---

## Reihenfolge für den nächsten Default-Mode-Pass

1. **K1 + K2 + K5** (kleine, lokale Code-Edits + 1 neuer Test) — 1 Pass.
2. **K3 Variante A** (Drive-Mirror entfernt `keys/`, Restore-UI fragt vor Drive-Restore „SMTP-/Drive-Token müssen neu eingegeben werden, weiter?") — 1 Pass.
3. **K4 + P3** (Install-Skript-Polish, wrangler.jsonc weg) — 1 Pass.
4. **W4 + W2 Doku** in `mem/features/pi-deployment.md` (kein Code).

Danach Pi-Deploy.

## Was bewusst nicht passiert

- Kein Refactoring von `runner.ts` oder `restore.ts` — die Logik ist solide, die Guards sitzen.
- Kein Aufsplitten von Master-Key (echte Trennung Key/Backup) — kommt erst nach dem ersten Pi-Lauf, weil es einen eigenen Recovery-Flow für den Key braucht.
- Keine Änderungen am Mahn-/Mail-Pfad — drei Schutzschichten reichen, jede Erweiterung birgt nur Risiko.

**OK so?** Wenn ja, gehe ich K1–K5 in einem Pass durch, danach K3 separat (weil UI mitkommt).
