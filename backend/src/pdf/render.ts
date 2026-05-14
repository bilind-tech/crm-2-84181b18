// Render-Pipeline: docDefinition -> Buffer.
// pdfmake liefert einen PDFKitDocument-Stream; wir sammeln zu einem Buffer.

import { getPrinter } from "./printer.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function renderPdf(docDef: any): Promise<Buffer> {
  const printer = getPrinter();
  let stream;
  try {
    stream = printer.createPdfKitDocument(docDef);
  } catch (e) {
    throw new Error(`pdfmake: ${(e as Error).message ?? String(e)}`);
  }
  return await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err: Error) =>
      reject(new Error(`pdfmake-Stream: ${err.message ?? String(err)}`)),
    );
    stream.end();
  });
}
