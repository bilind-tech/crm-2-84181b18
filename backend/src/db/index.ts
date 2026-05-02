import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { runMigrations } from "./migrate.js";

let _db: Database.Database | null = null;
let _schemaVersion = 0;

export function openDatabase(dbPath: string): Database.Database {
  if (_db) return _db;

  const dir = path.dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  const db = new Database(dbPath);

  // SICHERHEIT & ROBUSTHEIT
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");
  db.pragma("temp_store = MEMORY");
  db.pragma("busy_timeout = 5000");

  const result = runMigrations(db);
  _schemaVersion = result.currentVersion;

  _db = db;
  return db;
}

export function getDatabase(): Database.Database {
  if (!_db) throw new Error("Database not initialized — call openDatabase() first");
  return _db;
}

export function getSchemaVersion(): number {
  return _schemaVersion;
}

export function isWalActive(db: Database.Database): boolean {
  const row = db.pragma("journal_mode", { simple: true });
  return String(row).toLowerCase() === "wal";
}

export function closeDatabase(): void {
  if (_db) {
    try {
      // Sauberer WAL-Checkpoint vor dem Schließen
      _db.pragma("wal_checkpoint(TRUNCATE)");
    } catch {
      /* best effort */
    }
    _db.close();
    _db = null;
  }
}
