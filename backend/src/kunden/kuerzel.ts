// Validierung & Eindeutigkeit für Kunden-Kürzel.
// Format: 3-4 Zeichen [A-Z0-9]. Leere Kürzel sind erlaubt.
import { getDatabase } from "../db/index.js";

export function normalizeKuerzel(input: string | null | undefined): string | null {
  if (!input) return null;
  const v = input.trim().toUpperCase();
  return v.length > 0 ? v : null;
}

export function isKuerzelFormatOk(k: string): boolean {
  return /^[A-Z0-9]{3,4}$/.test(k);
}

export interface KuerzelTreffer {
  id: string;
  nummer: string;
  name: string;
}

/** Prüft, ob das Kürzel frei ist. exceptId schließt einen bestimmten Kunden aus (für Edit). */
export function findKuerzelOwner(kuerzel: string, exceptId?: string): KuerzelTreffer | null {
  const sql = exceptId
    ? `SELECT id, nummer, firmenname, vorname, nachname
         FROM kunde
        WHERE kuerzel = ? COLLATE NOCASE AND id != ?
        LIMIT 1`
    : `SELECT id, nummer, firmenname, vorname, nachname
         FROM kunde
        WHERE kuerzel = ? COLLATE NOCASE
        LIMIT 1`;
  const params = exceptId ? [kuerzel, exceptId] : [kuerzel];
  const row = getDatabase().prepare(sql).get(...params) as
    | { id: string; nummer: string; firmenname: string | null; vorname: string | null; nachname: string | null }
    | undefined;
  if (!row) return null;
  const name =
    row.firmenname?.trim() ||
    [row.vorname, row.nachname].filter(Boolean).join(" ").trim() ||
    row.nummer;
  return { id: row.id, nummer: row.nummer, name };
}
