
# Step 16 — Setup-Wizard, Login-UI, Recovery & Multi-User

Das Backend kann seit Step 1 anmelden (`/auth/setup`, `/auth/login`, `/auth/me`,
`/auth/logout`, `/auth/passwort-aendern`), Sessions verwalten, Lockouts und Audit
schreiben. Frontend hat dafür **bislang keine UI** — alle Routen sind ungeschützt
und der Setup-Token muss bisher von Hand aus `/var/lib/mycleancenter/keys/setup.token`
gelesen werden. Step 16 schließt diese Lücke und macht das CRM für nicht-technische
Nutzer erstinstallierbar und alltagstauglich.

## Ziele

1. **Erstinbetriebnahme im Browser**: Setup-Wizard statt Login-Screen, wenn `/auth/me` mit `needs-setup` antwortet.
2. **Recovery-Code**: einmalig beim Setup angezeigt, ermöglicht Passwort-Reset ohne Pi-SSH.
3. **Login + Auth-Guard**: alle CRM-Routen geschützt, schöner Login mit Lockout-Anzeige.
4. **Session-Sichtbarkeit**: aktive Sessions in Topbar + Einstellungen, „Auf allen Geräten abmelden".
5. **Mehrbenutzer + Rollen**: Owner kann weitere Mitarbeiter anlegen (Rolle `owner` / `mitarbeiter`), Mitarbeiter sehen Stammdaten/Belege, aber keine Steuern/Backups/System-Updates.
6. **Disclaimer respektieren**: Auth-State ist Single-Source-of-Truth = Backend; clientseitiger State ist nur Cache.

## Umfang

### A — Backend-Erweiterungen

`backend/src/db/migrations/016_recovery_und_rollen.sql`:
- `app_user` bekommt Spalten:
  - `rolle TEXT NOT NULL DEFAULT 'mitarbeiter' CHECK(rolle IN ('owner','mitarbeiter'))`
  - `recovery_hash TEXT` (Argon2-Hash des einmaligen Recovery-Codes)
  - `recovery_used_at TEXT` (NULL = noch gültig)
  - `aktiv INTEGER NOT NULL DEFAULT 1`
  - `letzte_aktivitaet TEXT`
- Ersten User aus dem Setup automatisch auf `rolle='owner'` setzen.
- Constraint: mindestens 1 aktiver Owner muss bleiben (Trigger oder Repo-Check).

`backend/src/auth/recovery.ts` (neu):
- `generateRecoveryCode()`: 24 Zeichen, Format `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX` aus `crypto.randomBytes` (Base32 ohne mehrdeutige Zeichen).
- `hashRecovery(code)`, `verifyRecovery(hash, code)` via Argon2.
- `consumeRecovery(userId, code, neuesPasswort)`: prüft + setzt neues Passwort + invalidiert.

`backend/src/auth/users-repo.ts` (neu): CRUD für app_user mit Rollen-Logik (Owner-Schutz, Self-Lock-Out-Schutz).

Routen-Erweiterung in `backend/src/routes/auth.ts`:
- `POST /auth/setup` Response: `{ user, recoveryCode }` (einmalig im Klartext).
- `POST /auth/recovery/anfordern` (rate-limited 3/min/IP): `{ username }` → falls vorhanden, kein Hinweis (timing-konstant), gibt nur `{ ok: true }` zurück (Code muss ja schon beim Setup notiert worden sein — kein E-Mail-Versand).
- `POST /auth/recovery/verwenden`: `{ username, recoveryCode, neuesPasswort }` → setzt neues Passwort, beendet alle bestehenden Sessions, gibt neuen Recovery-Code aus.
- `GET /auth/sessions` (auth required): aktive Sessions des aktuellen Users (id, userAgent, ip, createdAt, expiresAt, currentSession=true für die eigene).
- `DELETE /auth/sessions` (alle außer aktuelle) und `DELETE /auth/sessions/:id`.
- `POST /auth/recovery/regenerieren` (auth required): neuen Recovery-Code für eigenen Account erzeugen.

Neuer Routen-Block `backend/src/routes/benutzer.ts` (Owner-only via Middleware):
- `GET /benutzer` — Liste aktiver/inaktiver Mitarbeiter.
- `POST /benutzer` — neuen anlegen, generiert Initial-Passwort + Recovery-Code → einmalige Anzeige.
- `PATCH /benutzer/:id` — Rolle / aktiv-Flag ändern (nicht sich selbst auf inaktiv).
- `POST /benutzer/:id/passwort-zuruecksetzen` — Owner-Override, neues Initial-Passwort.
- `DELETE /benutzer/:id` — soft-delete via `aktiv=0` (echtes DELETE nur wenn keine Audit-Refs).

Middleware `requireOwner` ergänzen (nutzt vorhandene `requireAuth`).

