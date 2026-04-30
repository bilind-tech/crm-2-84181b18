## Ziel

Vier Verbesserungen für ein extrem cleanes, schnelles Gefühl + Vorbereitung auf das echte Backend (Claude Code).

1. Master-Passwort auf `040506` umstellen, Standard-Passwort-Hinweis im Login entfernen, Login-Logo größer + „**Clean**" fett.
2. Sidebar-Navigation soll instant umschalten (Preloading + globaler Top-Loading-Spinner).
3. Saubere Animation/Bewegung überall (Page-Fade, Spinner-Standard).
4. Code-Aufräumen, damit Claude Code das Backend leicht andocken kann (klare API-Layer-Trennung, dokumentierter Auth-Flow).

---

## 1. Login: Passwort + Optik

Dateien:
- `src/lib/mock/seed.ts` — `masterPasswort: "admin"` → `masterPasswort: "040506"`.
- `src/lib/mock/backend.ts` — Storage-Key bumpen: `mcc_mock_db_v2` → `mcc_mock_db_v3`, damit alte localStorage-Stände mit altem Passwort ungültig werden und der neue Seed greift.
- `src/components/layout/LockScreen.tsx`:
  - Logo von `h-16 w-16` → `h-28 w-28`, mit etwas Drop-Shadow.
  - Titel umbauen: statt einfachem `<CardTitle>My Clean Center</CardTitle>` → `<span className="font-light">My </span><span className="font-extrabold">Clean</span><span className="font-light"> Center</span>`. Nur „Clean" fett.
  - **Den ganzen Hinweis** „Mock-Modus · Standard-Passwort: `admin`" **komplett entfernen**.
  - Card etwas dezenter: schmaler Rand, weicher Schatten, mehr Padding.

## 2. Sidebar-Navigation: Instant + Spinner

Datei: `src/router.tsx`

- `defaultPreload: "intent"` setzen (lädt Route schon beim Hover/Touchstart).
- `defaultPreloadStaleTime: 0` bleibt (React-Query bestimmt Frische).
- `defaultPendingMs: 80` und `defaultPendingMinMs: 200` setzen → Spinner blitzt nicht bei sehr schnellen Navigationen.
- `defaultPendingComponent`: ein dezenter Center-Spinner (Lucide `Loader2` mit `animate-spin`).

Datei: `src/routes/__root.tsx`

- Globaler Top-Bar-Spinner (3px hohe Leiste oben), die nur sichtbar ist, wenn der Router gerade lädt:
  - Über `useRouterState({ select: (s) => s.isLoading })` einbinden.
  - Position `fixed top-0 inset-x-0`, `bg-primary` mit Pulse-Animation.
- `<main>` bekommt `className="... motion-safe:animate-fade-in-fast"` (siehe CSS).

Datei: `src/styles.css`

- Neue Keyframes `fade-in-fast` (140ms, opacity 0→1, kein Y-Translate) für Page-Wechsel — kein Ruckeln.
- Keyframe `top-loader` (von `translateX(-100%)` zu `translateX(0)` mit `cubic-bezier(0.4, 0, 0.2, 1)` 600ms infinite alternate).

## 3. Bewegung allgemein cleaner

- React-Query in `__root.tsx`: `staleTime: 30_000` statt `5_000` → weniger unnötige Refetches → schnellerer Eindruck.
- Sidebar-Links bekommen `preload="intent"` explizit (per `Link` Prop in `AppSidebar.tsx`), und `transition-colors duration-150` damit Hover/Active sanft fließt.

## 4. Vorbereitung für Claude Code / echtes Backend

Damit der Wechsel vom Mock auf ein echtes Backend trivial wird:

- Neue Datei `BACKEND_INTEGRATION.md` im Projekt-Root mit:
  - Übersicht aller REST-Endpoints (kommt aus dem bereits existierenden Mock-Backend).
  - Beschreibung wie `VITE_USE_MOCK=false` umgestellt wird und welche `VITE_API_BASE_URL` erwartet wird.
  - Auth-Flow: `POST /auth/unlock { passwort }` → 200/401, `POST /auth/lock`, `PATCH /auth/passwort { altesPasswort, neuesPasswort }`.
  - Datentypen verweisen auf `src/lib/api/types.ts` (single source of truth).
  - Hinweis: keine Logik in Komponenten, alle DB-Zugriffe gehen durch `src/hooks/useApi.ts` und `src/lib/api/client.ts`.

- `src/lib/api/client.ts` (falls noch nicht so): kurzer Kommentar oben, dass `mode === "mock"` lokal arbeitet und sonst `fetch(API_BASE_URL + path)` nutzt — bestehende Struktur bleibt, nur sauber dokumentiert.

- `.env.example` mit:
  ```
  VITE_USE_MOCK=true
  VITE_API_BASE_URL=
  ```

Damit kann Claude Code später nur noch:
1. `VITE_USE_MOCK=false` setzen,
2. Backend an die in `BACKEND_INTEGRATION.md` dokumentierten Endpoints anpassen,
fertig — keine Frontend-Änderungen nötig.

---

## Technische Details (kompakt)

| Datei | Änderung |
|---|---|
| `src/lib/mock/seed.ts` | Passwort `040506` |
| `src/lib/mock/backend.ts` | Storage-Key `v3` |
| `src/components/layout/LockScreen.tsx` | Logo groß, „Clean" fett, Hinweis entfernen |
| `src/router.tsx` | `defaultPreload: "intent"`, `defaultPendingMs/MinMs`, `defaultPendingComponent` |
| `src/routes/__root.tsx` | Top-Loader, Page-Fade, `staleTime: 30_000` |
| `src/styles.css` | Keyframes `fade-in-fast`, `top-loader` |
| `src/components/layout/AppSidebar.tsx` | `preload="intent"` + sanftere Transitions |
| `BACKEND_INTEGRATION.md` (neu) | Doku für Claude Code |
| `.env.example` (neu) | Mock-Toggle + API-URL |

Keine neuen Dependencies.

**Achtung Storage-Bump:** Beim ersten Laden nach dem Update verlieren Nutzer ihre lokalen Mock-Daten (Kunden, Rechnungen etc.), weil neuer Seed greift. Das ist gewollt, damit das neue Passwort sicher gilt.
