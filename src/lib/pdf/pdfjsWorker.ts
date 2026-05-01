// PDF.js Worker einmalig konfigurieren. Importiere diese Datei einmal,
// bevor react-pdf gerendert wird (in PdfViewerDialog).
import { pdfjs } from "react-pdf";
// Vite gibt die URL des Workers zurück, der dann vom Browser geladen wird.
// Worker-Datei wird mitgebundlet — keine Laufzeit-Installation nötig.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

if (!pdfjs.GlobalWorkerOptions.workerSrc) {
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
}
