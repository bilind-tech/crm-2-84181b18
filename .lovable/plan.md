# PDF-Viewer reparieren (Versions-Mismatch)

## Ursache
Die Konsole zeigt eindeutig:
> The API version "5.4.296" does not match the Worker version "5.7.284".

- `react-pdf@10.4.1` bringt intern **pdfjs-dist 5.4.296** mit (das ist die "API").
- In `package.json` ist zusätzlich `"pdfjs-dist": "^5.7.284"` gepinnt — daraus lädt unser `pdfjsWorker.ts` den **Worker 5.7.284**.
- API ≠ Worker → PDF.js verweigert das Rendern, der Viewer zeigt „PDF kann nicht angezeigt werden". Mit dem Backend / Raspberry hat das nichts zu tun.

Auch die Detailseite zeigt nur „PDF bereit" statt der eigentlichen Vorschau, weil dort dasselbe Viewer-Komponenten-Setup darunter liegt und derselbe Fehler auftritt.

## Fix

1. **`pdfjs-dist` auf exakt `5.4.296` pinnen** (die Version, die react-pdf 10.4.1 erwartet). In `package.json`:
   ```
   "pdfjs-dist": "5.4.296"
   ```
   Danach `bun install`, damit Worker + API identisch sind.

2. **Worker-URL absichern** in `src/lib/pdf/pdfjsWorker.ts`:
   - Zusätzlich die Version aus `pdfjs.version` loggen (einmalig, dev-only), damit künftige Mismatches sofort sichtbar sind.
   - Optional Fallback: wenn `new URL(...)` aus irgendeinem Grund scheitert, auf den unpkg-CDN-Worker passend zu `pdfjs.version` zurückfallen.

3. **Inline-Vorschau auf der Rechnungs-/Angebots-Detailseite tatsächlich rendern.** Aktuell zeigt `PdfPreviewCard` nur den Status „PDF bereit". Wir lassen darin direkt die erste Seite via `<Document><Page pageNumber={1} /></Document>` (klein, ohne Toolbar) rendern, sobald die Blob-URL verfügbar ist. Bei Fehler: Hinweis + Download-Link (gleiche UX wie im Live-Editor).

4. **Keine Backend-/Raspberry-Abhängigkeit.** Die PDF-Generierung läuft komplett im Browser (pdfmake → Blob → react-pdf). Funktioniert in der Preview genauso wie später auf dem Pi.

## Dateien
- `package.json` — Version pinnen
- `src/lib/pdf/pdfjsWorker.ts` — Diagnose + Fallback
- `src/components/pdf/PdfPreviewCard.tsx` — echte Inline-Vorschau

## Erwartetes Ergebnis
- Live-Editor zeigt die PDF.
- Detailseite (Karte unten rechts) zeigt die erste Seite als Vorschau.
- Augen-Icon in der Übersicht öffnet den Viewer-Dialog mit korrekt gerenderter PDF.
- Keine Mismatch-Fehler mehr in der Konsole.
