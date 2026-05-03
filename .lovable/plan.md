
# Live-Editor: Speichern-Spam fixen + magisches Live-Gefühl + PDF-Feinschliff

Drei separate, kleine Fixes — alle ohne Daten- oder API-Änderung.

## 1. Toast-Spam „Gespeichert" beseitigen

Aktuell feuert `useBelegEditor` bei **jedem** Autosave (alle 1,5 s) einen Erfolgs-Toast. Das ist beim Live-Tippen unerträglich.

In `src/hooks/useBelegEditor.ts`:
- `save(opts?: { silent?: boolean })` — Toast nur, wenn nicht silent.
- Autosave (Timer-Pfad) ruft `save({ silent: true })`. Status zeigt der Header bereits via „Speichere…" / „Alles gespeichert".
- Manuelles Klicken auf den „Speichern"-Button bleibt mit Toast.
- Autosave-Debounce von **1500 ms → 3000 ms**, damit beim Tippen nicht ständig gespeichert wird.
- Fehler-Toast (`toast.error`) bleibt unverändert, damit Probleme sichtbar werden.

## 2. „Magisches" Live-Gefühl — keine Reset-Welle, kein Flicker

Heute passiert nach einem Save: Server liefert das aktualisierte Objekt, der `useEffect` in `useBelegEditor` sieht „neuen Beleg" und ruft `setDraft(beleg)` — der ganze Draft wird ersetzt → Inputs verlieren Fokus, Live-Preview baut neu, fühlt sich „kurz weg" an.

Fix in `useBelegEditor.ts`:
- Hilfsfunktion `stableStringify(obj)` schließt **volatile** Server-Felder aus dem Vergleich aus: `aktualisiertAm`, `updatedAt`, `erstelltAm`, `createdAt` (Timestamps, die der Server bei jedem Patch neu setzt).
- Eintreffender Beleg wird nur dann in den Draft gespiegelt, wenn:
  - er sich semantisch (ohne Timestamps) vom letzten gespeicherten Stand unterscheidet **und**
  - der lokale Draft nicht „dirty" ist (User-Eingaben gehen sonst verloren).
- Andernfalls nur `lastSavedRef` aktualisieren — kein `setDraft`, kein React-Tree-Reset.

In `src/components/pdf-editor/LivePdfPreview.tsx`:
- PDF-Build-Debounce **300 ms → 600 ms** und nur wenn sich `stableStringify(draft)` wirklich geändert hat (Memo-Key statt direkter Referenz).
- Alte PDF-URL bleibt sichtbar, bis die neue Page geladen ist (ist heute schon so, aber Loader-Pille „aktualisiert …" wird kleiner/dezenter und erscheint erst nach 400 ms Build-Zeit, damit kurze Builds nicht aufblitzen).

Ergebnis: Beim Tippen passiert für den User nichts „Lautes" — die rechte Live-Vorschau aktualisiert sich nach kurzer Pause **ohne** dass der ganze Editor zurückspringt.

## 3. PDF-Feinschliff (Frontend + Backend identisch)

In `src/lib/pdf/belegPdf.ts` und `backend/src/pdf/layout.ts` (gespiegelt):

- **Logo noch größer**: `width: 230 / fit: [230, 100]` → `width: 270 / fit: [270, 120]`.
- **Mehr Abstand Logo ↔ Text darunter**: `pageMargins.top` von `130` → `155`. So beginnt der Adress-/Meta-Block deutlich tiefer und „atmet".
- **Footer wirklich ganz unten**: `footer()`-Wrapper-Margin `[55, 0, 55, 25]` → `[55, 0, 55, 12]`, und `pageMargins.bottom` von `130` → `100`. Damit sitzt der Footer ~12pt vom Seitenende — wie auf der Vorlage.
- **Header-Margin** `[55, 30, 55, 0]` bleibt; nur das Logo wird größer und der Absender-Text-Top-Margin nachgezogen (`35` → `50`), damit die unterstrichene Zeile nicht direkt unterm Logo klebt.

Keine weiteren Layout-Änderungen — Tabelle, Meta-Box, Outro bleiben wie zuletzt freigegeben.

## Betroffene Dateien

- `src/hooks/useBelegEditor.ts` — silent autosave, stableStringify, dirty-aware sync, debounce 3s
- `src/components/pdf-editor/LivePdfPreview.tsx` — debounce 600ms, Build-Trigger nur bei semantischem Diff, dezente Loader-Pille
- `src/lib/pdf/belegPdf.ts` — Header-Logo + Margins
- `backend/src/pdf/layout.ts` — gleiche Header-Logo + Margins

## Verifikation

1. Im Live-Editor Titel ändern → kein Toast-Spam, Header-Indikator wechselt nur dezent.
2. Schnelles Tippen → Editor-Feld behält Fokus, kein „kurz weg" der Vorschau.
3. PDF-Vorschau (Auge / Inline / Editor): Logo sichtbar größer, mehr Luft zwischen Logo und Absenderzeile, Footer am unteren Seitenrand.
