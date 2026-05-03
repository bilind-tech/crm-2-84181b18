## Ziel

Header oben rechts wird vom Konto-Avatar (UserMenu) befreit. Die "Aktive Sessions"-Funktion wird komplett aus dem System entfernt — sowohl aus dem Frontend als auch aus dem Backend. "Passwort ändern" und "Recovery-Code neu erzeugen" wandern in den bestehenden Tab **Einstellungen → Sicherheit**. Der **Abmelden**-Button bekommt einen neuen Platz unten in der Sidebar (sonst gäbe es keine Möglichkeit mehr, sich auszuloggen).

## Was passiert in der UI

### Header (`src/components/layout/AppHeader.tsx`)
- Import und Verwendung von `<UserMenu />` werden entfernt.
- Rechts bleibt: Plus-Button, Glocke (Benachrichtigungen). Kein Avatar mehr.

### Sidebar (`src/components/layout/AppSidebar.tsx`)
- Ganz unten ein dezenter "Abmelden"-Eintrag mit `LogOut`-Icon, der `auth.logout()` aufruft.
- Keine Account-Infos, kein Avatar — passend zur Single-User-Regel.

### Sicherheit-Tab (`src/components/einstellungen/SicherheitTab.tsx`)
Neue Reihenfolge der Sektionen:
1. **Passwort** — direkter Button "Passwort ändern" → öffnet den bisherigen `PasswortAendernDialog` (aus UserMenu rausgezogen in eigene Datei `PasswortAendernDialog.tsx`).
2. **Recovery-Code** — Hinweistext + Button "Neuen Recovery-Code erzeugen" → öffnet den bisherigen `RecoveryRotateDialog` (ebenfalls in eigene Datei `RecoveryRotateDialog.tsx`).
3. **Auto-Lock** — bleibt wie gehabt (Slider 1–60 Minuten).

Die Sektion **Aktive Geräte** und der Button **Andere abmelden** werden **komplett entfernt**.

### UserMenu-Datei
- `src/components/layout/UserMenu.tsx` wird gelöscht.
- Die zwei Dialog-Komponenten ziehen vorher in eigene Dateien um (`PasswortAendernDialog.tsx`, `RecoveryRotateDialog.tsx` unter `src/components/einstellungen/`), damit sie im SicherheitTab wiederverwendet werden.

### Hooks (`src/hooks/useApi.ts`)
- `useSitzungen` und `useAlleSitzungenBeenden` werden entfernt.
- Der TS-Type `Sitzung` in `src/lib/api/types.ts` wird entfernt (falls keine andere Verwendung).

## Was passiert im Backend

Die Cookie-basierte Auth-Session des Users bleibt natürlich erhalten — Login/Logout funktionieren weiter. Weg fällt nur die **Multi-Session-Verwaltungs-API**:

### `backend/src/routes/auth.ts`
- `GET  /auth/sessions` — entfernt
- `DELETE /auth/sessions` — entfernt
- `DELETE /auth/sessions/:token` — entfernt

### `backend/src/routes/einstellungen.ts`
- `GET  /einstellungen/sitzungen` — entfernt
- `DELETE /einstellungen/sitzungen` (alle anderen abmelden) — entfernt
- `DELETE /einstellungen/sitzungen/:id` — entfernt
- Dazugehörige Imports aus `../auth/sessions.js` (nur die Listing-/Revoke-Funktionen) werden bereinigt; `resolveSession`, `purgeExpiredSessions` etc. bleiben unangetastet, weil sie für Login gebraucht werden.

### `backend/src/auth/sessions.ts`
- Die Helfer `listSessionsForUser`, `revokeSession`, `revokeOtherSessionsForUser` (oder vergleichbare Namen) werden entfernt, sofern keine andere Stelle sie noch braucht.
- Die Kerntabelle `sessions` und `resolveSession` bleiben — sie sind die Grundlage des Login-Cookies.

## Daten-Garantie

Es werden **keine** Daten in `/var/lib/mycleancenter/` verändert. Auch die `sessions`-Tabelle bleibt schemamäßig bestehen (sie speichert das aktive Login-Cookie). Nur die UI- und API-Endpoints zum Auflisten/Beenden mehrerer Sessions verschwinden — passend zur "Single-User"-Core-Regel.

## Akzeptanzkriterien

- Header oben rechts zeigt **keinen** Avatar/Konto-Knopf mehr.
- Sidebar zeigt unten einen "Abmelden"-Eintrag, Klick beendet die Sitzung und führt zum LockScreen.
- Einstellungen → Sicherheit zeigt die Sektionen Passwort, Recovery-Code, Auto-Lock — und **keine** "Aktive Geräte"-Liste mehr.
- Backend liefert auf `GET /auth/sessions`, `DELETE /auth/sessions`, `GET /einstellungen/sitzungen` jeweils 404.
- Login, Logout, Auto-Lock, Passwort-Änderung, Recovery-Code-Rotation funktionieren wie zuvor.
- Build (Frontend + Backend) läuft ohne Fehler — kein toter Import.

Bei Approve setze ich das in einem Rutsch um.