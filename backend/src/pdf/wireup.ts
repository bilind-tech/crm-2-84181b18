// Verbindet Belege-Events mit PDF-Cache-Invalidation. Wird einmal beim Boot aufgerufen.
import { onBelegMutated } from "../belege/events.js";
import { invalidatePdfCache } from "./belegPdf.server.js";

let wired = false;

export function wirePdfCacheInvalidation(): void {
  if (wired) return;
  wired = true;
  onBelegMutated((art, id) => invalidatePdfCache(art, id));
}
