// pdfmake serverseitig: einmaliger PdfPrinter mit Standard-PDF-Schriften (Helvetica).
// PDFKit liefert die 14 Standard-PDF-Fonts intern; kein VFS nötig.
//
// Hinweis: Im Frontend wird "Roboto" verwendet, im Backend "Helvetica".
// Strukturelles Layout ist identisch — minimale Glyphen-Unterschiede sind akzeptabel.

// pdfmake hat keine sauberen TS-Typen für Server-Use — daher hier dezent any.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyPrinter = any;

const FONTS = {
  Helvetica: {
    normal: "Helvetica",
    bold: "Helvetica-Bold",
    italics: "Helvetica-Oblique",
    bolditalics: "Helvetica-BoldOblique",
  },
} as const;

let printerSingleton: AnyPrinter | null = null;

export function getPrinter(): AnyPrinter {
  if (printerSingleton) return printerSingleton;
  // Lazy import: pdfmake hat keine ESM-Exports, also dynamisches require über createRequire.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createRequire } = require("node:module");
  const requireCjs = createRequire(import.meta.url);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const PdfPrinter: any = requireCjs("pdfmake/src/printer.js");
  printerSingleton = new PdfPrinter(FONTS);
  return printerSingleton;
}

export const DEFAULT_FONT = "Helvetica";
