# Backend-Integration — Kurzanleitung für Claude Code

Dieses Frontend ist vollständig fertig und läuft mit einem Mock-Backend (in-memory + localStorage). Deine Aufgabe: ein echtes HTTP-Backend bauen, das die unten verlinkte Spec implementiert.

## Was du lesen musst (in dieser Reihenfolge)

1. **`BACKEND_INTEGRATION.md`** — Vollständige API-Spec: Endpoints, Auth-Flow, Fehler-Format, ENV-Variablen.
2. **`src/lib/api/types.ts`** — **Single Source of Truth** für alle Datentypen (Kunde, Angebot, Rechnung, Position, …). Diese Typen darfst du nicht ändern; das Backend muss sie 1:1 zurückgeben.
3. **`src/lib/api/client.ts`** — HTTP-Client mit Fehler-Handling. Schaltet automatisch zwischen Mock und Live um (`VITE_USE_MOCK`).
4. **`src/lib/mock/backend.ts`** — Referenz-Implementierung aller Endpoints im Mock. Verhalten (Validierung, Defaults, Reihenfolge, Statuswechsel) muss identisch sein.
5. **`src/hooks/useApi.ts`** — Alle React-Query-Hooks. Zeigt dir, welche Endpoints das Frontend tatsächlich nutzt und mit welchen Parametern.

## Wie du startest

1. Lies die fünf Dateien oben.
2. Implementiere die Endpoints in deiner Backend-Sprache (Node/Python/Go/…), Persistenz frei wählbar (Postgres empfohlen).
3. Setze in `.env`: `VITE_USE_MOCK=false` und `VITE_API_BASE_URL=http://localhost:8080` (oder deine URL).
4. Starte dein Backend, starte das Frontend (`bun dev`) — alles muss ohne Code-Änderung am Frontend funktionieren.

## Wichtige Regeln

- **Keine Frontend-Änderungen nötig.** Wenn du die Spec exakt erfüllst, läuft das Frontend out-of-the-box.
- **Typen kommen aus `src/lib/api/types.ts`** — generiere daraus Backend-Typen (z. B. via `tsoa`, `zod-to-openapi`, oder manuell).
- **Auth = Master-Passwort.** Single-User-System. POST `/auth/unlock` mit `{ passwort }` → liefert Session-Token. Token in `Authorization: Bearer …` für alle weiteren Requests.
- **Fehler-Format**: `{ "error": { "code": "string", "message": "string" } }` mit passendem HTTP-Status.
- **IDs**: UUIDs als Strings. Datumsfelder als ISO-8601 (`YYYY-MM-DD` oder full ISO).
- **Geld**: Nettopreise als `number` (Euro mit Dezimalen, z. B. `0.85`). Steuersätze in Prozent als Zahl (`19`).

## Was nicht zum Backend gehört

- PDF-Generierung läuft client-seitig (`src/lib/pdf/`).
- E-Mail-Versand: nur SMTP-Config speichern; tatsächlicher Versand kann später nachgerüstet werden.
- Auth-Komplexität (OAuth, Multi-User) ist explizit nicht gewünscht. Single-User per Master-Passwort.
