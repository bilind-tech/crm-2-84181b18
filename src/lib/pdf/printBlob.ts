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

type PrintTabWindow = Window & {
  __attachPdfForPrint?: (url: string) => void;
  __markPrintTabLoading?: (message?: string) => void;
  __pendingPrintPdfUrl?: string;
  __pendingPrintError?: string;
  __showPrintTabError?: (message?: string) => void;
};

function ensurePrintTabShell(winRef: Window | null): PrintTabWindow {
  if (!winRef) {
    throw new Error(
      "Druck-Tab konnte nicht geöffnet werden (Popup-Blocker?). Bitte Popups für diese Seite zulassen.",
    );
  }
  const child = winRef as PrintTabWindow;
  try {
    const doc = child.document;
    const hasShell = doc.getElementById("pdf") && doc.getElementById("loader");
    if (!hasShell) {
      doc.open();
      doc.write(buildPrintTabShellHtml());
      doc.close();
    }
    child.__markPrintTabLoading?.("PDF wird vorbereitet…");
    child.focus?.();
    return child;
  } catch (err) {
    throw wrapError("Druck-Tab konnte nicht initialisiert werden", err);
  }
}

function attachPdfToPrintTab(winRef: Window | null, blob: Blob): void {
  const child = ensurePrintTabShell(winRef);
  const url = URL.createObjectURL(blob);
  try {
    child.focus?.();
    child.__pendingPrintPdfUrl = url;
    if (typeof child.__attachPdfForPrint === "function") {
      child.__attachPdfForPrint(url);
    } else {
      const frame = child.document.getElementById("pdf") as HTMLIFrameElement | null;
      if (!frame) throw new Error("PDF-Frame im Druck-Tab nicht gefunden");
      frame.src = url;
    }
  } catch (err) {
    URL.revokeObjectURL(url);
    throw wrapError("PDF konnte nicht an den Druck-Tab übergeben werden", err);
  }
  setTimeout(() => URL.revokeObjectURL(url), 10 * 60_000);
}

/**
 * Safari-Druckpfad: Druck-Tab zuerst mit eigener HTML-Hülle initialisieren,
 * danach PDF-Blob an das Child-Window übergeben. So bleibt die User-Geste
 * erhalten und Safari erlaubt eher Fokus + `window.print()`.
 */
async function printPdfNativeTab(blob: Blob, winRef: Window | null): Promise<void> {
  attachPdfToPrintTab(winRef, blob);
}