### B — Frontend Auth-Layer

`src/lib/auth/AuthContext.tsx` (neu):
- React-Context `AuthProvider` mit `useAuth()`.
- Lädt `/auth/me` beim Mount, verwaltet `status: "loading" | "needs-setup" | "anonymous" | "authenticated"`.
- Methoden: `login`, `logout`, `setup`, `recovery`, `refresh`.
- 401 von beliebigem API-Call → setzt `status="anonymous"` (zentral via `apiClient` Interceptor).
- TanStack Query: `qk.auth = { me, sessions, benutzer }`.

`src/router.tsx`: Auth-State in `RouterContext` (laut TanStack-Pattern aus Useful-Context).

`src/routes/__root.tsx`: rendert je nach `auth.status`:
- `loading` → Splash mit Spinner.
- `needs-setup` → erzwingt `/setup` (redirect via `useEffect` + `Navigate`, kein Outlet).
- `anonymous` → erzwingt `/login` (außer Pfade `/login`, `/setup`, `/recovery`).
- `authenticated` → normaler Outlet.

### C — Setup-Wizard `/src/routes/setup.tsx`

4 Schritte (Stepper-UI mit `FlowBar`-Mini-Variante), Backend-Token wird per **3 Methoden** erkannt:
1. `?token=…` URL-Param (kommt aus install.sh-Output → wird im Healthcheck-Erfolgs-Banner als anklickbarer Link gezeigt; install.sh schreibt zusätzlich `setup.token` ins Pi-Terminal).
2. Manuelle Eingabe (Textfeld, mit „Token aus Datei kopieren"-Hinweis: Pfad `/var/lib/mycleancenter/keys/setup.token`).
3. *Nicht* automatisch übernommen (Sicherheit).

Schritte:
1. **Willkommen + Setup-Token-Eingabe** → Token-Vorab-Validierung über `/auth/me` Status.
2. **Owner-Account anlegen**: Username + Passwort (mit Live-Policy-Check) + Bestätigung. Submit ruft `/auth/setup`. Antwort enthält `recoveryCode`.
3. **Recovery-Code anzeigen** (einmalig, dick, Monospace, „Drucken"-Button öffnet `window.print()` mit Print-CSS, „Bestätigen, dass ich den Code gespeichert habe"-Checkbox als Submit-Voraussetzung).
4. **Firmenstammdaten** (Pflicht: Firmenname, Anschrift, USt-ID/Steuernummer, Bankverbindung). Speichert via existierendes `/einstellungen/firma`. Optional übersprungen → Hinweis-Banner im Dashboard.

Nach Abschluss: redirect `/`.

SMTP + Drive-Connect bewusst **NICHT** im Wizard — bleiben in Einstellungen, Dashboard zeigt Banner „Diese Schritte fehlen noch".

### D — Login `/src/routes/login.tsx`

- Username + Passwort.
- Bei 423 Lockout: zeigt Countdown bis `lockedUntil`.
- Bei 401: zeigt generischen Fehler („Anmeldung fehlgeschlagen"), kein Hinweis, was falsch war.
- Footer-Link: „Passwort vergessen → Recovery-Code verwenden" → `/recovery`.

### E — Recovery `/src/routes/recovery.tsx`

- Username + Recovery-Code-Eingabe (mit Auto-Format der Bindestriche) + neues Passwort + Bestätigung.
- Submit `/auth/recovery/verwenden`. Erfolg: zeigt **neuen** Recovery-Code (alter ist verbraucht), Pflicht-Bestätigungs-Checkbox, dann redirect `/login`.

### F — Topbar + Einstellungen

`src/components/layout/Topbar.tsx`:
- User-Menu (Avatar mit Initialen) → Dropdown:
  - „Eingeloggt als <username> (owner|mitarbeiter)"
  - „Passwort ändern" → Dialog
  - „Recovery-Code neu erzeugen" → Dialog mit Bestätigung (alter wird ungültig!)
  - „Aktive Sessions verwalten" → Dialog mit Liste
  - „Abmelden" / „Auf allen Geräten abmelden"

`src/components/einstellungen/SicherheitTab.tsx` (neu, eigener Tab in `/einstellungen`):
- Sektion „Mein Konto": Passwort, Recovery, Sessions (gleiche Aktionen wie Topbar, ausführlicher).
- Sektion „Benutzer & Rollen" (nur Owner sichtbar): Tabelle aller Mitarbeiter, Anlegen/Deaktivieren/Rolle ändern/Passwort zurücksetzen.

### G — Rollen-Schutz im Frontend

`src/lib/auth/permissions.ts`:
- `kann(action, user)`: `"backup.verwalten"`, `"system.update"`, `"steuern.verwalten"`, `"benutzer.verwalten"` → `owner`-only.
- Helper `<NurFuerOwner>` Component.
- Tabs in `/einstellungen` (Backup, System, Steuern, Sicherheit/Benutzer) für Mitarbeiter ausgeblendet.
- Backend setzt zusätzlich Hard-Block via `requireOwner` Middleware in betroffenen Routen — Frontend-Schutz ist nur UI-Komfort.

### H — Tests

`backend/test/auth-recovery.spec.ts` (neu):
- Setup gibt Recovery-Code zurück, der mit `/auth/recovery/verwenden` einmalig nutzbar ist.
- Verbrauchter Code wird abgelehnt.
- `recovery/regenerieren` invalidiert alten.
- Rate-Limit greift bei `recovery/verwenden`.

`backend/test/auth-rollen.spec.ts` (neu):
- Mitarbeiter kann nicht `/system/*`, `/backup/*`, `/steuern/*`, `/benutzer/*` aufrufen → 403.
- Letzten aktiven Owner kann man nicht deaktivieren → 409.
- Owner kann Mitarbeiter anlegen, deaktivieren, Passwort resetten.

### I — install.sh Integration

`backend/deploy/install.sh` Healthcheck-Erfolgsausgabe ergänzen:
```
Setup-URL: http://<hostname>:8787/setup?token=<aus setup.token>
```
- Liest Token aus `$DATA_DIR/keys/setup.token` (falls vorhanden).
- Druckt zusätzlich Pfad und Hinweis.

## Was NICHT in Step 16

- E-Mail-basierter Passwort-Reset (Pi hat oft keinen MX, Recovery-Code ist sicherer).
- 2FA / TOTP — späterer Step, falls gewünscht.
- LDAP/SSO — Single-User-Pi-Szenario ist anders.
- Granulare Permissions pro Modul über `mitarbeiter` hinaus.

## Akzeptanzkriterien

1. Frischer Pi nach Bootstrap → Browser-Aufruf landet automatisch im Setup-Wizard.
2. Setup-Token wird einmal verwendet, danach gelöscht (Backend-Verhalten besteht).
3. Recovery-Code wird beim Setup einmalig angezeigt, kann gedruckt werden, ist 24-Zeichen-Format mit Bindestrichen.
4. Mit Recovery-Code kann ohne SSH ein neues Passwort gesetzt werden, alter Code wird ungültig.
5. Alle CRM-Routen sind hinter Login-Guard, anonymer Zugriff → `/login`.
6. Lockout (5 Fehlversuche) zeigt Countdown im UI.
7. Owner sieht Tabs „Backup, System, Steuern, Sicherheit/Benutzer", Mitarbeiter nicht.
8. Letzter aktiver Owner kann nicht deaktiviert oder degradiert werden.
9. „Auf allen Geräten abmelden" beendet alle anderen Sessions sofort, eigene bleibt.
10. Tests `auth-recovery.spec.ts` + `auth-rollen.spec.ts` grün.

## Geänderte / neue Dateien

**Backend neu:**
- `backend/src/db/migrations/016_recovery_und_rollen.sql`
- `backend/src/auth/recovery.ts`
- `backend/src/auth/users-repo.ts`
- `backend/src/routes/benutzer.ts`
- `backend/test/auth-recovery.spec.ts`
- `backend/test/auth-rollen.spec.ts`

**Backend editiert:**
- `backend/src/routes/auth.ts` (neue Endpoints, Setup-Antwort mit Recovery)
- `backend/src/auth/middleware.ts` (`requireOwner`)
- `backend/src/auth/sessions.ts` (List + Delete-by-id)
- `backend/src/server.ts` (benutzerRoutes registrieren)
- `backend/deploy/install.sh` (Setup-URL-Ausgabe)

**Frontend neu:**
- `src/lib/auth/AuthContext.tsx`
- `src/lib/auth/permissions.ts`
- `src/lib/auth/api.ts` (typed wrappers)
- `src/routes/login.tsx`
- `src/routes/setup.tsx`
- `src/routes/recovery.tsx`
- `src/components/auth/PasswortAendernDialog.tsx`
- `src/components/auth/SessionsDialog.tsx`
- `src/components/auth/RecoveryNeuDialog.tsx`
- `src/components/einstellungen/SicherheitTab.tsx`
- `src/components/benutzer/BenutzerListe.tsx`
- `src/components/benutzer/BenutzerAnlegenDialog.tsx`

**Frontend editiert:**
- `src/router.tsx` (Auth-Context im RouterContext)
- `src/routes/__root.tsx` (Auth-Gate)
- `src/lib/api/client.ts` (401-Interceptor → AuthContext informieren)
- `src/components/layout/Topbar.tsx` (User-Menu)
- `src/routes/einstellungen.tsx` (neuer Tab Sicherheit + Owner-only Tabs filtern)

---

**Sag „los Step 16", dann setze ich um.**
