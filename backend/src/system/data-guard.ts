// =============================================================================
// DATEN-SCHUTZ-WALL
// =============================================================================
// ABSOLUTE REGEL: Bei System-Updates und allen anderen Code-Operationen darf
// NIEMALS etwas am Daten-Verzeichnis (config.dataDir, also /var/lib/mycleancenter/)
// verändert / gelöscht / überschrieben werden. Daten-Mutationen passieren AUSSCHLIESSLICH
// im kontrollierten Restore-Flow (backup/restore.ts) und im normalen App-Betrieb
// über die DB-Schicht.
//
// Dieses Modul stellt zwei Werkzeuge bereit:
//
//   1. assertCodeAndDataSeparated() — beim Boot:
//      Prüft, dass Code-Pfad (cwd / /opt/mycleancenter/current) NICHT mit
//      Daten-Pfad (config.dataDir) identisch oder verschachtelt ist.
//
//   2. assertNotInDataDir(absolutePath, opCtx?) — Zur Laufzeit vor jeder
//      Code-FS-Mutation aufrufbar. Wirft, wenn der Pfad innerhalb dataDir liegt.
//      Wird von system/runner.ts (Update-Flow) genutzt — der einzige Code-Pfad,
//      der überhaupt großflächig FS-Mutationen macht.
// =============================================================================
import path from "node:path";
import { config } from "../config.js";
import { audit } from "../auth/audit.js";

function normalizeAbs(p: string): string {
  return path.resolve(p);
}

function isSubpath(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

/** Wirft sofort, wenn der Pfad innerhalb des Daten-Verzeichnisses liegt. */
export function assertNotInDataDir(absolutePath: string, opCtx?: string): void {
  const target = normalizeAbs(absolutePath);
  const data = normalizeAbs(config.dataDir);
  if (isSubpath(data, target)) {
    const detail = opCtx ? `${opCtx} → ${target}` : target;
    audit({
      action: "data-guard.violation",
      detail: { dataDir: data, attempted: target, op: opCtx ?? null },
    });
    throw new Error(
      `DATEN-SCHUTZ-VERLETZUNG: Operation hat versucht, im Daten-Verzeichnis zu schreiben (${detail}). ` +
        `Daten dürfen nur über den kontrollierten Restore-Flow verändert werden.`,
    );
  }
}

/**
 * Inverse Guard: Pfad MUSS innerhalb dataDir liegen. Verhindert, dass der
 * Restore-Flow versehentlich außerhalb des Daten-Verzeichnisses schreibt
 * (z. B. nach Pfad-Manipulation aus einem präparierten Backup-Archiv).
 */
export function assertInsideDataDir(absolutePath: string, opCtx?: string): void {
  const target = normalizeAbs(absolutePath);
  const data = normalizeAbs(config.dataDir);
  if (!isSubpath(data, target)) {
    const detail = opCtx ? `${opCtx} → ${target}` : target;
    audit({
      action: "data-guard.outside-data",
      detail: { dataDir: data, attempted: target, op: opCtx ?? null },
    });
    throw new Error(
      `DATEN-SCHUTZ-VERLETZUNG: Restore wollte außerhalb des Daten-Verzeichnisses schreiben (${detail}).`,
    );
  }
}

/** Beim Boot einmal aufrufen — verhindert Fehlkonfiguration (Code-Ordner = Daten-Ordner). */
export function assertCodeAndDataSeparated(): void {
  const data = normalizeAbs(config.dataDir);

  // Heuristik für den Code-Ordner: Verzeichnis dieser Datei → 4 Ebenen hoch
  // (../../.. von dist/system/data-guard.js → Projekt-Root). Im Dev = Repo-Root.
  // Wir nutzen process.cwd() als Stellvertreter — beim systemd-Service liegt
  // WorkingDirectory auf /opt/mycleancenter/current/.
  const code = normalizeAbs(process.cwd());

  if (isSubpath(data, code) || isSubpath(code, data)) {
    audit({
      action: "data-guard.config-violation",
      detail: { dataDir: data, codeDir: code },
    });
    // Hard-Fail: das ist eine echte Fehlkonfiguration.
    throw new Error(
      `FEHLKONFIGURATION: Code-Verzeichnis (${code}) und Daten-Verzeichnis (${data}) ` +
        `dürfen sich nicht überschneiden. Bitte DATA_DIR explizit setzen.`,
    );
  }

  audit({
    action: "data-guard.boot",
    detail: { dataDir: data, codeDir: code },
  });
}
