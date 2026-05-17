// Druckt ein PDF direkt aus dem aktuellen Tab — ohne neues Fenster / Pop-up.
//
// Strategie:
//  1. PDF mit PDF.js öffnen
//  2. Jede Seite druckscharf in einen Canvas rendern (PNG-DataURL)
//  3. Bilder in ein verstecktes Inline-<iframe> einbetten (srcdoc + @page A4)
//  4. iframe.contentWindow.print() → nativer Browser-Druckdialog im aktuellen Tab
//  5. Nach onafterprint Iframe entfernen
//
// Damit gibt es keinen window.open()-Aufruf mehr im Erfolgs-Pfad. Da der
// Iframe-Inhalt gerenderte PNGs sind (kein eingebettetes PDF), greift das
// alte Problem des nativen PDF-Plugins ("leeres Blatt") nicht.

import { configurePdfWorker } from "./pdfjsWorker";
import { pdfjs } from "react-pdf";

configurePdfWorker();

const PRINT_DPI = 2; // ~144 dpi — gutes Verhältnis Schärfe ↔ Größe

async function renderPdfToImages(data: ArrayBuffer): Promise<string[]> {
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

function buildPrintHtml(images: string[]): string {
  const imgs = images
    .map((src) => `<div class="page"><img src="${src}" alt="" /></div>`)
    .join("\n");
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>Drucken</title>
<style>
  @page { size: A4; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page { page-break-after: always; }
  .page:last-child { page-break-after: auto; }
  .page img { width: 100%; height: auto; display: block; }
</style>
</head>
<body>
${imgs}
</body>
</html>`;
}

async function printViaHiddenIframe(images: string[]): Promise<void> {
  if (images.length === 0) throw new Error("Keine Seiten zum Drucken");

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.style.cssText =
    "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  iframe.srcdoc = buildPrintHtml(images);
  document.body.appendChild(iframe);

  const cleanup = () => {
    try {
      iframe.remove();
    } catch {
      /* noop */
    }
  };

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    iframe.addEventListener("load", () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        reject(new Error("Iframe-Fenster nicht verfügbar"));
        return;
      }
      const imgs = Array.from(win.document.images);
      let pending = imgs.length || 1;
      const triggerPrint = () => {
        if (--pending > 0) return;
        try {
          win.addEventListener("afterprint", () => setTimeout(cleanup, 300));
        } catch {
          /* noop */
        }
        // Hard-Fallback falls afterprint nicht feuert (manche Browser)
        setTimeout(cleanup, 60_000);
        try {
          win.focus();
          win.print();
          finish();
        } catch (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      };
      if (imgs.length === 0) {
        triggerPrint();
      } else {
        for (const img of imgs) {
          if (img.complete) triggerPrint();
          else {
            img.addEventListener("load", triggerPrint);
            img.addEventListener("error", triggerPrint);
          }
        }
      }
    });

    iframe.addEventListener("error", () => {
      cleanup();
      reject(new Error("Iframe-Laden fehlgeschlagen"));
    });
  });
}

async function printPdfFromArrayBuffer(data: ArrayBuffer): Promise<void> {
  const images = await renderPdfToImages(data);
  await printViaHiddenIframe(images);
}

/** Druckt eine vorhandene Blob-URL. URL wird NICHT freigegeben (gehört dem Caller). */
export async function printPdfBlobUrl(url: string): Promise<void> {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  await printPdfFromArrayBuffer(buf);
}

/** Druckt einen frischen Blob. */
export async function printPdfBlob(blob: Blob): Promise<void> {
  const buf = await blob.arrayBuffer();
  await printPdfFromArrayBuffer(buf);
}
