// Druckt ein PDF (als Blob oder fertige Blob-URL) ohne Tab-Wechsel.
//
// Strategie:
//  1. Verstecktes <iframe> in den DOM hängen, src = blob-URL.
//  2. Auf 'load' → contentWindow.print() aufrufen → nativer Druck-Dialog
//     mit allen Seiten des PDFs.
//  3. Nach 'afterprint' (oder Timeout) iframe entfernen + URL freigeben.
//
// Fallback (Safari iOS, alte Browser, blockiertes iframe-print):
//  → window.open(url, "_blank") öffnet das PDF in neuem Tab; der User kann
//    von dort aus den Geräte-Druck-Dialog auslösen.

const PRINT_FALLBACK_TIMEOUT = 1500;
const CLEANUP_DELAY = 60_000;

function isLikelyIosSafari(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && "ontouchend" in document);
  const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);
  return isIos && isSafari;
}

function openInNewTab(url: string): boolean {
  try {
    const win = window.open(url, "_blank", "noopener,noreferrer");
    if (win) return true;
  } catch {
    /* noop */
  }
  try {
    import("sonner").then(({ toast }) => {
      toast.error("Druck-Dialog konnte nicht geöffnet werden", {
        description: "Bitte Pop-ups für diese Seite zulassen.",
      });
    }).catch(() => { /* noop */ });
  } catch { /* noop */ }
  return false;
}

/** Druckt eine vorhandene Blob-URL. URL wird NICHT freigegeben (gehört dem Caller). */
export function printPdfBlobUrl(url: string): void {
  if (isLikelyIosSafari()) {
    openInNewTab(url);
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.setAttribute("aria-hidden", "true");
  iframe.src = url;

  let printed = false;
  let cleaned = false;

  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      window.removeEventListener("afterprint", cleanup);
    } catch { /* noop */ }
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 100);
  };

  iframe.onload = () => {
    try {
      const cw = iframe.contentWindow;
      if (!cw) throw new Error("iframe contentWindow nicht verfügbar");
      // Etwas Zeit, damit der PDF-Plugin gerendert ist (Firefox, Edge):
      setTimeout(() => {
        try {
          cw.focus();
          cw.print();
          printed = true;
        } catch {
          openInNewTab(url);
          cleanup();
        }
      }, 50);
    } catch {
      openInNewTab(url);
      cleanup();
    }
  };

  iframe.onerror = () => {
    openInNewTab(url);
    cleanup();
  };

  document.body.appendChild(iframe);

  // Wenn print() den nativen Dialog auslöst, blockiert es synchron in Chromium
  // → afterprint feuert verlässlich. In Firefox ggf. nicht → Sicherheits-Cleanup.
  window.addEventListener("afterprint", cleanup);
  setTimeout(() => {
    if (!printed) {
      // load hat nie gefeuert → harter Fallback
      openInNewTab(url);
      cleanup();
    }
  }, PRINT_FALLBACK_TIMEOUT * 4);
  setTimeout(cleanup, CLEANUP_DELAY);
}

/** Druckt einen frischen Blob. Blob-URL wird verwaltet & wieder freigegeben. */
export function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  try {
    printPdfBlobUrl(url);
  } finally {
    // Spät freigeben — Druck-Dialog hält die Quelle solange offen.
    setTimeout(() => {
      try { URL.revokeObjectURL(url); } catch { /* noop */ }
    }, CLEANUP_DELAY);
  }
}
