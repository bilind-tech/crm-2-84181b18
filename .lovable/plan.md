# Step 1 — Settings-Store + Auth + Crypto

Ziel: Pi-Backend kann ab sofort Einstellungen persistent speichern, sensible Werte verschlüsseln, einen User authentifizieren und Sessions verwalten. Frontend benutzt für alle Einstellungs-Tabs das echte Backend statt des Mock.

## Backend — neue Module

### 1. Crypto-Lib (`backend/src/crypto/aes.ts`)
- AES-256-GCM mit IV (12 Byte) pro Wert.
- API: `encrypt(plain: string): string` → Format `v1:base64(iv|tag|ciphertext)`.
- `decrypt(token: string): string` mit Versions-Check.
- Master-Key kommt aus `crypto/masterkey.ts` (Step 0 ✅).
- Helper `redact(value)` → `{ isSet: boolean, updatedAt: ISO }` für GET-Responses.

### 2. Auth-Modul (`backend/src/auth/`)
- `password.ts` — argon2id (memory 64 MB, time 3, parallelism 1) via `argon2`-npm.
- `sessions.ts` — Token = 32 Random Bytes base64url, Tabelle `auth_session(token, user_id, created_at, last_seen_at, expires_at, user_agent, ip)`. Sliding-Expiry 14 Tage, Hard-Cap 90 Tage.
- `middleware.ts` — Fastify `preHandler` `requireAuth`. Liest `Authorization: Bearer <token>` → setzt `req.user`. Aktualisiert `last_seen_at` throttled (max 1×/Min).
- Lockout: 5 Fehlversuche pro IP+User → 15 Min Sperre (Tabelle `auth_lockout`).
- Rate-Limit auf `/auth/*` via `@fastify/rate-limit` (10 req / 60 s pro IP).

### 3. Settings-Store (`backend/src/settings/store.ts`)
- Tabelle `setting(key TEXT PRIMARY KEY, value TEXT, encrypted INT, updated_at TEXT)`.
- API: `get(key)`, `getJSON(key)`, `set(key, value, { encrypt })`, `setJSON(...)`, `delete(key)`, `list(prefix)`.
- Sensible Keys (`smtp.password`, `googleDrive.refreshToken`, …) immer `encrypt: true`.
- Cache (Map) mit Invalidation bei Writes.

### 4. Migration `002_auth_settings.sql`
```
CREATE TABLE app_user(id TEXT PK, username TEXT UNIQUE, password_hash TEXT, created_at, updated_at);
CREATE TABLE auth_session(token TEXT PK, user_id, created_at, last_seen_at, expires_at, user_agent, ip);
CREATE TABLE auth_lockout(id INTEGER PK, ip, username, until, fail_count);
CREATE TABLE setting(key TEXT PK, value, encrypted INTEGER, updated_at);
CREATE INDEX idx_session_user ON auth_session(user_id);
```
Seed: bei leerer `app_user` einmaligen Setup-Token in `data/keys/setup.token` (chmod 600) erzeugen, in Server-Log ausgeben.

### 5. Routen (`backend/src/routes/`)
**Auth (`auth.ts`)**
- `POST /auth/setup` (nur erlaubt solange kein User existiert ODER mit Setup-Token) → legt Admin an.
- `POST /auth/login` `{ username, password }` → `{ token, expiresAt, user }`.
- `POST /auth/logout` → invalidiert aktuellen Token.
- `POST /auth/passwort-aendern` `{ alt, neu }`.
- `GET /auth/me`.

**Einstellungen (`einstellungen.ts`)** — alle hinter `requireAuth`:
- Firma: `GET/PATCH /einstellungen/firma`
- SMTP: `GET/PATCH /einstellungen/smtp` (Passwort verschlüsselt, GET liefert `passwordIsSet`), `POST /einstellungen/smtp/test`
- Nummernkreise: `GET/PATCH /einstellungen/nummernkreise`
- Sicherheit: `GET/PATCH /einstellungen/sicherheit` (Auto-Lock-Minuten, 2FA-Flag-Stub)
- Erscheinungsbild: `GET/PATCH /einstellungen/erscheinung`
- Backup-Plan: `GET/PATCH /einstellungen/backup` (nur Plan-Settings; Ausführung in Step 2)
- Google-Drive Settings (Felder, kein OAuth-Flow): `GET/PATCH /einstellungen/google-drive` (verschlüsselt: clientSecret, refreshToken)
- Mahnung: `GET/PATCH /einstellungen/mahnung`
- Dauerauftrag: `GET/PATCH /einstellungen/dauerauftrag`
- Steuer: `GET/PATCH /einstellungen/steuer`
- Stundenzettel: `GET/PATCH /einstellungen/stundenzettel`
- Sitzungen: `GET /einstellungen/sitzungen`, `POST /einstellungen/sitzungen/alle-beenden`, `DELETE /einstellungen/sitzungen/:token`

