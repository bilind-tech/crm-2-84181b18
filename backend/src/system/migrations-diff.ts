// Echter Migrations-Diff: vergleicht die Migrations-Dateien aus dem entpackten
// Update-Paket mit den bereits in der Live-DB gespeicherten Versionen.
//
// Das Paket bringt die Migrationen unter einem der folgenden Pfade mit:
//   - <extractDir>/dist/db/migrations/*.sql   (gebautes Paket)
//   - <extractDir>/db/migrations/*.sql        (Quellpaket, falls jemand .ts->js
//                                              schon vorher transpiliert hat)
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { getDatabase } from "../db/index.js";

export interface MigrationsDiff {
  pending: string[];     // Dateinamen, z.B. "019_neuer_index.sql"
  downgrade: boolean;    // Paket bringt weniger Versionen mit als Live-DB
  liveVersion: number;   // höchste Version in DB
  paketVersion: number;  // höchste Version im Paket
}

function findMigrationsDir(extractDir: string): string | null {
  const candidates = [
    path.join(extractDir, "dist", "db", "migrations"),
    path.join(extractDir, "db", "migrations"),
    path.join(extractDir, "backend", "dist", "db", "migrations"),
    path.join(extractDir, "backend", "src", "db", "migrations"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

function parseVersion(filename: string): number | null {
  const m = /^(\d+)_/.exec(filename);
  return m ? Number(m[1]) : null;
}

export function computeMigrationsDiff(extractDir: string): MigrationsDiff {
  const dir = findMigrationsDir(extractDir);
  const paketFiles = dir
    ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
    : [];

  const paketVersions = paketFiles
    .map((f) => ({ filename: f, version: parseVersion(f) }))
    .filter((x): x is { filename: string; version: number } => x.version !== null);
  const paketVersion = paketVersions.reduce((m, x) => Math.max(m, x.version), 0);

  // Bereits angewandte Migrationen aus Live-DB lesen
  const db = getDatabase();
  const tableExists = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'")
    .get();
  const known = new Set<number>();
  let liveVersion = 0;
  if (tableExists) {
    const rows = db.prepare("SELECT version FROM schema_version").all() as { version: number }[];
    rows.forEach((r) => { known.add(r.version); liveVersion = Math.max(liveVersion, r.version); });
  }

  const pending = paketVersions
    .filter((x) => !known.has(x.version))
    .map((x) => x.filename);

  return {
    pending,
    downgrade: paketVersion < liveVersion,
    liveVersion,
    paketVersion,
  };
}
