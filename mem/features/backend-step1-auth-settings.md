---
name: Backend Step 1 — Auth + Crypto + Settings
description: Pi-Backend Step 1 — argon2id-Login, AES-256-GCM-Crypto, Settings-Store, alle /einstellungen/*-Endpoints, HttpOnly-Cookie-Sessions
type: feature
---

# Backend Step 1 — Auth + Crypto + Settings

## Status: ✅ implementiert (Migration 002, Routen aktiv)

## Backend-Module
| Datei | Zweck |
|---|---|
| `backend/src/crypto/aes.ts` | AES-256-GCM `encryptString` / `decryptString`, Format `v1:base64(iv|tag|ct)` |
| `backend/src/auth/password.ts` | argon2id (64 MB, t=3, p=1) via `@node-rs/argon2` |
| `backend/src/auth/sessions.ts` | HttpOnly-Cookie `mcc_sess`, Sliding-Expiry 14 Tage, Hard-Cap 90, Touch-Throttle 60 s |
| `backend/src/auth/lockout.ts` | 5 Fehlversuche pro (IP, User) → 15 Min Sperre |
| `backend/src/auth/setup-token.ts` | Einmaliger Token in `data/keys/setup.token` (chmod 600), bei Setup gelöscht |
| `backend/src/auth/middleware.ts` | `requireAuth` Fastify preHandler |
| `backend/src/auth/audit.ts` | DB-Audit-Log (`audit_log` Tabelle) |
| `backend/src/settings/store.ts` | `getSetting`/`setSetting`/`getSettingMeta`, JSON-serialisiert, optional verschlüsselt |
| `backend/src/settings/schemas.ts` | Zod-Schemas für 11 Bereiche + sensible Einzel-Keys |
| `backend/src/routes/auth.ts` | `/auth/me`, `/auth/setup`, `/auth/login`, `/auth/logout`, `/auth/passwort-aendern` |
| `backend/src/routes/einstellungen.ts` | alle `/einstellungen/*`-Endpoints, alle hinter `requireAuth` |

## Migration 002
Tabellen: `app_user`, `auth_session`, `auth_lockout`, `setting`, `audit_log`. Indizes auf `auth_session(user_id)`, `auth_session(expires_at)`, `audit_log(at)`. Additiv-only — bricht keine bestehenden Daten.

## Endpoints
**Auth**
- `GET /auth/me` → 200 `{user, expiresAt}` | 401 unauthenticated | 409 needs-setup
- `POST /auth/setup` `{username, password, setupToken}` (Passwort min 12 Zeichen, 1 Ziffer, 1 Sonderzeichen) → erzeugt User + setzt Cookie
- `POST /auth/login` `{username, password}` (Rate-Limit 10/min) → 200 oder 401/423
- `POST /auth/logout`
- `POST /auth/passwort-aendern` `{alt, neu}`

**Einstellungen** (alle hinter requireAuth, GET liefert Defaults wenn leer)
- `firma`, `nummernkreise`, `sicherheit`, `erscheinung`, `backup`, `mahnung`, `dauerauftrag`, `steuer`, `stundenzettel` — jeweils `GET`/`PATCH`
- `smtp` — `GET` + `PATCH` (Passwort separat verschlüsselt, GET liefert `passwordIsSet`/`passwordUpdatedAt`); `DELETE /smtp/passwort`; `POST /smtp/test` (TCP-Probe)
- `google-drive` — `GET`/`PATCH` (clientSecret + refreshToken verschlüsselt); `POST /google-drive/disconnect`
- `sitzungen` — `GET` (mit `isCurrent`-Flag); `DELETE /:token`; `POST /alle-beenden`

## Sicherheit
- Passwörter: argon2id, niemals als Klartext geloggt.
- Sensible Settings: AES-256-GCM mit Master-Key aus `data/keys/master.key` (chmod 600).
- HttpOnly-Cookies, `SameSite=Lax`, `Secure` in Production.
- `@fastify/helmet` aktiv, `@fastify/rate-limit` global 200/min, Login zusätzlich 10/min.
- Lockout pro (IP, Username): 5 Fehlversuche → 15 min.
- Audit-Log für `auth.setup`, `auth.login`, `auth.login.fail`, `auth.logout`, `auth.password-change`, `settings.<bereich>.patch`, `settings.sessions.*`.

## Frontend
- `src/lib/api/piClient.ts` — Direkt-Client gegen Pi-Backend (Cookie-Auth, `credentials: include`)
- `src/lib/api/client.ts` — Routet Pi-Endpoints (Whitelist `PI_AUTH_PATHS` + `PI_SETTINGS_PATHS`) ans Pi, Rest ans Mock. Bei `status === 0` (Pi offline) Fallback aufs Mock, falls `VITE_USE_MOCK !== "false"`.
- `src/lib/auth.tsx` — neu mit `mode: 'loading' | 'needs-setup' | 'logged-out' | 'logged-in' | 'mock-lock'`. Pollt `/auth/me` bei Backend-Status-Wechsel.
- `src/components/layout/LockScreen.tsx` — zeigt je nach Modus `SetupForm`, `LoginForm` oder `MockLockForm`.
- Bestehende Tabs (`SmtpTab` über `EmailEinstellungen`, `NummernkreiseTab`, `SicherheitTab`, `ErscheinungTab`, `BackupTab`, `GoogleDriveTab`, `SteuerTab` etc.) sprechen über `api.get/patch('/einstellungen/...')` — die Routing-Schicht entscheidet automatisch Pi vs. Mock.

## Erste Inbetriebnahme
1. `cd backend && npm install`
2. `npm run dev` (Port 8787, `DATA_DIR=./data` in Dev)
3. Frontend → Einstellungen → Backend-Verbindung → URL `http://localhost:8787` speichern
4. App lädt erneut → `LockScreen` zeigt **Setup**-Form
5. Setup-Token aus dem Backend-Log oder `backend/data/keys/setup.token` einsetzen
6. Username + Passwort vergeben → angemeldet

## Test-Pflicht (gem. Roadmap)
1. Frischer Start → `/auth/me` → 409. Setup mit Token funktioniert. Token-Datei nach Setup gelöscht. ✅ Smoke-Test bestätigt
2. Login → Cookie gesetzt → Reload → noch eingeloggt
3. SMTP-Passwort speichern → DB enthält `v1:…`, GET liefert `passwordIsSet:true`
4. 5× falsches Passwort → 423 Locked
5. **Backup-Schutz-Test (Step 2 nachholen):** Backup vor Migration → 002 → Restore alt → Migrations-Runner → Settings + User wieder lesbar.

## Out of Scope (Step 2+)
- Backup-Erstellung & Restore-Flow (Step 2)
- Google-Drive OAuth-Flow (Step 6)
- Echter SMTP-Send (Step 6 — `/smtp/test` aktuell nur TCP-Connect)
- 2FA (späterer Schliff)

## Bekannte Einschränkungen
- `better-sqlite3` läuft NICHT in Bun (siehe Issue oven-sh/bun#4290). Backend-Dev und Pi-Prod beide auf **Node 20+**. Frontend bleibt auf Bun.
- TouchThrottle für Sessions ist In-Memory pro Prozess — bei Multi-Worker (kommt später nicht) müsste das in DB.
