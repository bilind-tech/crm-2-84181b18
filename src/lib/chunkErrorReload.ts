// Auto-Reload bei Chunk-Load-Fehlern.
//
// Nach einem Deploy/Update zeigt die alte SPA-Shell im Browser auf
// Chunk-URLs, die nicht mehr existieren. Beim ersten Lazy-Import-Versuch
// schlägt das Script-Fetch fehl ("Importing a module script failed" /
// "Failed to fetch dynamically imported module" / "ChunkLoadError").
//
// Strategie:
//   1. Beim ersten Auftreten pro Tab-Session einmal `location.reload()`,
//      damit die frische `index.html` mit neuen Chunk-Hashes geladen wird.
//   2. Beim zweiten Mal NICHT erneut reloaden (verhindert Reload-Loops),
//      sondern den Fehler stehen lassen + Toast.
//   3. Nach erfolgreichem App-Mount (siehe clearChunkReloadFlag) wird das
//      Flag wieder gelöscht.

import { toast } from "sonner";

const FLAG = "mcc.chunkReloadedOnce";

function isChunkError(msg?: string | null): boolean {
  if (!msg) return false;
  return (
    msg.includes("Importing a module script failed") ||
    msg.includes("Failed to fetch dynamically imported module") ||
    msg.includes("error loading dynamically imported module") ||
    msg.includes("ChunkLoadError")
  );
}

export function isLikelyChunkError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "string") return isChunkError(error);
  const anyErr = error as { name?: string; message?: string };
  if (anyErr.name === "ChunkLoadError") return true;
  return isChunkError(anyErr.message);
}

let installed = false;

export function installChunkErrorReload() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const handle = (msg?: string | null) => {
    if (!isChunkError(msg)) return;
    try {
      if (sessionStorage.getItem(FLAG)) {
        toast.error("Aktualisierung fehlgeschlagen — bitte Seite manuell neu laden.");
        return;
      }
      sessionStorage.setItem(FLAG, "1");
    } catch {
      // sessionStorage kann blockiert sein — dann lieber nicht reloaden
      return;
    }
    // kleiner Delay, damit der aktuelle Stack abklingt
    setTimeout(() => location.reload(), 50);
  };

  window.addEventListener("error", (e) => handle(e.message));
  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason as { message?: string } | string | undefined;
    handle(typeof reason === "string" ? reason : reason?.message);
  });
}

export function clearChunkReloadFlag() {
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    // ignore
  }
}
