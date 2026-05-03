## Ziel

PDF-Vorschau auf Detailseiten (Angebote/Rechnungen) lädt nur **einmal** beim ersten Öffnen, danach sofort aus dem Cache — und wird nach Editor-Änderungen sauber durch die neue Version ersetzt. Wording: „erstellt" statt „erzeugt".

## Status-Check (was schon stimmt)

Das Backend macht das bereits richtig:
- `backend/src/pdf/cache.ts` legt PDFs unter `{dataDir}/pdf-cache/{art}/{id}-{hash}.pdf` ab, atomar via `rename`, und **löscht beim Schreiben automatisch alle alten Hash-Dateien zur selben ID**. Es gibt also nie zwei Versionen pro Beleg.
- `wirePdfCacheInvalidation` invalidiert den Cache automatisch beim `beleg:mutated`-Event (das der Editor-Save bereits feuert).
- Die Route `/rechnungen/:id/pdf` liefert ETag + `X-Pdf-Cache: hit/miss` und unterstützt 304.

Das Problem liegt **rein im Frontend**:
1. `useBelegPdf` ruft bei jedem Mount erneut `fetchBackendPdf` auf, ohne React-Query — d.h. Detail-Seite zu/auf = neuer Fetch + neuer Loader.
2. Der Hook zeigt „loading" auch bei Cache-Hits (sub-100 ms), was als Flackern wirkt.
3. Im Mock-Modus (Lovable-Preview) wird jedes Mal komplett neu im Browser gebaut — daher der lange Spinner.
4. Wording „erzeugt" statt „erstellt".

## Umsetzung

### 1. PDF-Hook auf React Query umbauen (`src/hooks/useBelegPdf.ts`)

`useAngebotPdf` / `useRechnungPdf` werden zu `useQuery`-basierten Hooks:

- QueryKey: `["pdf", art, id]` — pro Beleg nur **eine** Query, geräteweit gecached.
- `staleTime: Infinity`, `gcTime: 30 min` → solange App offen, nie nachladen.
- `queryFn`:
  - Backend-Modus: `fetch /{art}/:id/pdf` → `Blob` + ETag aus Header lesen, beides zurückgeben.
  - Mock-Modus: `generateRechnungPdf/...` aufrufen, Blob zurückgeben.
- Rückgabe: stabiler `blobUrl` — wird in `useMemo` aus dem Blob gebaut und beim Unmount via `URL.revokeObjectURL` freigegeben (über einen `useEffect`-Cleanup, der den vorigen Blob revoked, sobald ein neuer kommt).
- `status` mappt von Query-State: `idle | loading | ready | error`. **„loading" wird nur beim allerersten Fetch gezeigt** — jeder weitere Mount derselben ID liefert sofort `data` und damit `ready`.

### 2. Cache-Invalidation nach Editor-Speichern

- In `useBelegEditor` (Save-Mutation) nach erfolgreichem PATCH: `queryClient.invalidateQueries({ queryKey: ["pdf", art, id] })`.
- Zusätzlich im `useLiveEvents`-Handler für `beleg:mutated`: gleiche Invalidation. Damit greift der Refresh auch auf anderen Geräten/Tabs.
- Backend überschreibt physisch beim nächsten Render — alte Datei verschwindet (passiert schon in `writeCached`).

### 3. Mock-Backend: PDF-Cache im Speicher

Im Mock-Modus (Lovable-Preview) gibt es keinen Pi. Damit das Verhalten gleich aussieht:
- Modul-lokale `Map<string, Blob>` keyed auf `${art}:${id}:${semantischer-hash}` in `src/lib/pdf/belegPdf.ts`.
- Vor `generateAngebotPdf/...` Cache prüfen, nach Build füllen. Bei semantischer Änderung des Belegs entsteht neuer Key, alter Blob darf garbage-collected werden (wir behalten max. 50 Einträge LRU).

### 4. Wording & Loader-Politik

- `PdfPreviewCard.tsx`: „PDF wird erzeugt …" → „PDF wird erstellt …".
- Loader (Spinner + Text) **nur** zeigen, wenn `status === "loading"` UND kein vorheriger Blob für diese ID existiert (also wirklich erster Build). Bei Re-Mount mit Cache-Hit: kein Loader, direkt PDF.
- Spinner nicht mit künstlichem Delay aus-/einblenden — mit React-Query-Cache entsteht das Flackern gar nicht erst.

### 5. Garantien (Anti-Bug-Leitplanken)

- Live-Editor → Detailseite: Editor-Save-Mutation invalidiert Query, Detailseite holt neue PDF (1× Loader, dann fest).
- Backend stellt sicher, dass im Cache-Verzeichnis pro `id` immer nur **eine** `.pdf` existiert (`writeCached` löscht andere Hashes derselben ID atomar **nach** erfolgreichem `rename`).
- Bei Render-Fehler bleibt die alte Cache-Datei erhalten (kein Datenverlust), Frontend zeigt Fehler.
- ETag-Header bleibt erhalten — Browser-Reload nutzt 304.
- Drive-Upload-Pfad bleibt unberührt (orthogonal zum Cache).

## Geänderte Dateien

- `src/hooks/useBelegPdf.ts` — komplette Umstellung auf React Query
- `src/lib/pdf/belegPdf.ts` — kleine LRU-Cache-Map für Mock-Modus
- `src/hooks/useBelegEditor.ts` — Query-Invalidation nach Save
- `src/hooks/useLiveEvents.ts` — Invalidation bei `beleg:mutated`
- `src/components/pdf/PdfPreviewCard.tsx` — Wording „erstellt", Loader-Logik

Backend und Cache-Disk-Layout bleiben unverändert.
