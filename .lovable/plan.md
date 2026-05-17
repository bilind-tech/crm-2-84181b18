## Ziel

Beim Klick auf „Drucken" (Angebot, Rechnung, Übergabeprotokoll, Schlüsselübergabe, Dokument-Viewer) soll **direkt der Browser-Druckdialog** des aktuellen Tabs erscheinen — kein zusätzliches Fenster, kein Pop-up, kein zweiter Tab. Im Druckdialog muss das PDF (alle Seiten) sauber sichtbar/druckbar sein.

## Was geändert wird

Nur eine einzige Datei: `src/lib/pdf/printBlob.ts`.

Der Rest (`PrintButton`, alle Aufrufer in Angebot/Rechnung/Protokoll/Werkzeuge/Dokumente) bleibt unverändert — sie rufen weiter `printPdfBlob` / `printPdfBlobUrl` auf.

## Neue Druck-Strategie

1. PDF mit PDF.js zu Seiten-Canvases rendern (wie bisher, druckscharf).
2. Aus den Bild-DataURLs eine kleine HTML-Seite mit `@page A4`-CSS bauen.
3. **Verstecktes `<iframe>` im aktuellen Dokument** einfügen (off-screen, 0×0, `aria-hidden`), Inhalt per `srcdoc` setzen.
4. Wenn alle Bilder im Iframe geladen sind → `iframe.contentWindow.focus(); iframe.contentWindow.print();` → Browser zeigt seinen nativen Druckdialog im aktuellen Tab.
5. Nach `onafterprint` (bzw. Timeout-Fallback) Iframe wieder aus dem DOM entfernen und Blob-URLs aufräumen.

Damit verschwindet `window.open(...)` komplett aus dem Erfolgs-Pfad. Es wird kein neues Fenster mehr geöffnet — der Druckdialog kommt direkt vom Browser.

## Warum Iframe und nicht direkt `window.print()` der Seite

`window.print()` würde die komplette App drucken. Wir brauchen ein isoliertes Dokument mit nur den PDF-Seiten — das leistet das Iframe. Da der Iframe-Inhalt **gerenderte PNGs** sind (kein eingebettetes PDF mehr), greift das alte Problem mit dem nativen PDF-Plugin („leeres Blatt mit URL/Datum") nicht — die Bilder werden zuverlässig gedruckt.

## Fallback-Verhalten

Nur falls das Iframe-Rendern hart fehlschlägt (PDF.js-Fehler oder Iframe-`contentWindow` nicht verfügbar), wird als letztes Mittel die PDF-URL als Download angeboten — kein automatisches Pop-up mehr.

## Technische Details

`printBlob.ts` (vereinfacht):

```text
async function printViaHiddenIframe(images: string[]) {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const html = `<!doctype html><html><head><meta charset="utf-8">
    <style>
      @page { size: A4; margin: 0; }
      html,body{margin:0;padding:0;background:#fff;}
      .page{page-break-after:always;}
      .page:last-child{page-break-after:auto;}
      .page img{width:100%;height:auto;display:block;}
    </style></head><body>
    ${images.map((s) => `<div class="page"><img src="${s}"></div>`).join("")}
    </body></html>`;
  iframe.srcdoc = html;

  await new Promise<void>((resolve) => {
    iframe.onload = () => {
      const win = iframe.contentWindow!;
      const imgs = win.document.images;
      let pending = imgs.length || 1;
      const done = () => {
        if (--pending > 0) return;
        win.focus();
        win.print();
        resolve();
      };
      if (!imgs.length) done();
      for (const img of Array.from(imgs)) {
        if (img.complete) done();
        else {
          img.addEventListener("load", done);
          img.addEventListener("error", done);
        }
      }
    };
  });

  const cleanup = () => iframe.remove();
  iframe.contentWindow?.addEventListener("afterprint", () =>
    setTimeout(cleanup, 200),
  );
  setTimeout(cleanup, 60_000); // Hard-Fallback
}
```

- `openPrintWindowWithImages` und `openInNewTab` aus dem Erfolgs-Pfad entfernen.
- `printPdfBlob` / `printPdfBlobUrl` rufen intern nur noch `renderPdfToImages` + `printViaHiddenIframe` auf.
- Bei hartem Fehler: einmaliger Toast („Drucken fehlgeschlagen") statt Pop-up-Versuch.

## Out of Scope

- Keine Änderungen am PDF-Inhalt, an PDF-Generierung, Layouts oder Datenfluss.
- Keine Änderungen an Aufrufern (`angebote.$id.tsx`, `rechnungen.$id.tsx`, `protokolle.$id.tsx`, `werkzeuge.*`, `DokumentViewer`, `PdfViewerDialog`).
- Keine zusätzlichen Dependencies (kein jsPDF/html2canvas — PDF.js liefert schon scharfe Seiten-Bilder).
