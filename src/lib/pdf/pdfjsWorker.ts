// PDF.js Worker einmalig konfigurieren.
// WICHTIG: react-pdf v10 verlangt, dass workerSrc im gleichen Modul gesetzt wird,
// in dem <Document>/<Page> verwendet werden — sonst überschreibt der Default
// "pdf.worker.mjs" diese Konfiguration durch die Modul-Lade-Reihenfolge.
// Wir exportieren daher eine Funktion, die jedes Viewer-Modul direkt nach dem
// `pdfjs`-Import aufruft.
import { pdfjs } from "react-pdf";

// Vite löst diese URL bundle-zeitlich auf, der Worker wird mit ausgeliefert.
const workerUrl = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export function configurePdfWorker(): void {
  // Immer setzen — Default "pdf.worker.mjs" ist ungültig.
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
}

// Auch beim Modulladen direkt setzen (defensive)
configurePdfWorker();
