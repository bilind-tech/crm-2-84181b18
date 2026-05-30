// Druckt ein PDF direkt aus dem aktuellen Tab — ohne neues Fenster / Pop-up.
//
// Strategie (zwei Pfade):
//
// A) Safari / WebKit (macOS, iOS):
//    Nativer PDF-Druck im neuen Tab. Das umgeht die HTML/iframe-Print-Engine
//    von WebKit, die bei rasterisierten Bildern reproduzierbar das obere
//    Drittel abschneidet und 1-seitige PDFs als 2 Seiten ausgibt.
//    Es wird ein leerer Tab synchron im User-Klick geöffnet (Popup-Blocker)
//    und sofort mit einer Blob-URL des Original-PDFs befüllt. Safari zeigt
//    den PDF-Viewer; Cmd+P → echte A4-Seitengröße ohne Beschnitt.
//
// B) Andere Browser (Chromium, Firefox):
//    PDF mit PDF.js zu PNG-Seiten rastern und in ein verstecktes Inline-Iframe
//    einbetten (srcdoc + @page A4) → iframe.contentWindow.print().

import { configurePdfWorker } from "./pdfjsWorker";
import { pdfjs } from "react-pdf";

configurePdfWorker();

const PRINT_DPI = 2; // ~144 dpi — gutes Verhältnis Schärfe ↔ Größe

/** Erkennt Safari/WebKit auf macOS und iOS (Chrome/Edge/Firefox auf Mac NICHT). */
function isWebKitSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPad/iPhone/iPod immer (alle Browser dort sind WebKit)
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  // Desktop-Safari: enthält "Safari", aber NICHT "Chrome", "Chromium", "Edg", "OPR", "Firefox"
  return /Safari/.test(ua) && !/Chrome|Chromium|Edg\/|OPR\/|Firefox/.test(ua);
}

function wrapError(stage: string, err: unknown): Error {
  const original = err instanceof Error ? err : new Error(String(err));
  const msg = original.message || String(err) || "unbekannt";
  const wrapped = new Error(`${stage} (${msg})`);
  (wrapped as Error & { cause?: unknown }).cause = original;
  return wrapped;
}

/**
 * Safari-Druckpfad: PDF nativ in neuem Tab anzeigen → User druckt aus Safaris
 * eingebautem PDF-Viewer. `winRef` MUSS synchron im User-Klick geöffnet sein.
 */
async function printPdfNativeTab(blob: Blob, winRef: Window | null): Promise<void> {
  if (!winRef) {
    throw new Error(
      "Druck-Tab konnte nicht geöffnet werden (Popup-Blocker?). Bitte Popups für diese Seite zulassen.",
    );
  }
  const url = URL.createObjectURL(blob);
  try {
    winRef.location.href = url;
  } catch (err) {
    try {
      winRef.close();
    } catch {
      /* noop */
    }
    URL.revokeObjectURL(url);
    throw wrapError("Druck-Tab konnte nicht geladen werden", err);
  }
  // URL erst nach genug Zeit freigeben, damit Safari sie laden + anzeigen + drucken kann.
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
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
  html, body {
    width: 210mm;
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 210mm;
    height: 297mm;
    box-sizing: border-box;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    /* entfernt unsichtbares Inline-Whitespace nach <img>,
       das sonst die effektive Höhe vergrößert und eine Phantom-Seite auslöst */
    line-height: 0;
    font-size: 0;
  }
  .page:last-child {
    page-break-after: auto;
    break-after: auto;
    height: auto;
  }
  .page img {
    display: block;
    width: 100%;
    height: auto;
    max-height: 297mm;
    object-fit: contain;
    object-position: top center;
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

/** Druckt eine vorhandene Blob-URL. URL wird NICHT freigegeben (gehört dem Caller).
 *  `winRef` (Safari): vorab im User-Klick geöffnetes Fenster für den nativen PDF-Tab.
 */
export async function printPdfBlobUrl(url: string, winRef?: Window | null): Promise<void> {
  let res: Response;
  try {
    res = await fetch(url);
  } catch (err) {
    if (winRef) {
      try { winRef.close(); } catch { /* noop */ }
    }
    throw wrapError("PDF-Quelle nicht erreichbar (Blob-URL evtl. abgelaufen)", err);
  }
  if (!res.ok) {
    if (winRef) {
      try { winRef.close(); } catch { /* noop */ }
    }
    throw new Error(`PDF-Quelle antwortete HTTP ${res.status}`);
  }
  if (isWebKitSafari()) {
    const blob = await res.blob();
    await printPdfNativeTab(blob, winRef ?? null);
    return;
  }
  let buf: ArrayBuffer;
  try {
    buf = await res.arrayBuffer();
  } catch (err) {
    throw wrapError("PDF-Inhalt konnte nicht gelesen werden", err);
  }
  await printPdfFromArrayBuffer(buf);
}

/** Druckt einen frischen Blob.
 *  `winRef` (Safari): vorab im User-Klick geöffnetes Fenster für den nativen PDF-Tab.
 */
export async function printPdfBlob(blob: Blob, winRef?: Window | null): Promise<void> {
  if (isWebKitSafari()) {
    await printPdfNativeTab(blob, winRef ?? null);
    return;
  }
  let buf: ArrayBuffer;
  try {
    buf = await blob.arrayBuffer();
  } catch (err) {
    throw wrapError("PDF-Blob konnte nicht gelesen werden", err);
  }
  await printPdfFromArrayBuffer(buf);
}

/** True, wenn Druck den Safari-PDF-Tab-Pfad nimmt. UI kann damit synchron
 *  im Klickhandler ein leeres `window.open()` aufrufen, um Popup-Blocker zu vermeiden. */
export function printRequiresOpenWindow(): boolean {
  return isWebKitSafari();
}
