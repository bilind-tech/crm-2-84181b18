## Ziel

Drei Dinge:
1. Klick auf einen Kunden in der Liste öffnet zuverlässig die Detailseite (ganze Zeile klickbar).
2. Alle Demo-/Platzhalterdaten (Kunden, Objekte, Angebote, Rechnungen, Dokumente, Notizen, Aktivitäten, Benachrichtigungen) entfernen — Firmendaten, SMTP, Nummernkreise, Vorlagen, Sicherheit, Backup, Theme bleiben unverändert.
3. Projekt aufräumen, sodass Claude Code das Backend sauber implementieren kann (klare API-Spec, Typen, Mock/Live-Trennung).

## Was gebaut wird

### 1) Kunden-Zeile vollständig klickbar

In `src/routes/kunden.tsx` die Tabellen­zeile in einen Link umbauen — Klick irgendwo in der Zeile (außer auf Status-Badge / Aktions-Spalte) navigiert zu `/kunden/$id`. Hover-State bleibt erhalten, Cursor wird `pointer`.

Gleiches Prinzip auch für `angebote.tsx`, `rechnungen.tsx`, `objekte.tsx` — konsistente, vorhersagbare Klick-Bereiche.

### 2) Seed-Daten leeren

In `src/lib/mock/seed.ts`:

- `kunden`, `ansprechpartner`, `objekte`, `angebote`, `rechnungen`, `dokumente`, `notizen`, `aktivitaeten`, `benachrichtigungen` → leere Arrays `[]`.
- `zaehler` → `{ kunde: 0, objekt: 0, angebot: 0, rechnung: 0 }`.
- Erhalten bleiben: `firmendaten`, `smtp`, `nummernkreise`, `positionsvorlagen`, `textvorlagen`, `sicherheit`, `appearance`, `backup`, `masterPasswort`.
- Die Konstanten `k1, k2, ap1, o1, o2, a1, r1, r2, dok1, notiz1` und alle abhängigen Hilfsobjekte werden gelöscht.

Storage-Key in `src/lib/mock/backend.ts` von `mcc_mock_db_v3` auf `mcc_mock_db_v4` erhöhen, damit alte Demo-Daten im Browser des Users sofort verschwinden.

Empty-States existieren bereits auf allen Listenseiten ("Keine Kunden gefunden" etc.) — kein zusätzlicher UI-Code nötig.

### 3) Projekt-Aufbereitung für Claude Code

Bestehende Dokumente prüfen und aktualisieren:

- `BACKEND_INTEGRATION.md` und `.env.example` existieren bereits. Ich überarbeite `BACKEND_INTEGRATION.md` zu einer vollständigen, eindeutigen Spec mit:
  - Übersicht: Architektur (Frontend ↔ HTTP-Client ↔ Mock | Live-Backend)
  - Auth-Flow (Master-Passwort, Session-Token, `/auth/unlock`, `/auth/lock`)
  - Vollständige Endpoint-Liste pro Ressource (Kunden, Ansprechpartner, Objekte, Angebote, Rechnungen, Dokumente, Notizen, Aktivitäten, Benachrichtigungen, Vorlagen, Einstellungen, Dashboard, Suche)
  - Request/Response-Schemas verweisen auf `src/lib/api/types.ts` (Single Source of Truth)
  - Status-Codes, Fehlerformat (`ApiError`), Pagination-Konvention
  - Umschalt-Mechanismus `VITE_USE_MOCK=false` und welche ENV-Variablen das Backend braucht
- Kurze `README_BACKEND.md` im Projekt-Root mit "Was muss Claude tun"-Checkliste (5–10 Bullet-Points), die direkt auf `BACKEND_INTEGRATION.md`, `src/lib/api/types.ts` und `src/lib/api/client.ts` verweist.
- Sicherstellen, dass `src/lib/api/client.ts` sauber zwischen Mock und Live umschaltet und alle Hooks in `src/hooks/useApi.ts` ausschließlich darüber gehen (ist bereits so — wird nur verifiziert, keine Funktionsänderung).
- Inline-Kommentare in `src/lib/mock/backend.ts` am Datei-Anfang erweitern: klarer Hinweis, dass diese Datei beim Live-Backend-Switch komplett ersetzt wird und nur als Spec/Referenz dient.

## Technische Details

**Klickbare Zeile**: Statt `<tr>` mit Inline-`<Link>` wird `<tr>` per `useNavigate()` und `onClick` zur Navigation gebracht, plus `role="link"` und `tabIndex={0}` mit Enter-Handler für Tastaturzugänglichkeit. Aktions-Buttons in der letzten Spalte stoppen Event-Propagation (`e.stopPropagation()`), damit Löschen/PDF-Download nicht versehentlich navigiert.

**Daten-Reset im Browser**: Durch den neuen Storage-Key (`v4`) wird die alte localStorage-DB beim ersten Laden ignoriert und durch das neue, leere Seed ersetzt. User muss nichts manuell löschen.

**Keine Breaking Changes**: Alle Typen, Hooks und Routen bleiben identisch. Nur die initialen Daten und die Klick-UX ändern sich.

## Dateien

- `src/lib/mock/seed.ts` — Demo-Daten entfernen, leere Arrays
- `src/lib/mock/backend.ts` — Storage-Key auf `v4`, Header-Kommentar erweitern
- `src/routes/kunden.tsx` — ganze Zeile klickbar
- `src/routes/angebote.tsx`, `rechnungen.tsx`, `objekte.tsx` — gleiche Klick-UX
- `BACKEND_INTEGRATION.md` — überarbeitete, vollständige Spec
- `README_BACKEND.md` — neue Kurzanleitung für Claude Code