function buildPrintTabShellHtml(): string {
  const script = `
(function(){
  var didPrint = false;
  var didClose = false;
  var closeHooksBound = false;
  var hint = document.getElementById('hint');
  var frame = document.getElementById('pdf');
  var loader = document.getElementById('loader');
  var status = document.getElementById('status');
  var hintTimer = 0;
  function setStatus(text){ if(status){ status.textContent = text || ''; } }
  function showHint(text){
    if(text && hint){ hint.textContent = text; }
    if(hint){ hint.style.display='block'; }
  }
  function hideHint(){ if(hint){ hint.style.display='none'; } }
  function showLoader(text){
    if(loader){ loader.style.display='flex'; }
    if(frame){ frame.style.display='none'; }
    setStatus(text || 'PDF wird vorbereitet…');
  }
  function showFrame(){
    if(loader){ loader.style.display='none'; }
    if(frame){ frame.style.display='block'; }
  }
  function closeSoon(delay){
    if(didClose) return;
    didClose = true;
    setTimeout(function(){
      try { window.close(); } catch(e){}
    }, delay || 200);
  }
  function bindCloseHooks(){
    if(closeHooksBound) return;
    closeHooksBound = true;
    window.addEventListener('afterprint', function(){ closeSoon(150); });
    var seenHidden = false;
    document.addEventListener('visibilitychange', function(){
      if(document.hidden){ seenHidden = true; }
      else if(seenHidden){ closeSoon(150); }
    });
    window.addEventListener('focus', function(){
      setTimeout(function(){ closeSoon(50); }, 800);
    });
    setTimeout(function(){ closeSoon(0); }, 5 * 60 * 1000);
  }
  function triggerPrint(){
    if(didPrint) return;
    didPrint = true;
    bindCloseHooks();
    showFrame();
    hideHint();
    setStatus('Druckdialog wird geöffnet…');
    try {
      window.focus();
    } catch(e){
      didPrint = false;
      showFrame();
      showHint('Falls der Druckdialog nicht erscheint: bitte zu diesem Tab wechseln und manuell drucken.');
      setStatus('Automatisches Drucken wurde blockiert.');
      return;
    }
    setTimeout(function(){
      try {
        window.print();
      } catch(e){
        didPrint = false;
        showFrame();
        showHint('Falls der Druckdialog nicht erscheint: bitte zu diesem Tab wechseln und manuell drucken.');
        setStatus('Automatisches Drucken wurde blockiert.');
      }
    }, 100);
  }
  function ready(){
    if(hintTimer){ window.clearTimeout(hintTimer); hintTimer = 0; }
    setTimeout(triggerPrint, 450);
  }
  function bindFrame(){
    if(!frame || frame.__printBound) return;
    frame.__printBound = true;
    frame.addEventListener('load', ready);
    frame.addEventListener('error', function(){
      showLoader('PDF konnte nicht geladen werden.');
      showHint('Bitte diesen Tab schließen und es erneut versuchen.');
    });
  }
  window.__markPrintTabLoading = function(message){
    didPrint = false;
    hideHint();
    showLoader(message || 'PDF wird vorbereitet…');
    try { window.focus(); } catch(e){}
  };
  window.__attachPdfForPrint = function(url){
    bindFrame();
    didPrint = false;
    hideHint();
    showLoader('PDF wird geladen…');
    try { window.focus(); } catch(e){}
    if(!frame){
      showHint('Druckansicht konnte nicht vorbereitet werden.');
      setStatus('Druckansicht fehlt.');
      return;
    }
    if(hintTimer){ window.clearTimeout(hintTimer); }
    hintTimer = window.setTimeout(function(){
      showFrame();
      showHint('Falls kein Druckdialog erscheint: bitte zu diesem Tab wechseln und Cmd+P bzw. Teilen > Drucken nutzen.');
      setStatus('PDF ist bereit.');
    }, 4000);
    frame.src = url;
  };
  window.__showPrintTabError = function(message){
    if(hintTimer){ window.clearTimeout(hintTimer); hintTimer = 0; }
    didPrint = true;
    showLoader(message || 'PDF konnte nicht vorbereitet werden.');
    showHint('Dieser Tab kann geschlossen werden.');
  };
  bindFrame();
  showLoader('PDF wird vorbereitet…');
  if(window.__pendingPrintError){
    window.__showPrintTabError(window.__pendingPrintError);
    window.__pendingPrintError = '';
  } else if(window.__pendingPrintPdfUrl){
    window.__attachPdfForPrint(window.__pendingPrintPdfUrl);
    window.__pendingPrintPdfUrl = '';
  }
})();
`.trim();
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Drucken</title>
<style>
  html, body { margin:0; padding:0; height:100%; background:#525659; }
  body { font:14px -apple-system,BlinkMacSystemFont,system-ui,sans-serif; }
  #pdf { position:fixed; inset:0; width:100%; height:100%; border:0; display:none; background:#525659; }
  #loader {
    position:fixed; inset:0; display:flex; flex-direction:column; align-items:center; justify-content:center;
    gap:14px; color:#fff; text-align:center; padding:24px;
  }
  #spinner {
    width:32px; height:32px; border-radius:999px; border:3px solid rgba(255,255,255,.28);
    border-top-color:#fff; animation:spin .8s linear infinite;
  }
  #status { max-width:360px; line-height:1.45; opacity:.95; }
  #hint {
    display:none; position:fixed; left:50%; bottom:24px; transform:translateX(-50%);
    background:#111; color:#fff; padding:10px 16px; border-radius:8px;
    font:14px -apple-system,system-ui,sans-serif; box-shadow:0 6px 24px rgba(0,0,0,.35);
    z-index:10; max-width:min(calc(100vw - 32px), 560px); text-align:center;
  }
  @keyframes spin { to { transform:rotate(360deg); } }
</style>
</head>
<body>
<iframe id="pdf" title="PDF"></iframe>
<div id="loader">
  <div id="spinner" aria-hidden="true"></div>
  <div id="status">PDF wird vorbereitet…</div>
</div>
<div id="hint">Falls der Druckdialog nicht erscheint: bitte zu diesem Tab wechseln und manuell drucken.</div>
<script>${script}</script>
</body>
</html>`;
}

export function initializePrintTab(winRef: Window | null): void {
  ensurePrintTabShell(winRef);
}

export function showPrintTabError(winRef: Window | null, message: string): void {
  if (!winRef) return;
  try {
    const child = ensurePrintTabShell(winRef);
    child.__pendingPrintError = message;
    child.__showPrintTabError?.(message);
    child.focus?.();
  } catch {
    /* noop */
  }
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
    showPrintTabError(winRef ?? null, "PDF konnte nicht geladen werden.");
    throw wrapError("PDF-Quelle nicht erreichbar (Blob-URL evtl. abgelaufen)", err);
  }
  if (!res.ok) {
    showPrintTabError(winRef ?? null, "PDF konnte nicht geladen werden.");
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
