// Hilfsfunktionen für Datei-Upload (Drag&Drop, Klick, Handy-Scan).
// Bildkompression läuft client-seitig, damit Mobile-Uploads schnell durchgehen.

import type { Dokument, DokumentTyp } from "@/lib/api/types";

export const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const ACCEPT_PATTERN = "image/*,application/pdf";

/** Liest Datei als Data-URL. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    r.readAsDataURL(file);
  });
}

/** Komprimiert ein Bild auf max. `maxLong` Pixel lange Kante, JPEG ~0.8 Qualität. */
export async function compressImage(file: File, maxLong = 1600, quality = 0.8): Promise<string> {
  if (!file.type.startsWith("image/")) return fileToDataUrl(file);
  const dataUrl = await fileToDataUrl(file);
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxLong / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      try {
        resolve(canvas.toDataURL("image/jpeg", quality));
      } catch {
        resolve(dataUrl);
      }
    };
    img.onerror = () => reject(new Error("Bild konnte nicht decodiert werden"));
    img.src = dataUrl;
  });
}

export function dokumentTypAusMime(mime: string): DokumentTyp {
  if (mime.startsWith("image/")) return "bild";
  if (mime === "application/pdf") return "rechnung";
  return "sonstiges";
}

/** Wandelt eine File in ein partielles Dokument-Objekt um (mit komprimierter Data-URL). */
export async function fileToDokumentPayload(
  file: File,
  opts?: { kundeId?: string; objektId?: string; quelle?: Dokument["quelle"]; titel?: string },
): Promise<Partial<Dokument>> {
  if (file.size > MAX_BYTES) {
    throw new Error(`Datei "${file.name}" ist größer als 20 MB.`);
  }
  const url = file.type.startsWith("image/")
    ? await compressImage(file)
    : await fileToDataUrl(file);
  return {
    titel: opts?.titel ?? file.name,
    dateiname: file.name,
    mimeType: file.type || "application/octet-stream",
    groesseBytes: file.size,
    url,
    typ: dokumentTypAusMime(file.type),
    kundeId: opts?.kundeId,
    objektId: opts?.objektId,
    steuerrelevant: false,
    quelle: opts?.quelle ?? "upload",
  };
}