Validation: jedes Patch-Body via `zod`-Schema in `backend/src/settings/schemas.ts`. Ungültige Felder → 422.

### 6. Server-Updates (`server.ts`)
- `@fastify/rate-limit`, `@fastify/cors` (nur Dev), `@fastify/helmet` registrieren.
- Routen registrieren. `/health` bleibt offen, alles andere via `requireAuth` außer `/auth/login|setup` und `/version`.

## Frontend

### 1. Auth-Context (`src/lib/auth/`)
- `AuthProvider` mit `login/logout/me/changePassword`. Token in `localStorage` (`mcc.authToken`), bei 401 globalem Logout.
- `apiClient.ts` (neu, ersetzt schrittweise Mock-Calls für die in Step 1 migrierten Endpoints): nutzt `getBackendUrl()` aus Step 0, hängt `Authorization: Bearer …` an. Falls Backend nicht erreichbar → konfigurierbarer Fallback-Toast „Offline-Modus" (kein Mock-Fallback für Auth/Einstellungen — die müssen am Pi sein).

### 2. Login-/Setup-Screens
- `src/routes/login.tsx` (öffentlich) — Username/Passwort, Redirect-Back.
- `src/routes/setup.tsx` — nur sichtbar wenn `GET /auth/me` mit `409 needs-setup` antwortet. Felder: Username, Passwort (zod min 12 Zeichen, 1 Zahl, 1 Sonderzeichen), Setup-Token (steht im Pi-Log).
- `_authenticated`-Layoutroute (Pathless) schützt alle bisherigen Routen via `beforeLoad`.

### 3. Einstellungs-Tabs auf echtes Backend
- Alle bestehenden Tabs (`Firma` (in Erscheinungsbild oder eigener Tab — nutzt vorhandene Komponente), `SMTP` aus `EmailEinstellungen`, `Nummernkreise`, `Sicherheit`, `Erscheinungsbild`, `Backup`-Plan, `GoogleDrive`-Felder, `Mahnung`, `Dauerauftrag`, `Steuer`, `Stundenzettel`) erhalten `useQuery`/`useMutation` gegen `apiClient`.
- Sensible Felder zeigen `isSet=true` als „●●●●● gespeichert" mit „Ändern"-Button (Replace-Flow).
- Tab `Sitzungen` (neu, klein in `SicherheitTab`): Liste aktiver Sessions mit „beenden".

### 4. Backend-Status erweitern
- `BackendStatusIndicator` zeigt zusätzlich `auth: ok|locked|offline`.

## Sicherheit / Härtung
- Passwörter: argon2id, niemals als Klartext loggen.
- Sensible Settings: AES-GCM, GET liefert nie Klartext.
- Rate-Limit + Lockout auf `/auth/*`.
- Helmet (Standard-Header), keine CORS in Prod (gleicher Origin per Reverse-Proxy später).
- Session-Tokens nicht in URL, nur Header.
- Audit-Log-Eintrag (in-memory bis Step 8) für `login`, `logout`, `password-change`, `settings-change`.

## Tests / Akzeptanzkriterien
1. Frischer Start → `/auth/me` → 409. Setup mit Token funktioniert. Token-Datei wird nach Setup gelöscht.
2. Login → Token wird gespeichert. Reload behält Session. Logout entfernt Token.
3. SMTP-Passwort speichern → DB enthält `v1:…`, GET liefert `{ passwordIsSet:true }`.
4. 5× falsches Passwort → 6. Versuch wird mit 423 für 15 Min blockiert.
5. **Pflichttest:** Backup vor Migration → Migration 002 → Restore altes Backup → Migrations-Runner läuft → Settings + User wieder lesbar.
6. Update-Simulation: `current/`-Symlink auf neue Version → Datenverzeichnis unverändert, Login klappt weiterhin.

## Mock-Parität
Mock-Endpoints aus Liste oben werden mit Feature-Flag `useRealAuthSettings=true` (default an, sobald Backend-URL gesetzt) deaktiviert. Andere Module (Kunden/Rechnungen) laufen weiter über Mock bis Step 3+.

## Out of Scope (kommt später)
- Backup-Erstellung & Restore-Flow → Step 2
- Google-Drive OAuth-Verbindung → Step 6
- SMTP-Test gegen echten Server → Step 6 (Step 1 stubt `/smtp/test` mit Connect-Probe)
- 2FA → späterer Schliff

## Memory-Update am Ende
Neue Datei `mem/features/backend-step1-auth-settings.md` mit Endpoint-Liste, Schema, Setup-Flow, Test-Protokoll. `mem/index.md` ergänzt um Verweis.

Sag „approved" und ich setze um.
