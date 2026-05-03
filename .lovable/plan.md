## Ziel

Frontend final auf Produktionsbetrieb stellen: alle Demo-/Mock-/Schnell-Login-Spuren raus, der dezente Status-Punkt unten rechts entfernt (Pi-Status in der Sidebar bleibt), und der echte Erst-Setup-Flow auf dem Pi (Setup-Token → Passwort → Recovery-Code → verschlüsselter Login) durchgängig prüfen.

---

### Block 1 — Mock/Demo-Modus aus der App entfernen

**1.1 Mock-Routing im API-Client abschalten**
`src/lib/api/client.ts`
- `USE_MOCK` und alle `mockBackend(...)`-Fallbacks entfernen.
- `viaMockOrPi` → nur noch `viaPi` (bzw. direkt `piApi`).
- Demo-Sonderfall in `viaPi` (kein `isBackendUrlExplicit()` → Mock) entfernen — bei fehlender URL wird stattdessen ein klarer Setup-Hinweis im UI gezeigt.
- `api.isMock` Flag entfernen.

**1.2 Mock-Auth-Modus aus Auth-Provider entfernen**
`src/lib/auth.tsx`
- `AuthMode` ohne `"mock-lock"`.
- `refreshMe`: Wenn `!isBackendUrlExplicit()`, Modus → `"backend-offline"` (statt `mock-lock`) — der Offline-Screen führt den User in „Einstellungen → Backend-Verbindung" und zur Erst-Einrichtung.
- `unlock(...)` (Mock-Pfad mit `/auth/unlock` + Pseudo-User „Demo") komplett raus.
- `lock()`: nur noch echter `logout()` (Backend-Session beenden) — kein „mock-lock"-Sonderzweig mehr.

**1.3 Mock-Module/-Seeds löschen**
- Dateien entfernen: `src/lib/mock/backend.ts`, `src/lib/mock/seed.ts`, `src/lib/mock/scheduler.ts`.
- Die noch davon abhängige Hilfsfunktion `summenRechnung` in ein neutrales Modul `src/lib/belege/summen.ts` verschieben (Datentypen aus `@/lib/api/types`, keine Mock-Abhängigkeit).
- Alle Importe umbiegen: `kunden.$id.tsx`, `rechnungen.$id.tsx`, `angebote.$id.tsx`, `lib/email/placeholders.ts`, `lib/steuern/{export,berechnung}.ts`, `lib/flow/flows.ts`, `lib/mahnung/regeln.ts`, `components/forms/ZahlungErfassenDialog.tsx`, `components/dauerauftrag/RechnungAusDauerauftragDialog.tsx`.
- `src/routes/__root.tsx`: `startScheduler()` aus `lib/mock/scheduler` entfernen.
- `src/lib/dokument/upload.ts`: Mock-Fallback streichen, bei fehlendem Backend echten Fehler werfen.

**1.4 Demo-Hinweise und Schnell-Login im LockScreen löschen**
`src/components/layout/LockScreen.tsx`
- `MockLockForm` (inkl. „Schnell-Login (DEV)"-Button mit hartcodiertem `040506`) komplett entfernen.
- `LockScreen()`-Switch: Default-Zweig nicht mehr `MockLockForm`, sondern `BackendOfflineScreen` (denn ohne Pi-URL gibt es keinen sinnvollen anderen Zustand).
- Demo-Hinweistext „Demo-Modus — kein Pi-Backend hinterlegt" entfernen.

**1.5 Demo-Hinweise in Email-UI entfernen**
- `src/components/email/EmailVersandDialog.tsx`: `demoModus`-Flag, Banner und Disable-Logik entfernen — Versand läuft immer gegen das Backend.
- `src/components/email/EmailEinstellungen.tsx`: `demoModus`-Flag und zugehörige Hinweisbox entfernen.

**1.6 „Demo-Daten löschen"-Karte entfernen**
- Datei `src/components/einstellungen/MockDataResetCard.tsx` löschen.
- `src/components/einstellungen/BackendVerbindungTab.tsx`: Import + `<MockDataResetCard />` raus.
- Zusätzlich beim ersten Start einmalig im Browser alte `mcc_mock*`/`mcc.*`-LocalStorage-Keys aufräumen (außer `mcc.backend.url` und `mcc.session.*`) — schlichter Einmal-Cleanup in `src/main.tsx` oder `__root.tsx`.

**1.7 Build-Flag entfernen**
- `VITE_USE_MOCK` aus `.env`/`.env.example`/`vite-env.d.ts` löschen, alle Referenzen entfernen.

---

### Block 2 — Status-Indikator unten rechts entfernen

**2.1 Roter/Grüner Punkt unten rechts weg**
- `src/routes/__root.tsx`: Import + Render von `<BackendStatusIndicator />` entfernen.
- Datei `src/components/layout/BackendStatusIndicator.tsx` löschen.

**2.2 Pi-Status in der Sidebar (unten links) bleibt**
- `PiStatusIndikator` ist in der `AppSidebar` korrekt platziert und zeigt online/wartung/offline. Bleibt unverändert. (Damit gibt es nur noch EINEN Status — in der Sidebar — und kein doppeltes Signal mehr.)

---

### Block 3 — Erst-Einrichtungs-Flow End-to-End verifizieren

Ziel: nach `install.sh` auf dem Pi, beim ersten Aufruf der Web-UI muss exakt das hier passieren — ohne Mock-Umweg.

**3.1 Frontend-Flow (Reihenfolge)**
1. App lädt → `refreshMe()` ruft `GET /auth/me`.
2. Backend hat noch keinen User → antwortet `409 already-setup` *(siehe 3.3)*.
3. Auth-Provider schaltet Modus auf `"needs-setup"`.
4. `LockScreen` rendert `SetupForm`: Eingabe von Setup-Token (aus `install.sh`-Output bzw. `keys/setup.token`) + neues Passwort (+ Bestätigung).
5. `POST /auth/setup` → Server hashed Passwort mit **argon2id** (`backend/src/auth/password.ts`, 64 MB / t=3), erzeugt Recovery-Code, hashed diesen ebenfalls (`hashRecoveryCode`), legt User an, löscht `keys/setup.token`, setzt Session-Cookie (HttpOnly).
6. Antwort enthält `recoveryCode` einmalig im Klartext → SetupForm zeigt großen Recovery-Code-Screen mit „Kopieren" + „Ich habe ihn sicher notiert"-Bestätigung. Erst dann wird der Screen geschlossen und der User ist eingeloggt (`mode=logged-in`).

**3.2 Setup-Form-Verbesserungen vor Release**
`SetupForm` in `LockScreen.tsx` prüfen/anpassen:
- Pflicht-Bestätigung „Recovery-Code sicher notiert" muss vor dem Weiterleiten in die App geklickt werden.
- Recovery-Code als Mono-Schrift, mit Copy-Button und Druck-Hinweis.
- Mindestlänge Passwort durchsetzen (Backend nutzt schon Schema; Frontend spiegelt Anforderung).
- Setup-Token-Feld mit Hinweis „aus dem Installationsausgabe-Fenster bzw. `keys/setup.token`".

**3.3 Statuscode-Konvention prüfen**
- `GET /auth/me` muss bei „kein User vorhanden" `409` liefern (Auth-Provider hängt davon ab → `needs-setup`). Aktuell ist der Code so im Frontend erwartet — Backend-Route in `backend/src/routes/auth.ts` einmal kurz gegenchecken und ggf. angleichen.

**3.4 Backend-Verbindungs-Onboarding**
- Wenn beim allerersten Frontend-Start noch keine Backend-URL gespeichert ist → `BackendOfflineScreen` zeigt einen zusätzlichen Primär-Button „Backend einrichten" → führt nach `Einstellungen → Backend-Verbindung`. Erst nach Setzen der URL und erfolgreichem `/health` wird auf den `SetupForm` gewechselt.

---

### Block 4 — Sicherheits-Checks vor Pi-Upload

**4.1 Auth & Krypto**
- Passwort-Hash: argon2id, 64 MB / t=3 / p=1 — bestätigt in `backend/src/auth/password.ts`. ✓
- Recovery-Code: argon2id-Hash in `recovery_hash`, Klartext nur einmal in der Setup-Antwort. ✓
- Session-Cookies: HttpOnly + SameSite + (in HTTPS-Umgebung) Secure — in `setSessionCookie` einmal verifizieren.
- Brute-Force: `lockout.ts` aktiv (`MAX_FAILS=10`), `/auth/setup` und `/auth/login` ratenbegrenzt.
- Setup-Token: 24h TTL, nach Verbrauch sofort gelöscht (`unlinkSync`), Permissions 0600. ✓
- Master-Key (`keys/master.key`): bleibt strikt lokal auf dem Pi — Drive-Backups bauen ein keyfreies Tarball (bereits umgesetzt).

**4.2 Daten/Code-Trennung am Pi**
- Code: `/opt/mycleancenter/current/`
- Daten: `/var/lib/mycleancenter/` (DB, `keys/`, `backups/`, `tmp/`)
- `assertInsideDataDir` aktiv für Restore-Pfade. ✓
- systemd-Unit setzt `TZ=Europe/Berlin`, `CORS_ORIGINS`, `GOOGLE_OAUTH_REDIRECT`. ✓

**4.3 Keine Auto-Mails**
- 3-Schichten-Schutz aktiv (Cron auskommentiert, `runMahnAutomatik(quelle:"cron")` returnt sofort, `enqueueVersand` wirft bei `quelle ≠ "manuell"`). ✓ — bleibt unverändert.

---

### Block 5 — Final-Check vor Pi-Deploy (Pflichtliste)

```text
[ ] bun build läuft sauber, keine Mock-Importe mehr
[ ] grep auf "mock", "Demo", "Schnell-Login", "040506" in src/  → 0 Treffer
    (außer evtl. neutralen Tests)
[ ] grep auf "BackendStatusIndicator" in src/                   → 0 Treffer
[ ] LockScreen kennt nur noch:
    needs-setup | logged-out | logged-in | backend-offline | loading
[ ] /auth/me 409  → SetupForm
[ ] SetupForm zeigt Recovery-Code, blockt bis "Notiert"-Klick
[ ] /auth/login mit falschem Passwort → Lockout nach 10 Versuchen
[ ] /auth/me 401  → LoginForm
[ ] Sperren-Button in Sidebar → echter Logout (Cookie weg, /auth/me 401)
```

---

### Technische Detail-Notizen (für die Umsetzung)

**Reihenfolge der Edits**, damit der Build zwischendurch grün bleibt:
1. Zuerst `summenRechnung` in `src/lib/belege/summen.ts` extrahieren und alle Importer umstellen.
2. Dann `src/lib/api/client.ts` entmocken.
3. Dann `src/lib/auth.tsx` (Mode-Enum + `unlock` raus) und `LockScreen.tsx` (`MockLockForm` raus) gleichzeitig.
4. Dann `MockDataResetCard` + `BackendStatusIndicator` löschen und Imports entfernen.
5. Mock-Verzeichnis `src/lib/mock/` und `mockBackend`-Aufruf in `dokument/upload.ts` löschen.
6. `VITE_USE_MOCK` aus Env-Dateien streichen.
7. Demo-Hinweise in den Email-Komponenten bereinigen.

**Auth-Status-Mapping nach Refactor:**

| Backend-Antwort | AuthMode | Sichtbar |
|---|---|---|
| Keine Pi-URL gesetzt | `backend-offline` | „Backend einrichten"-Screen |
| `/auth/me` Network-Fehler | `backend-offline` | OfflineScreen mit „Erneut prüfen" |
| `/auth/me` 409 | `needs-setup` | SetupForm + Recovery-Code-Bildschirm |
| `/auth/me` 401 | `logged-out` | LoginForm |
| `/auth/me` 200 | `logged-in` | App |

Nach diesem Plan ist das Frontend produktionsbereit, die App startet auf dem Pi sauber im Erst-Einrichtungs-Flow, das Passwort wird argon2id-gehasht gespeichert und der Recovery-Code wird genau einmal angezeigt.