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

function wrapError(stage: string, err: unknown): Error {
  const original = err instanceof Error ? err : new Error(String(err));
  const msg = original.message || String(err) || "unbekannt";
  const wrapped = new Error(`${stage} (${msg})`);
  (wrapped as Error & { cause?: unknown }).cause = original;
  return wrapped;
}

async function renderPdfToImages(data: ArrayBuffer): Promise<string[]> {
  let doc;
  try {
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(data) });
    doc = await loadingTask.promise;
  } catch (err) {
    throw wrapError("PDF konnte nicht gelesen werden", err);
  }
  const images: string[] = [];
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      try {
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
      } catch (err) {
        throw wrapError(`Seite ${i} konnte nicht gerendert werden`, err);
      }
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
  .page {
    width: 210mm;
    height: 297mm;
    page-break-after: always;
    overflow: hidden;
  }
  .page:last-child { page-break-after: auto; }
  .page img {
    width: 210mm;
    height: 297mm;
    display: block;
    object-fit: contain;
  }
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
      reject(new Error("Druck-Vorschau konnte nicht geladen werden (Iframe-Fehler)"));
    });
  });
}

async function printPdfFromArrayBuffer(data: ArrayBuffer): Promise<void> {
  if (!data || data.byteLength === 0) {
    throw new Error("PDF-Inhalt ist leer");
  }
  const images = await renderPdfToImages(data);
  await printViaHiddenIframe(images);
}

/** Druckt eine vorhandene Blob-URL. URL wird NICHT freigegeben (gehört dem Caller). */
export async function printPdfBlobUrl(url: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    throw wrapError("PDF-Quelle nicht erreichbar (Blob-URL evtl. abgelaufen)", err);
  }
  if (!res.ok) {
    throw new Error(`PDF-Quelle antwortete HTTP ${res.status}`);
  }
  let buf: ArrayBuffer;
  try {
    buf = await res.arrayBuffer();
  } catch (err) {
    throw wrapError("PDF-Inhalt konnte nicht gelesen werden", err);
  }
  await printPdfFromArrayBuffer(buf);
}

/** Druckt einen frischen Blob. */
export async function printPdfBlob(blob: Blob): Promise<void> {
  let buf: ArrayBuffer;
  try {
    buf = await blob.arrayBuffer();
  } catch (err) {
    throw wrapError("PDF-Blob konnte nicht gelesen werden", err);
  }
  await printPdfFromArrayBuffer(buf);
}
