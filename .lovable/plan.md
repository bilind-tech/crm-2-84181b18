# Step 1 — Hardening & Bugfixes vor Step 2

Vor dem Backup-/Restore-Step (Step 2) räumen wir Step 1 auf. Alle Punkte stammen aus einem direkten Code-Review der eingecheckten Dateien.

## Sicherheits-Bugs (müssen weg)

### 1. Username-Enumeration & weiche Lockout-Antwort
`/auth/login` liefert bei falschem Login `failCount`/`locked`/`lockedUntil` zurück. Damit kann ein Angreifer per IP-Rotation:
- gültige Usernames erkennen (Lockout zählt nur wenn User existiert? aktuell unabhängig — gut, aber Antwort verrät trotzdem Status)
- Lockout-Zustand abfragen ohne Try.

**Fix:** Antwort auf `{ error: "invalid-credentials" }` reduzieren. Lockout-Status NUR bei `423` zurückgeben. Argon2-Verify auch laufen lassen wenn User nicht existiert (Dummy-Hash) → konstante Antwortzeit gegen Timing-Enumeration.

### 2. Setup-Token rotiert nicht bei Restart vor Setup
Wenn der Pi läuft, kein User existiert und der Token in `setup.token` liegt, bleibt er beliebig lang gültig. Wer einmal Filesystem-Zugriff hatte, hat ewig den Token.

**Fix:** Token bekommt Ablauf (24 h). Datei-Format `{token, createdAt}`. `ensureSetupToken` regeneriert wenn abgelaufen. Beim Boot zusätzlich in Logs warnen wenn Token > 1 h alt.

### 3. Cookie-Maxage ≠ Server-Sliding-Expiry
`setSessionCookie` setzt `maxAge: 14d` einmalig beim Login. Nach 14 Tagen löscht der Browser das Cookie, obwohl die Server-Session per Sliding-Expiry noch gültig sein könnte. Schlimmer: Cookie wird bei jedem Request NICHT erneuert.

**Fix:** Bei jedem authentifizierten Request, wenn Sliding-Update getriggert hat, auch `setCookie` mit neuem `maxAge` aufrufen. Helfer `refreshSessionCookie(reply, expiresAt)`.

### 4. CORS `*` mit `credentials: true`
`config.corsOrigins` Default ist `"*"`. Mit `credentials: true` lehnen Browser das eigentlich ab — aber Fastify-CORS sendet bei `origin: true` den Request-Origin zurück, was effektiv „alle Origins mit Credentials erlaubt" bedeutet. Im LAN okay, in Prod NICHT.

**Fix:** In Production muss `CORS_ORIGINS` explizit gesetzt sein (Liste). Ohne Wert → Bootfehler. Im Dev bleibt `*` mit Warnung im Log.

### 5. Audit-Log-Detail enthält Username im Klartext, aber kein IP-Hash
Aktuell loggt `auth.login.fail` `{username}`. Bei Brute-Force entstehen pro IP viele Zeilen. Kein Limit, keine Rotation → Tabelle wächst unbegrenzt.

**Fix:** Audit-Log mit Retention (z. B. 180 Tage) im Sweep-Job. Index auf `(action, at)`.

## Funktionale Bugs

### 6. PATCH mit `null` löscht Felder NICHT, sondern überschreibt sie
`patchArea` macht flachen `{...current, ...body}`. Wer absichtlich einen String leert (`iban: null`), bekommt nach Schema-Parse den Default zurück → silent revert.

**Fix:** Input erst gegen `Schema.partial()` validieren, dann mergen, dann gegen Vollschema validieren. Explizit unterstützte „Feld löschen"-Semantik (leerer String = leer behalten).

### 7. SmtpSchema: Body-Felder werden nicht type-validiert
PATCH-Body wird als `Record<string, unknown>` ins `patchArea` gereicht. Wenn Frontend versehentlich `port: "465"` (String) schickt, scheitert die Validation hart mit 422. UX leidet.

**Fix:** `z.coerce.number()` für alle numerischen Settings (port, hue, tage, sätze).

### 8. `userCount() === 0` bei jedem `/auth/me`-Call
SQL `COUNT(*)` ist zwar billig, aber bei jedem Polling (Frontend pollt bei Status-Wechsel + Tab-Focus) unnötig.

**Fix:** In-Memory-Flag `setupComplete` cachen, beim erfolgreichen `/auth/setup` setzen.

### 9. Touch-Throttle In-Memory wird beim Restart resettet
Nach Backend-Restart wird ALLE aktive Sessions beim ersten Request „touched" → unnötiger DB-Write-Sturm.

**Fix:** `lastTouchedAt` mit Fastify-Hook beim Boot warm aus DB-`last_seen_at` laden (alle Sessions). Bei < 100 Sessions vernachlässigbar.

