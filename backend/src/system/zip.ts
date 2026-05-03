// ZIP-Extraktion mit Bomb-Schutz für Update-Pakete.
import { createReadStream, createWriteStream, mkdirSync, statSync } from "node:fs";
import path from "node:path";
import unzipper from "unzipper";

export class ZipError extends Error {
  statusCode: number;
  constructor(msg: string, status = 400) {
    super(msg);
    this.statusCode = status;
  }
}

const MAX_TOTAL_BYTES = 200 * 1024 * 1024;     // 200 MB entpackt
const MAX_FILE_BYTES = 50 * 1024 * 1024;       // 50 MB pro Datei
const MAX_FILES = 2_000;
const MAX_RATIO = 20;                          // entpackt/gepackt

// Verbotene Pfade im Paket (würden Daten überschreiben oder Build aufblähen).
const BLACKLIST = [
  ".env", "data/", "keys/", "backups/", ".git/", "node_modules/",
  "var/", "opt/", "etc/", ".ssh/",
];

// Nur diese Top-Level-Einträge dürfen im Paket vorkommen. Alles andere → Fehler.
// (Backslash-Pfade werden in extractZipSafe vorher ausgeschlossen.)
const TOP_LEVEL_ALLOWLIST = new Set([
  "manifest.json",
  "package.json",
  "package-lock.json",
  "dist",
  "migrations",
  "public",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
]);

function topLevel(rel: string): string {
  const i = rel.indexOf("/");
  return i < 0 ? rel : rel.slice(0, i);
}

function isPathSafe(rel: string): boolean {
  if (rel.startsWith("/") || rel.includes("..") || rel.includes("\\")) return false;
  if (BLACKLIST.some((b) => rel === b || rel.startsWith(b))) return false;
  if (!TOP_LEVEL_ALLOWLIST.has(topLevel(rel))) return false;
  return true;
}

/**
 * Entpackt nur das Manifest aus einem ZIP — schnell, ohne Bomb-Risiko, nur einzelnes File.
 * Rückgabe: Manifest-JSON-Inhalt als String.
 */
export async function extractManifestOnly(zipPath: string): Promise<string> {
  const directory = await unzipper.Open.file(zipPath);
  const manifestEntry = directory.files.find((f) => f.path === "manifest.json");
  if (!manifestEntry) throw new ZipError("manifest.json fehlt im Paket");
  if (manifestEntry.uncompressedSize > 256 * 1024) {
    throw new ZipError("manifest.json zu groß (>256 KB)");
  }
  const buf = await manifestEntry.buffer();
  return buf.toString("utf8");
}

/**
 * Entpackt ein ZIP sicher in `targetDir`. Wirft ZipError bei Bomb/Blacklist.
 * Stellt sicher, dass targetDir VOR dem Aufruf existiert (leer).
 */
export async function extractZipSafe(zipPath: string, targetDir: string): Promise<{
  fileCount: number;
  totalBytes: number;
}> {
  const compressedSize = statSync(zipPath).size;
  const directory = await unzipper.Open.file(zipPath);

  if (directory.files.length > MAX_FILES) {
    throw new ZipError(`Paket enthält zu viele Dateien (${directory.files.length} > ${MAX_FILES})`, 413);
  }

  let totalBytes = 0;
  let fileCount = 0;

  for (const entry of directory.files) {
    if (entry.type === "Directory") continue;
    if (!isPathSafe(entry.path)) {
      throw new ZipError(`Unzulässiger Pfad im Paket: ${entry.path}`);
    }
    if (entry.uncompressedSize > MAX_FILE_BYTES) {
      throw new ZipError(`Datei zu groß: ${entry.path} (${entry.uncompressedSize} > ${MAX_FILE_BYTES})`, 413);
    }
    totalBytes += entry.uncompressedSize;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new ZipError(`Entpackte Gesamtgröße überschreitet Limit (${MAX_TOTAL_BYTES} Bytes)`, 413);
    }
    fileCount++;
  }

  if (compressedSize > 0 && totalBytes / compressedSize > MAX_RATIO) {
    throw new ZipError("Verdächtiges Kompressionsverhältnis — möglicherweise Zip-Bomb", 413);
  }

  // Jetzt wirklich entpacken
  for (const entry of directory.files) {
    if (entry.type === "Directory") continue;
    const dest = path.join(targetDir, entry.path);
    mkdirSync(path.dirname(dest), { recursive: true });
    await new Promise<void>((resolve, reject) => {
      entry
        .stream()
        .pipe(createWriteStream(dest))
        .on("finish", () => resolve())
        .on("error", reject);
    });
  }

  return { fileCount, totalBytes };
}

/** SHA256 einer Datei. */
export async function sha256File(filePath: string): Promise<string> {
  const { createHash } = await import("node:crypto");
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    createReadStream(filePath)
      .on("data", (d) => hash.update(d))
      .on("end", () => resolve(hash.digest("hex")))
      .on("error", reject);
  });
}
