// Render-Pipeline: docDefinition -> Buffer.
// pdfmake liefert einen PDFKitDocument-Stream; wir sammeln zu einem Buffer.

import { getPrinter } from "./printer.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderPdf(docDef: any): Promise<Buffer> {
  const printer = getPrinter();
  const stream = printer.createPdfKitDocument(docDef);
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err: Error) => reject(err));
    stream.end();
  });
}
