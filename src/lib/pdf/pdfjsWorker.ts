// PDF.js Worker einmalig konfigurieren.
// WICHTIG: react-pdf v10 verlangt, dass workerSrc im gleichen Modul gesetzt wird,
// in dem <Document>/<Page> verwendet werden — sonst überschreibt der Default
// "pdf.worker.mjs" diese Konfiguration durch die Modul-Lade-Reihenfolge.
// Wir exportieren daher eine Funktion, die jedes Viewer-Modul direkt nach dem
// `pdfjs`-Import aufruft.
import { pdfjs } from "react-pdf";

// Vite löst diese URL bundle-zeitlich auf, der Worker wird mit ausgeliefert.
let workerUrl: string;
try {
  workerUrl = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
} catch {
  // CDN-Fallback exakt zur API-Version (verhindert Mismatch).
  workerUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

export function configurePdfWorker(): void {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[pdfjs] API version:", pdfjs.version, "worker:", workerUrl);
  }
}

// Auch beim Modulladen direkt setzen (defensive)
configurePdfWorker();
