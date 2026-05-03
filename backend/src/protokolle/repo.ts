// Repo + Belegnummern + Abschluss-Logik für Protokolle.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import { createDokument, getDokumentRaw, refsForSha, softDeleteDokument } from "../dokumente/repo.js";
import { storeBuffer, deleteFile } from "../dokumente/storage.js";

export type ProtokollKind = "uebergabe" | "schluessel";
export type ProtokollStatus = "entwurf" | "abgeschlossen";

export interface ProtokollRow {
  id: string;
  kind: ProtokollKind;
  nummer: string;
  status: ProtokollStatus;
  kunde_id: string | null;
  objekt_id: string | null;
  datum: string;
  uhrzeit: string;
  vertreter_ag: string;
  vertreter_an: string;
  daten_json: string;
  dokument_id: string | null;
  erstellt_am: string;
  aktualisiert_am: string;
}

export interface Protokoll {
  id: string;
  kind: ProtokollKind;
  nummer: string;
  status: ProtokollStatus;
  kundeId?: string;
  objektId?: string;
  datum: string;
  uhrzeit: string;
  vertreterAuftraggeber: string;
  vertreterAuftragnehmer: string;
  dokumentId?: string;
  erstelltAm: string;
  aktualisiertAm: string;
  // kind-spezifische Felder werden flach mitgeliefert
  [k: string]: unknown;
}

function rowToApi(r: ProtokollRow): Protokoll {
  let extra: Record<string, unknown> = {};
  try { extra = JSON.parse(r.daten_json) as Record<string, unknown>; } catch { /* ignore */ }
  return {
    id: r.id,
    kind: r.kind,
    nummer: r.nummer,
    status: r.status,
    kundeId: r.kunde_id ?? undefined,
    objektId: r.objekt_id ?? undefined,
    datum: r.datum,
    uhrzeit: r.uhrzeit,
    vertreterAuftraggeber: r.vertreter_ag,
    vertreterAuftragnehmer: r.vertreter_an,
    dokumentId: r.dokument_id ?? undefined,
    erstelltAm: r.erstellt_am,
    aktualisiertAm: r.aktualisiert_am,
    ...extra,
  };
}

// ── Nummern: PR{MM}{YY}/{NN} bzw. SU{MM}{YY}/{NN} ────────────────────────
function nextNummer(kind: ProtokollKind): string {
  const kuerzel = kind === "schluessel" ? "SU" : "PR";
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const yy = String(now.getFullYear()).slice(-2);
  const prefix = `${kuerzel}${mm}${yy}/`;
  const db = getDatabase();
  const row = db
    .prepare(`SELECT nummer FROM protokolle WHERE nummer LIKE ? ORDER BY nummer DESC LIMIT 1`)
    .get(`${prefix}%`) as { nummer: string } | undefined;
  let n = 1;
  if (row) {
    const tail = row.nummer.slice(prefix.length);
    const num = parseInt(tail, 10);
    if (Number.isFinite(num)) n = num + 1;
  }
  return `${prefix}${String(n).padStart(2, "0")}`;
}

// ── CRUD ────────────────────────────────────────────────────────────────
export interface CreateInput {
  kind: ProtokollKind;
  kundeId?: string;
  objektId?: string;
  datum?: string;
  uhrzeit?: string;
  vertreterAuftraggeber?: string;
  vertreterAuftragnehmer?: string;
  // kind-spezifisch — landet in daten_json:
  [k: string]: unknown;
}

export function listProtokolle(filter: { kind?: ProtokollKind; kundeId?: string }): Protokoll[] {
  const db = getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.kind) { where.push("kind = ?"); params.push(filter.kind); }
  if (filter.kundeId) { where.push("kunde_id = ?"); params.push(filter.kundeId); }
  const sql = `SELECT * FROM protokolle ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY erstellt_am DESC`;
  const rows = db.prepare(sql).all(...params) as ProtokollRow[];
  return rows.map(rowToApi);
}

export function getProtokoll(id: string): Protokoll | null {
  const r = getDatabase().prepare(`SELECT * FROM protokolle WHERE id = ?`).get(id) as ProtokollRow | undefined;
  return r ? rowToApi(r) : null;
}

export function getProtokollByDokumentId(dokumentId: string): Protokoll | null {
  const r = getDatabase()
    .prepare(`SELECT * FROM protokolle WHERE dokument_id = ? LIMIT 1`)
    .get(dokumentId) as ProtokollRow | undefined;
  return r ? rowToApi(r) : null;
}

