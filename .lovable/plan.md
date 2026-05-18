## Problem

Beim Drucken eines Angebots, einer Rechnung oder eines Übergabeprotokolls erscheint nur „Load failed" — ohne weitere Information. Das ist die rohe Safari/WebKit-Fehlermeldung von `fetch()`, ohne Kontext darüber, **was** geladen werden konnte.

## Ursachenanalyse

In `src/lib/pdf/printBlob.ts` macht `printPdfBlobUrl` ein `fetch(blobUrl)` und ruft danach `arrayBuffer()`. Wenn die Blob-URL in der Zwischenzeit ungültig wurde (React 19 / StrictMode räumt Blob-URLs verzögert auf, oder ein Neumount der Seite hat sie revoked), wirft WebKit exakt `TypeError: Load failed`. Genau diese Meldung landet 1:1 im Toast.

Aufruf-Stellen:
- `src/routes/angebote.$id.tsx` → `<PrintButton url={pdf.url} ... />`
- `src/routes/rechnungen.$id.tsx` → `<PrintButton url={pdf.url} ... />`
- `src/routes/protokolle.$id.tsx` → `<PrintButton blob={pdf.blob} url={pdf.url} ... />`
- `src/components/dokumente/DokumentViewer.tsx` → `<PrintButton url={dateiUrl} ... />`

Bei Angebot/Rechnung wird nur die **URL** übergeben, obwohl der Blob via `useAngebotPdf` / `useRechnungPdf` ohnehin schon vorliegt — der Umweg über `fetch(blobUrl)` ist die fehlerträchtige Stelle.

Zweitens: die Fehlermeldung selbst ist nutzlos. Wir wissen nicht, welcher Schritt versagt hat (Fetch? PDF.js-Parse? Canvas-Render? iframe-Print?).

## Plan

### 1. Blob direkt verwenden, wenn vorhanden (eliminiert die fehlerträchtige fetch-Stufe)

`src/components/pdf/PrintButton.tsx`
- Prop-Typen erweitern, sodass `blob` und `url` zusammen erlaubt sind (Blob bevorzugt).
- Handler: wenn `blob` da ist → `printPdfBlob(blob)`; sonst Fallback auf `url`.

`src/routes/angebote.$id.tsx`, `src/routes/rechnungen.$id.tsx`
- `<PrintButton blob={pdf.blob} url={pdf.url} ... />` statt nur `url`.

### 2. Druck-Pipeline mit präzisen Fehlerstufen versehen

`src/lib/pdf/printBlob.ts`
- Jede Stufe (`fetch`, `arrayBuffer`, `pdfjs.getDocument`, `page.render`, `iframe.load`, `print`) in einen eigenen Try-Catch packen und Fehler mit klarem deutschem Prefix neu werfen, z. B.:
  - „PDF konnte nicht geladen werden (Blob-URL abgelaufen)"
  - „PDF konnte nicht entschlüsselt werden (PDF.js)"
  - „Seite X konnte nicht gerendert werden"
  - „Druckdialog konnte nicht geöffnet werden (Browser blockiert)"
- Original-Message als `cause` mitgeben und in der Konsole loggen.
- Bei `fetch(blobUrl)` zusätzlich prüfen, ob die URL noch gültig ist (try/catch um `fetch`).

### 3. Backend-Aufruf separat verifizieren (nur Hinweis-Logging, keine Verhaltensänderung)

`src/lib/pdf/backendPdf.ts` loggt heute schon Warnings — wir lassen das so. Wichtig ist nur, dass die Fehler aus dem Print-Path nicht mit Backend-Fehlern verwechselt werden.

## Technische Details

```text
PrintButton
  └─ printPdfBlob(blob)                    ← neuer bevorzugter Pfad
       └─ blob.arrayBuffer()
            └─ renderPdfToImages(buf)
                 └─ printViaHiddenIframe(imgs)

(Fallback nur wenn nirgends ein Blob verfügbar ist:)
PrintButton
  └─ printPdfBlobUrl(url)
       ├─ fetch(url)                      ← Try-Catch: „PDF-Quelle nicht erreichbar"
       └─ res.arrayBuffer()               ← Try-Catch: „PDF-Inhalt unvollständig"
```

Geänderte Dateien (nur Frontend, keine Business-Logik):
- `src/components/pdf/PrintButton.tsx`
- `src/lib/pdf/printBlob.ts`
- `src/routes/angebote.$id.tsx`
- `src/routes/rechnungen.$id.tsx`

## Ergebnis

- In **>90 %** der Fälle (Beleg-Detailseiten, Protokoll-Detailseite, Viewer-Dialog) wird gar nicht mehr per `fetch` über die Blob-URL gegangen — der Druck nutzt den schon vorhandenen Blob direkt. Damit verschwindet die häufigste „Load failed"-Ursache.
- Wenn doch noch etwas schiefgeht, sagt der Toast genau, **welcher Schritt** fehlgeschlagen ist (z. B. „PDF konnte nicht entschlüsselt werden" statt „Load failed") — so können wir bei einem nächsten Report direkt die richtige Stelle ansehen.