### 10. `/einstellungen/sitzungen/:token` erlaubt Revoke fremder Sessions
Aktuell wird `deleteSession(token)` aufgerufen ohne Owner-Check. Ein eingeloggter User könnte mit einem fremden Token (z. B. aus Audit-Log abgegriffen, oder erraten) andere Sessions killen.

**Fix:** `DELETE auth_session WHERE token = ? AND user_id = ?` mit `req.user.id`. Bei 0 Changes → 404.

### 11. Settings-Cache wird bei `setSetting` nur für genau einen Key invalidiert
Beim `PATCH /smtp` wird `smtp` (Bereich) UND `smtp.password` (sensitive) geschrieben. `loadArea("smtp")` nutzt aber `getSetting("smtp")` — Cache ist konsistent, ABER: anderer Prozess (späterer Backup-Worker, Step 2) sieht alten Wert. Cache muss bei jedem Write komplett oder mit Versionsnummer invalidiert werden.

**Fix:** Pro Request frischer Cache (Per-Request-Dictionary) ODER Versions-Stempel pro Key. Empfehlung: Cache komplett raus — SQLite-Read ist mit WAL+Index < 0.1 ms. KISS.

## Frontend-Schwächen

### 12. `auth.tsx` — `mock-lock` als Fallback ist verwirrend wenn Pi-URL gesetzt ist
Wenn der User absichtlich mit Pi arbeitet und das Backend kurz weg ist, springt die App in `mock-lock` und zeigt Demo-Login. Risiko: User glaubt eingeloggt, schreibt Daten ins Mock, verliert sie.

**Fix:** Wenn `backendUrl` konfiguriert ist und `status === 0`, nicht `mock-lock` zeigen, sondern eigener `backend-offline`-Modus mit „Verbindung zum Pi verloren — Retry"-Screen. Mock-Modus nur wenn KEINE Backend-URL gespeichert ist.

### 13. Login-Form keine Lockout-Anzeige, kein Caps-Lock-Hinweis
Aktuell zeigt `LockScreen` nur „Falsches Passwort". Nach 5 Versuchen kommt 423 → User sieht nichts Spezifisches.

**Fix:** 423 → eigene UI „Konto gesperrt bis HH:MM". Caps-Lock-Detector. Passwort-Sichtbarkeits-Toggle.

### 14. `PI_SETTINGS_PATHS` Whitelist ist fehleranfällig
Jeder neue Endpoint muss in zwei Listen + Subpath-Check eingetragen werden. Vergisst man's, geht's still ans Mock.

**Fix:** Routing per Prefix-Liste: `["/auth/", "/einstellungen/"]` → wenn Backend-URL gesetzt UND erreichbar → Pi, sonst Mock. Whitelist entfällt. Sub-Bereiche, die noch nicht im Backend sind (z. B. `/einstellungen/vorlagen`), kriegen explizite Mock-Markierung.

## Zusätzliche Verbesserungen

### 15. Fehlende DB-Indexe
- `app_user(username COLLATE NOCASE)` — Login-Lookup
- `setting(key)` ist PK, ok
- `audit_log(action, at)` — für Retention-Sweep & spätere UI

### 16. Health-Endpoint zu dünn
`/health` liefert nur `{ok}`. Frontend braucht aber Schema-Version, masterKey-OK, DB-OK, ggf. Disk-Free für Step 2.

**Fix:** `/health` erweitern (öffentlich) + `/health/detail` (auth-only) mit Schema-Version, freier Speicher in DataDir, Anzahl User, Anzahl Sessions, Uptime.

### 17. Keine Integrationstests
Aktuell „Smoke-Test bestätigt" laut Memo, aber kein automatisierter Test.

**Fix:** Kleine `vitest`-Suite (`backend/test/auth.spec.ts`) gegen In-Memory-DB: Setup-Flow, Login, Lockout, Cookie-Refresh, Cross-User-Session-Revoke verboten, PATCH-Merge-Verhalten.

## Reihenfolge der Umsetzung

1. **Sicherheit** (1, 2, 3, 4, 10) — gefährlichste zuerst
2. **Funktional** (6, 7, 8, 9, 11)
3. **Frontend** (12, 13, 14)
4. **Cleanup** (5, 15, 16)
5. **Tests** (17) — sichert alles ab

## Out of Scope (bleibt für Step 2+)
- Echte 2FA (TOTP) — kommt später
- Audit-Log-UI — wenn Step 11 (Logs/Monitoring) drankommt
- Multi-User mit Rollen — vorerst nur ein Owner-User

## Akzeptanzkriterien
- `npm run test` im backend grün
- Login-Antwort enthält keine Lockout-Daten bei 401
- CORS mit `*` in Prod verweigert Boot
- Cross-User-Session-Revoke gibt 404
- Frontend: Backend offline mit gesetzter URL → kein Mock-Lock-Switch
- PATCH `firma {iban: ""}` setzt iban auf leer (statt Default zurück)

Sag „approved" und ich setze die 17 Punkte in der genannten Reihenfolge um, danach starten wir mit Step 2 (Backup & Restore).