export function createProtokoll(input: CreateInput): Protokoll {
  const id = `prot-${crypto.randomUUID().slice(0, 12)}`;
  const nummer = nextNummer(input.kind);
  const {
    kind, kundeId, objektId, datum, uhrzeit,
    vertreterAuftraggeber, vertreterAuftragnehmer,
    ...rest
  } = input;
  void kind;
  const today = new Date().toISOString().slice(0, 10);
  const db = getDatabase();
  db.prepare(
    `INSERT INTO protokolle (
       id, kind, nummer, status, kunde_id, objekt_id, datum, uhrzeit,
       vertreter_ag, vertreter_an, daten_json
     ) VALUES (?,?,?, 'entwurf', ?,?,?,?,?,?,?)`,
  ).run(
    id, input.kind, nummer,
    kundeId ?? null, objektId ?? null,
    datum ?? today, uhrzeit ?? "12:00",
    vertreterAuftraggeber ?? "", vertreterAuftragnehmer ?? "",
    JSON.stringify(rest),
  );
  return getProtokoll(id)!;
}

export function updateProtokoll(id: string, patch: Partial<CreateInput>): Protokoll | null {
  const cur = getProtokoll(id);
  if (!cur) return null;
  if (cur.status === "abgeschlossen") {
    throw Object.assign(new Error("Protokoll ist abgeschlossen"), { statusCode: 409 });
  }
  // Vorhandene Extra-Felder laden + überschreiben
  const row = getDatabase().prepare(`SELECT daten_json FROM protokolle WHERE id = ?`).get(id) as { daten_json: string };
  let extra: Record<string, unknown> = {};
  try { extra = JSON.parse(row.daten_json) as Record<string, unknown>; } catch { /* ignore */ }

  const {
    kundeId, objektId, datum, uhrzeit,
    vertreterAuftraggeber, vertreterAuftragnehmer,
    kind, ...rest
  } = patch;
  void kind;
  for (const [k, v] of Object.entries(rest)) extra[k] = v;

  getDatabase().prepare(
    `UPDATE protokolle SET
       kunde_id = COALESCE(?, kunde_id),
       objekt_id = COALESCE(?, objekt_id),
       datum = COALESCE(?, datum),
       uhrzeit = COALESCE(?, uhrzeit),
       vertreter_ag = COALESCE(?, vertreter_ag),
       vertreter_an = COALESCE(?, vertreter_an),
       daten_json = ?,
       aktualisiert_am = datetime('now')
     WHERE id = ?`,
  ).run(
    kundeId ?? null, objektId ?? null, datum ?? null, uhrzeit ?? null,
    vertreterAuftraggeber ?? null, vertreterAuftragnehmer ?? null,
    JSON.stringify(extra), id,
  );
  return getProtokoll(id);
}

export function deleteProtokoll(id: string): boolean {
  const res = getDatabase().prepare(`DELETE FROM protokolle WHERE id = ?`).run(id);
  return res.changes > 0;
}

// ── Abschließen: PDF ablegen + Dokument verlinken ───────────────────────
export interface AbschliessenInput {
  pdfBuffer: Buffer;
  dateiname: string;
}

export function abschliessenProtokoll(id: string, input: AbschliessenInput): Promise<Protokoll | null> {
  return (async () => {
    const cur = getProtokoll(id);
    if (!cur) return null;

    // Altes verknüpftes Dokument soft-löschen (Datei nur entfernen wenn keine Refs mehr)
    if (cur.dokumentId) {
      const old = getDokumentRaw(cur.dokumentId);
      if (old && !old.geloescht_am) {
        softDeleteDokument(cur.dokumentId);
        const refs = refsForSha(old.sha256);
        if (refs === 0) deleteFile(old.storage_path);
      }
    }

    const stored = await storeBuffer(input.pdfBuffer, "application/pdf", input.dateiname);
    const titel = `${cur.kind === "schluessel" ? "Schlüsselübergabe" : "Übergabe-/Abnahmeprotokoll"} ${cur.nummer} – ${cur.datum}`;
    const dok = createDokument({
      titel,
      typ: "protokoll",
      kundeId: cur.kundeId ?? null,
      objektId: cur.objektId ?? null,
      dateiname: input.dateiname,
      mimeType: "application/pdf",
      groesseBytes: stored.groesseBytes,
      sha256: stored.sha256,
      storagePath: stored.storagePath,
      dokumentdatum: cur.datum,
      quelle: "upload",
    });

    getDatabase().prepare(
      `UPDATE protokolle
         SET status = 'abgeschlossen', dokument_id = ?, aktualisiert_am = datetime('now')
       WHERE id = ?`,
    ).run(dok.id, id);

    return getProtokoll(id);
  })();
}
