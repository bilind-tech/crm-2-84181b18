// Hilfsfunktionen für Datei-Upload.
// Multipart-POST (Datei + Meta-JSON) gegen `/dokumente`
// bzw. `/upload-sessions/:token/dokumente`.

import type { Dokument, DokumentTyp } from "@/lib/api/types";
import { getBackendUrl } from "@/lib/api/backendUrl";
import { piApi, postWithProgress } from "@/lib/api/piClient";

export const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
export const ACCEPT_PATTERN = "image/*,application/pdf";

/** Liest Datei als Data-URL (nur für Mock-Fallback). */
export function fileToDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(new Error("Datei konnte nicht gelesen werden"));
    r.readAsDataURL(file);
  });
}

/** Komprimiert ein Bild auf max. `maxLong` Pixel lange Kante, JPEG ~0.8 Qualität. */
export async function compressImage(file: File, maxLong = 1600, quality = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  const dataUrl = await fileToDataUrl(file);
  return new Promise<Blob>((resolve) => {
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, maxLong / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(file);
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob((blob) => resolve(blob ?? file), "image/jpeg", quality);
    };
    img.onerror = () => resolve(file);
    img.src = dataUrl;
  });
}

export function dokumentTypAusMime(mime: string): DokumentTyp {
  if (mime.startsWith("image/")) return "bild";
  if (mime === "application/pdf") return "rechnung";
  return "sonstiges";
}

export interface DokumentMeta {
  titel?: string;
  beschreibung?: string;
  typ?: DokumentTyp;
  kundeId?: string;
  objektId?: string;
  dokumentdatum?: string;
  betrag?: number;
  steuerrelevant?: boolean;
  ustSatz?: number;
  faelligAm?: string;
  quelle?: Dokument["quelle"];
}

/** Datei + Meta vorbereiten (Bild ggf. komprimieren). */
export async function prepareUpload(
  file: File,
  meta: DokumentMeta,
): Promise<{ blob: Blob; filename: string; mimeType: string; meta: DokumentMeta }> {
  if (file.size > MAX_BYTES) {
    throw new Error(`Datei "${file.name}" ist größer als 20 MB.`);
  }
  const blob = file.type.startsWith("image/") ? await compressImage(file) : file;
  const mimeType = blob.type || file.type || "application/octet-stream";
  return {
    blob,
    filename: file.name,
    mimeType,
    meta: {
      ...meta,
      titel: meta.titel ?? file.name,
      typ: meta.typ ?? dokumentTypAusMime(mimeType),
    },
  };
}

function buildFormData(blob: Blob, filename: string, meta: DokumentMeta): FormData {
  const fd = new FormData();
  fd.append("file", blob, filename);
  fd.append("meta", JSON.stringify(meta));
  return fd;
}

/** Klein-Helfer: liefert kompletten Pfad zur Backend-URL (Mock liefert dataURL). */
export function dokumentDateiUrl(d: Pick<Dokument, "url">): string {
  if (!d.url) return "";
  if (d.url.startsWith("data:") || d.url.startsWith("http") || d.url.startsWith("blob:")) {
    return d.url;
  }
  // Server-relative URL → vor Pi-Backend hängen
  return `${getBackendUrl()}${d.url}`;
}

/** Lädt eine Datei mit Auth-Cookies und gibt eine Blob-URL zurück. Caller muss URL.revokeObjectURL() aufrufen. */
export async function fetchDokumentBlobUrl(d: Pick<Dokument, "url">): Promise<string> {
  if (!d.url) return "";
  if (d.url.startsWith("data:") || d.url.startsWith("blob:")) return d.url;
  const url = dokumentDateiUrl(d);
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`Datei nicht ladbar (${res.status})`);
  const blob = await res.blob();
  return URL.createObjectURL(blob);
}

/** Lädt Datei ans Backend. */
export async function uploadDokument(
  file: File,
  meta: DokumentMeta,
  opts: { onProgress?: (ratio: number) => void; signal?: AbortSignal } = {},
): Promise<Dokument> {
  const prep = await prepareUpload(file, meta);
  return postWithProgress<Dokument>(
    "/dokumente",
    buildFormData(prep.blob, prep.filename, prep.meta),
    opts.onProgress,
    opts.signal,
  );
}

/** Lädt Datei in eine Upload-Session. */
export async function uploadDokumentToSession(
  token: string,
  file: File,
  meta: DokumentMeta = {},
): Promise<Dokument> {
  const prep = await prepareUpload(file, meta);
  return piApi.post<Dokument>(
    `/upload-sessions/${token}/dokumente`,
    buildFormData(prep.blob, prep.filename, prep.meta),
  );
}

/** Lädt Datei in eine Upload-Session – mit Progress-Callback. */
export async function uploadDokumentToSessionMitProgress(
  token: string,
  file: File,
  meta: DokumentMeta = {},
  onProgress?: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<Dokument> {
  const prep = await prepareUpload(file, meta);
  return postWithProgress<Dokument>(
    `/upload-sessions/${token}/dokumente`,
    buildFormData(prep.blob, prep.filename, prep.meta),
    onProgress,
    signal,
  );
}
