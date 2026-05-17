// Druckt ein PDF zuverlässig — ohne auf das native Browser-PDF-Plugin angewiesen
// zu sein. Das alte iframe-basierte Vorgehen produzierte in vielen Konstellationen
// nur ein leeres Blatt mit URL/Datum (weil das Plugin den Print-Befehl nicht an
// den eigentlichen PDF-Renderer weiterreichte).
//
// Neue Strategie:
//  1. PDF mit PDF.js öffnen
//  2. Jede Seite in einen Canvas rendern (hohe DPI, druckscharf)
//  3. PNG-DataURLs in ein neues Fenster mit @page-CSS schreiben
//  4. window.print() im neuen Fenster auslösen → druckt die echten Bilder
//
// Fallback (Pop-up blockiert / PDF.js-Fehler): PDF in neuem Tab öffnen,
// damit der User wenigstens manuell drucken kann.

import { configurePdfWorker } from "./pdfjsWorker";
import { pdfjs } from "react-pdf";

configurePdfWorker();

const PRINT_DPI = 2; // 2 = ~144 dpi, gutes Verhältnis Schärfe ↔ Größe

function openInNewTab(url: string): boolean {
  try {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (win) return true;
  } catch {
    /* noop */
  }
  try {
    import("sonner")
      .then(({ toast }) => {
        toast.error("Druck-Dialog konnte nicht geöffnet werden", {
          description: "Bitte Pop-ups für diese Seite zulassen.",
        });
      })
      .catch(() => {
        /* noop */
      });
  } catch {
    /* noop */
  }
  return false;
}

async function renderPdfToImages(data: ArrayBuffer): Promise<string[]> {
  // PDF.js erwartet einen frischen Buffer, der zum Worker transferiert wird.
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
  const doc = await loadingTask.promise;
  const images: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: PRINT_DPI });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas-Context nicht verfügbar");
      await page.render({ canvasContext: ctx, viewport, canvas }).promise;
      images.push(canvas.toDataURL("image/png"));
      page.cleanup();
    }
  } finally {
    try {
      await doc.cleanup();
      await doc.destroy();
    } catch {
      /* noop */
    }
  }
  return images;
}

function openPrintWindowWithImages(images: string[]): boolean {
  const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1200");
  if (!win) return false;

  const imgsHtml = images
    .map(
      (src) =>
        `<div class="page"><img src="${src}" alt="" /></div>`,
    )
    .join("\n");

  win.document.open();
  win.document.write(`<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Drucken</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page { page-break-after: always; display: flex; align-items: center; justify-content: center; }
  .page:last-child { page-break-after: auto; }
  .page img { width: 100%; height: auto; display: block; }
  @media screen {
    body { padding: 16px; background: #f3f4f6; }
    .page { background: #fff; box-shadow: 0 1px 4px rgba(0,0,0,0.1); margin: 0 auto 16px; max-width: 800px; }
  }
  @media print {
    body { padding: 0; background: #fff; }
    .page { margin: 0; }
  }
</style>
</head>
<body>
${imgsHtml}
<script>
  (function() {
    var imgs = document.images;
    var pending = imgs.length;
    function done() {
      if (--pending > 0) return;
      setTimeout(function () {
        try { window.focus(); window.print(); } catch (e) {}
        try {
          window.onafterprint = function () { setTimeout(function () { window.close(); }, 200); };
        } catch (e) {}
      }, 150);
    }
    if (pending === 0) { done(); pending = 1; }
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].complete) { done(); }
      else { imgs[i].addEventListener('load', done); imgs[i].addEventListener('error', done); }
    }
  })();
</script>
</body>
</html>`);
  win.document.close();
  return true;
}

async function printPdfFromArrayBuffer(data: ArrayBuffer, fallbackUrl: string | null): Promise<void> {
  let images: string[] = [];
  try {
    images = await renderPdfToImages(data);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[printPdf] render failed", err);
    if (fallbackUrl) openInNewTab(fallbackUrl);
    return;
  }
  if (images.length === 0) {
    if (fallbackUrl) openInNewTab(fallbackUrl);
    return;
  }
  const opened = openPrintWindowWithImages(images);
  if (!opened && fallbackUrl) openInNewTab(fallbackUrl);
}

/** Druckt eine vorhandene Blob-URL. URL wird NICHT freigegeben (gehört dem Caller). */
export async function printPdfBlobUrl(url: string): Promise<void> {
  try {
    const res = await fetch(url);
    const buf = await res.arrayBuffer();
    await printPdfFromArrayBuffer(buf, url);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error("[printPdf] fetch failed", err);
    openInNewTab(url);
  }
}

/** Druckt einen frischen Blob. */
export async function printPdfBlob(blob: Blob): Promise<void> {
  const buf = await blob.arrayBuffer();
  const url = URL.createObjectURL(blob);
  try {
    await printPdfFromArrayBuffer(buf, url);
  } finally {
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* noop */
      }
    }, 60_000);
  }
}
