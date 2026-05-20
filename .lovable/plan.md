# Protokoll-Preview Flackern fixen

## Was passiert aktuell

In `src/components/protokoll-editor/ProtokollLivePreview.tsx` gibt es zwei zusammenwirkende Bugs, die das schnelle Flackern verursachen:

### Bug 1 — Rebuild-Loop ohne Debounce
Im `finally` von `runBuild` (Zeile ~225):

```ts
if (latestKeyRef.current !== builtKeyRef.current) {
  queueMicrotask(() => { if (mountedRef.current) void runBuild(); });
}
```

Sobald sich der Draft während eines laufenden Builds geändert hat, wird der **nächste Build sofort ohne Debounce** angestoßen. Beim Erstellen eines Protokolls feuern in den ersten Sekunden mehrere Kontext-Updates (Kunde-/Objekt-/Firma-Query lädt nach, Autosave-Roundtrip), die `currentKey` ändern. Folge: Build → Swap → sofort nächster Build → Swap → … in schneller Folge.

### Bug 2 — Buffer wird mitten im Fade-Out überschrieben
Direkt nach einem Swap startet der nächste Build und schreibt sein Ergebnis in den (gerade noch sichtbar ausfadenden) Back-Slot:

```ts
const target: SlotId = isFirstBuild ? front : front === "A" ? "B" : "A";
…
const next: SlotState = { buffer: buf, hotspots, numPages: 0, rendered: 0, buildId };
if (target === "A") setSlotA(next); else setSlotB(next);
```

`numPages: 0` ⇒ `DocumentSlot` rendert sofort **keine `<Page>`** mehr, weil `Array.from({length: 0})`. Der Slot ist zu diesem Zeitpunkt aber noch teilweise sichtbar (CSS-Transition läuft `FADE_MS = 140ms`). Die alte PDF blinkt aus, bevor die neue eingeblendet wird → sichtbares Flackern.

## Fix

### 1. `runBuild` rebuilds immer durch den Debounce schicken
Im `finally`-Block den sofortigen `queueMicrotask`-Rebuild durch `scheduleBuild()` ersetzen. So gilt für jeden Folge-Build dieselbe Wartezeit (`DEBOUNCE_MS` / `TYPING_DEBOUNCE_MS`), und schnelle Folge-Builds werden zusammengefasst. Damit verschwindet die "Rebuild-Kette" während Initial-Loads vollständig.

### 2. Back-Slot erst überschreiben, wenn er wirklich aus ist
Bevor ein neuer Build in einen Slot geschrieben wird, prüfen wir: ist dieser Slot gerade `visible` (also Front)? Wenn ja, sofort schreiben (Front ist erster Build / leerer Slot). Wenn nein und ein Swap kürzlich passiert ist (innerhalb `FADE_MS + 60ms`), den Build-Commit per `setTimeout` bis nach dem Fade verzögern. Konkret:
  - Wir merken uns in einem Ref `lastSwapAtRef` den Zeitstempel des letzten `setFront`.
  - Vor dem `setSlotX(next)` berechnen wir `wait = Math.max(0, FADE_MS + 60 - (now - lastSwapAtRef.current))`.
  - Bei `wait > 0` schreiben wir den Slot per `setTimeout(..., wait)` (mit mountedRef-Guard und buildId-Check, damit eine zwischenzeitlich neuere Version nicht überschrieben wird).

### 3. Kleinere Härtung: Build überspringen, wenn nichts Sichtbares dirty
Vor dem Setzen von `setBuilding(true)` zusätzlich prüfen, dass `builtKeyRef.current !== latestKeyRef.current` (ist bereits vorhanden) — bleibt unverändert. Nur das `setBuilding(true)`/`setBuildError(null)` nach diesem Guard belassen, damit kein "aktualisiert …"-Indikator unnötig kurz aufblitzt.

## Out of scope

- Kein Umbau des Slot-Modells (A/B-Crossfade bleibt).
- Keine Änderung an Hotspots/PdfFieldOverlay.
- Keine Änderung an `useProtokollEditor`-Autosave-Timing.
- Keine Backend-Änderungen.

## Betroffene Datei

- `src/components/protokoll-editor/ProtokollLivePreview.tsx` (nur diese Datei)

## Verifikation

- Build muss durchlaufen (TypeScript strict).
- Manuelle Prüfung im Preview: neues Protokoll anlegen → Editor öffnen → links darf das PDF nicht mehr mehrmals pro Sekunde "umklappen". Erwartetes Verhalten: einmaliger sanfter Crossfade pro tatsächlicher Datenänderung, sonst Standbild.
