# Plan: Stundenzettel-Feinschliff

## 1. Cleanup `src/routes/stundenzettel.tsx`
- Entferne ungenutzte Imports: `useMemo`, `Info`.
- Entferne die nicht mehr genutzte Funktion `analysiereUmfeld` und das Subcomponent `HindernisInfo` (samt Typ `Hindernis`), da der Reverse-Proxy diese Fälle abdeckt.
- Entferne die tote `hindernis`-Konstante und den `HindernisInfo`-Branch im JSX.

## 2. Sauberer 503-/Fehler-Empty-State
Backend liefert für `/extern/stundenzettel/` zwei Fehlerklassen:
- **503 `not-configured`** — keine URL hinterlegt (greift nur, falls UI ohne `url`-Check landet).
- **502 `upstream-unreachable`** — Backend kann LAN-Host nicht erreichen.

Umsetzung im iframe-Container:
- Status der Embed-Quelle aktiv prüfen: in `Page` einen kleinen `useQuery(['stundenzettel','probe'], () => fetch(embedUrl, { method:'HEAD' }))` einbauen, der den HTTP-Status liefert.
- Wenn Status `502`/`503` oder Netzwerkfehler → statt iframe einen Empty-State rendern:
  - Icon `PlugZap` / `Clock`
  - Titel je nach Status: „Stundenzettel-Server nicht erreichbar" (502) bzw. „Noch nicht konfiguriert" (503).
  - Erklärtext mit der eingetragenen URL und Hinweis: Pi/Dienst läuft nicht oder Adresse falsch.
  - Buttons: „Erneut versuchen" (refetch), „In neuem Tab öffnen", „Adresse ändern" → `/einstellungen`.
- iframe lädt nur, wenn Probe `ok` ist; spart leeres Frame + Spinner-Endlosschleife.

## 3. Smoke-Test `/extern/stundenzettel`
- Per `stack_modern--invoke-server-function` (bzw. lokales `curl` via exec) je einen Request auf:
  - `GET /extern/stundenzettel/` ohne hinterlegte URL → erwartet `503 not-configured`.
  - `GET /extern/stundenzettel/` mit Dummy-URL die offline ist → erwartet `502 upstream-unreachable`.
  - `OPTIONS /extern/stundenzettel/` → erwartet 2xx (CORS/Preflight).
- Ergebnisse protokollieren; Anpassungen nur falls Abweichung.

## Technische Details
- Datei `src/routes/stundenzettel.tsx`: ~80 Zeilen kleiner nach Cleanup.
- Neue Probe nutzt `getBackendUrl()` direkt; `staleTime: 0`, `retry: false`.
- Keine Backend-Änderungen nötig (Statuscodes existieren bereits).

## Out of scope
- Auth-Weiterleitung an externen Dienst.
- WebSocket-Proxy (Stundenzettel-App nutzt aktuell nur HTTP).
