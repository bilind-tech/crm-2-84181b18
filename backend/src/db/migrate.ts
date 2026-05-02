import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "migrations");

interface MigrationFile {
  version: number;
  name: string;
  filename: string;
  sql: string;
}

function loadMigrations(): MigrationFile[] {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql"));
  return files
    .map((filename) => {
      const match = /^(\d+)_(.+)\.sql$/.exec(filename);
      if (!match) {
        throw new Error(`Ungültiger Migrations-Dateiname: ${filename}`);
      }
      return {
        version: Number(match[1]),
        name: match[2],
        filename,
        sql: readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8"),
      };
    })
    .sort((a, b) => a.version - b.version);
}

export function runMigrations(db: Database.Database): {
  applied: number[];
  currentVersion: number;
} {
  const migrations = loadMigrations();
  const applied: number[] = [];

  // Erste Migration legt schema_version selbst an — daher zuerst prüfen, ob
  // Tabelle existiert; wenn nicht, gilt jede Migration als ungelaufen.
  const tableExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_version'",
    )
    .get();

  const knownVersions = new Set<number>();
  if (tableExists) {
    const rows = db.prepare("SELECT version FROM schema_version").all() as {
      version: number;
    }[];
    rows.forEach((r) => knownVersions.add(r.version));
  }

  for (const m of migrations) {
    if (knownVersions.has(m.version)) continue;

    const tx = db.transaction(() => {
      db.exec(m.sql);
      // Nach 001 existiert die Tabelle garantiert:
      db.prepare(
        "INSERT OR IGNORE INTO schema_version (version, name) VALUES (?, ?)",
      ).run(m.version, m.name);
    });
    tx();
    applied.push(m.version);
  }

  const currentVersion =
    migrations.length > 0 ? migrations[migrations.length - 1].version : 0;

  return { applied, currentVersion };
}
