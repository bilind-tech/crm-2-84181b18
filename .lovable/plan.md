
# Finale Backend-Analyse vor Pi-Deployment

Ich habe Server-Bootstrap, Auth/Sessions, Backup/Restore, System-Update (ZIP + GitHub), Daten-Schutz-Wall, Crypto/Master-Key, Drive-OAuth, Mail-Versand, Cron-Scheduler, systemd-Unit und Install-Skript gründlich durchgesehen.

**Gesamtbild:** Sehr solide. Code/Daten-Trennung ist konsequent, Restore hat echten Rollback, Updates atomar via Symlink-Swap, Mail hart auf Manual-Only verriegelt, Master-Key sauber AES-256-GCM, alle gefährlichen Routen hinter `requireAuth`. Aber es gibt **konkrete Bugs und Härtungs-Lücken**, die vor dem Pi-Go-Live raus müssen.

---

## Findings

### KRITISCH — blockiert Pi-Betrieb

**1. `emailRoutes` ist nirgends registriert.**
`backend/src/routes/email.ts` exportiert `emailRoutes(app)`, aber `server.ts` ruft `app.register(emailRoutes)` nicht auf. Folge: alle `/email/*`-Routen liefern 404 → manueller Mail-Versand funktioniert auf dem Pi NICHT, SMTP-Test geht nicht, Vorlagen lassen sich nicht laden.

**2. systemd-Unit: CORS_ORIGINS falsch.**
Aktuell: `http://mycleancenter.local,http://mycleancenter.local:80`. Backend lauscht auf Port **8787**. Frontend wird vom Backend direkt ausgeliefert (gleicher Origin), aber bei Aufruf via LAN-IP statt mDNS bricht der Cookie-Flow. Korrekt: `http://mycleancenter.local:8787,http://<pi-lan-ip>:8787` und/oder klare Doku, dass ausschließlich `http://mycleancenter.local:8787` benutzt werden darf.

**3. systemd-Unit: keine Zeitzone gesetzt.**
Pi-OS-Default ist `Etc/UTC`. Backup-Cron um „03:00" läuft dann real um 04:00/05:00 Berliner Zeit. `Environment=TZ=Europe/Berlin` ergänzen.

**4. systemd-Unit: kein `GOOGLE_OAUTH_REDIRECT`.**
`getRedirectUri()` baut die URL aus dem Request-Host. Sobald der User Drive über IP statt mDNS verbindet, weicht der Redirect von Google's exact-match-Whitelist ab → OAuth-Fehler. Fix-URL via ENV erzwingen.

**5. Rate-Limit für Backup/Restore-Endpoints fehlt.**
`/backup/upload`, `/backup/:id/restore`, `/backup/upload/:uploadId/restore` haben nur das globale Limit (200/min). Diese Endpoints können die DB rotieren — auf 5/min limitieren.

### WICHTIG — Sicherheit

**6. Helmet ohne CSP.**
`helmet({ contentSecurityPolicy: false })` deaktiviert CSP komplett. Restriktive CSP setzen (`default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'`) — schützt gegen XSS aus Mail-/Mahn-Bodies.

**7. Drive-Backup enthält Master-Key im Klartext-tar.gz.**
Backup-Mirror lädt das tar.gz inkl. `keys/master.key` nach Google Drive. Damit ist der Drive-Account gleichwertig zum Pi-Zugang (entschlüsselt SMTP-Passwort, OAuth-Token, GitHub-PAT). Zwei Optionen:
   - **A (empfohlen, einfach):** Master-Key vor Drive-Upload aus dem Archiv entfernen, separater Wiederherstellungs-Code für den Key beim Restore.
   - **B (komplexer):** Zweite Verschlüsselungsschicht mit user-passwortabgeleitetem Key vor Drive-Upload.
   - **Minimum:** Klarer roter Disclaimer in der Drive-Einstellung („Backups in der Cloud enthalten den Master-Key — Drive-Konto ist sicherheitskritisch").

**8. Setup-Token-Datei nach Erst-Setup wirklich löschen.**
`install.sh` schreibt die Setup-URL inkl. Token in die Konsole. `markSetupComplete()` muss `data/keys/setup.token` von der Platte entfernen. Aktuell gegen-prüfen und ggf. nachziehen.

**9. Auth-Lockout pro IP zu hart für LAN-Single-User.**
5 Fehlversuche → 15 min Sperre pro IP. Im LAN sitzen alle Geräte hinter derselben IP — ein Tippfehler vom Handy sperrt den Desktop mit. Vorschlag: 10 Fehlversuche statt 5 (rate-limit fängt Bruteforce ohnehin ab).

### POLISH

**10. `npm ci`-Timeout im Update-Runner = 5 min.** Auf langsamer USB-SSD knapp. Auf 10 min hochsetzen.
**11. `purgeExpiredSessions()` räumt `lastTouchedAt`-Map nicht mit auf** → langsamer Memory-Leak über Wochen. Cache-Eintrag mit löschen.
**12. `cleanupOrphanRestoreTmp` muss auch `old/`-Reste älter 24h aufräumen** (nicht nur das tmp-Wurzelverzeichnis). Verifizieren.
**13. Update-Runner Step "migrations": `unlinkSync(tmpDb)` umgeht `safeUnlink`-Wrapper.** Zwar liegt der Pfad außerhalb dataDir, trotzdem konsistent durch den Wrapper schicken.
**14. Backup-Kategorien `pre-restore` und `safety` doppelt** — Verwirrung in der UI. Auf eine zusammenführen.
**15. `wrangler.jsonc` im Repo-Root** prüfen: wird das vom Build aktiviert? Wenn nicht relevant für Pi-Deploy → löschen, sonst Verwirrung.
**16. Drive-Token + GitHub-PAT haben keinen Rotations-Hinweis.** Settings sollten letzte-Verwendung anzeigen, damit der User merkt wenn ein Token abläuft.

---

## Umsetzungs-Plan

### Block A — Pflicht (KRITISCH, blockiert Pi)
1. `emailRoutes` in `server.ts` registrieren (1 Zeile + Import).
2. `backend/deploy/systemd/mycleancenter.service` aktualisieren:
   - `CORS_ORIGINS` korrigieren (Port 8787 + LAN-IP-Platzhalter mit Kommentar).
   - `Environment=TZ=Europe/Berlin` hinzufügen.
   - `Environment=GOOGLE_OAUTH_REDIRECT=http://mycleancenter.local:8787/einstellungen/google-drive/callback` hinzufügen.
3. Rate-Limits an `/backup/upload`, `/backup/:id/restore`, `/backup/upload/:uploadId/restore` (jeweils 5/min).

### Block B — Sicherheits-Härtung
4. Helmet mit restriktiver CSP konfigurieren.
5. Drive-Mirror: Master-Key vor Upload aus tar.gz entfernen + UI-Hinweis im Drive-Tab + Restore-Flow akzeptiert auch Backups ohne `keys/`.
6. `markSetupComplete()` löscht `setup.token`-Datei (verifizieren, ggf. fixen).
7. `purgeExpiredSessions()` räumt Touch-Cache mit auf.
8. `auth_lockout`: MAX_FAILS auf 10.

### Block C — Polish
9. `npm ci`-Timeout 10 min.
10. `cleanupOrphanRestoreTmp` deckt `old/`-Reste mit ab.
11. Update-Runner: `unlinkSync(tmpDb)` durch `safeUnlink`.
12. Backup-Kategorie `safety` entfernen, Pre-Restore-Backups landen direkt unter `pre-restore/`.
13. `wrangler.jsonc` löschen (sofern nicht vom Build aktiv genutzt).

### Block D — Pi-Deployment-Doku (Memory + README)
14. Schritt-für-Schritt-Anleitung in `mem://features/pi-deployment.md` ergänzen:
   - USB-SSD an `/var/lib/mycleancenter` mounten (fstab + `nofail`).
   - `sudo timedatectl set-timezone Europe/Berlin`.
   - Pi-Hostname auf `mycleancenter` + `avahi-daemon` aktiv.
   - Setup-Token-URL → Passwort + Recovery-Code aufschreiben.
   - Drive verbinden → erstes manuelles Backup → Restore-Test.
   - GitHub-PAT (Fine-grained, nur „Contents: Read") für Auto-Updates.

---

## Was bewusst NICHT angefasst wird

- Single-User-Modus, Recovery-Code, kein Username (Memory-konform).
- Mahn-Cron deaktiviert + `quelle==="cron"`-Guard (perfekt verriegelt).
- Atomarer Symlink-Swap im Update-Runner.
- Restore: zwingendes Sicherheits-Backup vorher.
- `assertCodeAndDataSeparated()` Boot-Hard-Fail.
- HMAC-signiertes Update-Manifest.
- AES-256-GCM für sensible Settings.

---

**Empfehlung:** Block A ist Pflicht (sonst kein Mail-Versand und kein LAN-Cookie), Block B sehr empfohlen (vor allem #5 Drive-Master-Key), Block C/D nice-to-have und kann auch nach Erst-Deploy nachgezogen werden.

Soll ich Block A+B sofort umsetzen, und C+D in einem zweiten Pass danach? Oder willst du alles in einem Rutsch?
