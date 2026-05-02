// Repository: Rechnungen (CRUD + Positionen + Zahlungen-Read).
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import {
  rechnungRowToApi,
  zahlungRowToApi,
  type ApiRechnung,
  type ApiZahlung,
  type DbRechnung,
  type DbZahlung,
} from "./mappers.js";
import { vergebeBelegnummer } from "./belegnummer.js";
import {
  listPositionen,
  replacePositionen,
  type PositionInput,
} from "./positionen.js";
import { recomputeRechnungStatus } from "./status.js";
import { emitBelegMutated } from "./events.js";

const RECHNUNG_COLS = `
  id, nummer, kunde_id, objekt_id, ansprechpartner_id, quell_angebot_id,
  titel, intro_text, outro_text, rabatt_gesamt, steuersatz,
  rechnungsdatum, faelligkeitsdatum, notizen, status, versendet_am,
  archiviert, optionen, drive, mahnungen, mahn_pausiert_bis,
  inkasso_markiert, dauerauftrag_id, erstellt_am, geaendert_am
`;

const ZAHLUNG_COLS = `
  id, rechnung_id, datum, betrag_ct, methode, referenz, notiz, erstellt_am
`;

function listZahlungen(rechnungId: string): ApiZahlung[] {
  const rows = getDatabase()
    .prepare(`SELECT ${ZAHLUNG_COLS} FROM zahlung WHERE rechnung_id = ? ORDER BY datum ASC, erstellt_am ASC`)
    .all(rechnungId) as DbZahlung[];
  return rows.map(zahlungRowToApi);
}

export interface RechnungFilter {
  kundeId?: string;
  status?: string;
  archiviert?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listRechnungen(f: RechnungFilter = {}): ApiRechnung[] {
  const db = getDatabase();
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.kundeId) {
    where.push("kunde_id = ?");
    params.push(f.kundeId);
  }
  if (f.status) {
    where.push("status = ?");
    params.push(f.status);
  }
  if (typeof f.archiviert === "boolean") {
    where.push("archiviert = ?");
    params.push(f.archiviert ? 1 : 0);
  }
  if (f.q && f.q.trim()) {
    const like = `%${f.q.trim().toLowerCase()}%`;
    where.push("(LOWER(nummer) LIKE ? OR LOWER(titel) LIKE ?)");
    params.push(like, like);
  }
  const sql = `SELECT ${RECHNUNG_COLS} FROM rechnung
               ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY archiviert ASC, geaendert_am DESC
               LIMIT ? OFFSET ?`;
  params.push(f.limit ?? 500, f.offset ?? 0);
  const rows = db.prepare(sql).all(...params) as DbRechnung[];
  return rows.map((r) =>
    rechnungRowToApi(
      r,
      listPositionen(db, "rechnung_position", "rechnung_id", r.id),
      listZahlungen(r.id),
    ),
  );
}

export function getRechnung(id: string): ApiRechnung | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT ${RECHNUNG_COLS} FROM rechnung WHERE id = ?`).get(id) as
    | DbRechnung
    | undefined;
  if (!row) return null;
  return rechnungRowToApi(
    row,
    listPositionen(db, "rechnung_position", "rechnung_id", id),
    listZahlungen(id),
  );
}

export interface RechnungWrite {
  kundeId: string;
  objektId?: string | null;
  ansprechpartnerId?: string | null;
  quellAngebotId?: string | null;
  titel?: string;
  introText?: string;
  outroText?: string;
  positionen?: PositionInput[];
  rabattGesamt?: number;
  steuersatz?: number;
  rechnungsdatum?: string;
  faelligkeitsdatum?: string;
  notizen?: string;
  optionen?: unknown;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function plusDays(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function createRechnung(data: RechnungWrite): ApiRechnung {
  const db = getDatabase();
  const id = crypto.randomUUID();
  let result!: ApiRechnung;

  const rechnungsdatum = data.rechnungsdatum ?? todayISO();
  // Default-Fälligkeit: Kunde-Zahlungsziel oder 14 Tage
  let faelligkeit = data.faelligkeitsdatum;
  if (!faelligkeit) {
    const k = db
      .prepare(`SELECT zahlungsziel_tage FROM kunde WHERE id = ?`)
      .get(data.kundeId) as { zahlungsziel_tage: number } | undefined;
    faelligkeit = plusDays(rechnungsdatum, k?.zahlungsziel_tage ?? 14);
  }

  const tx = db.transaction(() => {
    const bezugsdatum = new Date(rechnungsdatum + "T00:00:00Z");
    const nummer = vergebeBelegnummer(data.kundeId, "rechnung", bezugsdatum);
    db.prepare(
      `INSERT INTO rechnung (
         id, nummer, kunde_id, objekt_id, ansprechpartner_id, quell_angebot_id,
         titel, intro_text, outro_text, rabatt_gesamt, steuersatz,
         rechnungsdatum, faelligkeitsdatum, notizen, status, archiviert, optionen
       ) VALUES (
         @id, @nummer, @kunde_id, @objekt_id, @ansprechpartner_id, @quell_angebot_id,
         @titel, @intro_text, @outro_text, @rabatt_gesamt, @steuersatz,
         @rechnungsdatum, @faelligkeitsdatum, @notizen, 'entwurf', 0, @optionen
       )`,
    ).run({
      id,
      nummer,
      kunde_id: data.kundeId,
      objekt_id: data.objektId ?? null,
      ansprechpartner_id: data.ansprechpartnerId ?? null,
      quell_angebot_id: data.quellAngebotId ?? null,
      titel: data.titel ?? "",
      intro_text: data.introText ?? null,
      outro_text: data.outroText ?? null,
      rabatt_gesamt: data.rabattGesamt ?? 0,
      steuersatz: data.steuersatz ?? 19,
      rechnungsdatum,
      faelligkeitsdatum: faelligkeit,
      notizen: data.notizen ?? null,
      optionen: data.optionen != null ? JSON.stringify(data.optionen) : null,
    });
    if (data.positionen?.length) {
      replacePositionen(db, "rechnung_position", "rechnung_id", id, data.positionen);
    }
    result = getRechnung(id)!;
  });
  tx();
  emitBelegMutated("rechnung", id);
  return result;
}

const RECHNUNG_UPDATABLE: Record<string, string> = {
  objektId: "objekt_id",
  ansprechpartnerId: "ansprechpartner_id",
  titel: "titel",
  introText: "intro_text",
  outroText: "outro_text",
  rabattGesamt: "rabatt_gesamt",
  steuersatz: "steuersatz",
  rechnungsdatum: "rechnungsdatum",
  faelligkeitsdatum: "faelligkeitsdatum",
  notizen: "notizen",
  archiviert: "archiviert",
  optionen: "optionen",
  mahnPausiertBis: "mahn_pausiert_bis",
  inkassoMarkiert: "inkasso_markiert",
};

export function updateRechnung(id: string, patch: Record<string, unknown>): ApiRechnung | null {
  const db = getDatabase();
  const cur = db.prepare(`SELECT status FROM rechnung WHERE id = ?`).get(id) as
    | { status: string }
    | undefined;
  if (!cur) return null;

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "status") continue;
    if (k === "positionen") continue;
    const col = RECHNUNG_UPDATABLE[k];
    if (!col) continue;
    if (k === "archiviert" || k === "inkassoMarkiert") {
      sets.push(`${col} = @${col}`);
      params[col] = v ? 1 : 0;
    } else if (k === "optionen") {
      sets.push(`${col} = @${col}`);
      params[col] = v != null ? JSON.stringify(v) : null;
    } else {
      sets.push(`${col} = @${col}`);
      params[col] = v ?? null;
    }
  }
  // Status-Wechsel: nur 'storniert' ist manuell erlaubt — Rest wird vom System abgeleitet.
  if (typeof patch.status === "string" && patch.status === "storniert" && cur.status !== "bezahlt") {
    sets.push(`status = 'storniert'`);
  }

  const tx = db.transaction(() => {
    if (sets.length > 0) {
      db.prepare(`UPDATE rechnung SET ${sets.join(", ")} WHERE id = @id`).run(params);
    }
    if (Array.isArray(patch.positionen)) {
      replacePositionen(
        db,
        "rechnung_position",
        "rechnung_id",
        id,
        patch.positionen as PositionInput[],
      );
    }
  });
  tx();
  recomputeRechnungStatus(id);
  emitBelegMutated("rechnung", id);
  return getRechnung(id);
}

export function deleteRechnung(id: string): "soft" | "hard" | "missing" {
  const db = getDatabase();
  const cur = db.prepare(`SELECT versendet_am, status FROM rechnung WHERE id = ?`).get(id) as
    | { versendet_am: string | null; status: string }
    | undefined;
  if (!cur) return "missing";
  if (cur.versendet_am || cur.status !== "entwurf") {
    db.prepare(`UPDATE rechnung SET archiviert = 1 WHERE id = ?`).run(id);
    emitBelegMutated("rechnung", id);
    return "soft";
  }
  db.prepare(`DELETE FROM rechnung WHERE id = ?`).run(id);
  emitBelegMutated("rechnung", id);
  return "hard";
}

export function sendeRechnung(id: string): ApiRechnung | null {
  const db = getDatabase();
  const cur = db.prepare(`SELECT status FROM rechnung WHERE id = ?`).get(id) as
    | { status: string }
    | undefined;
  if (!cur) return null;
  if (cur.status !== "entwurf") return getRechnung(id);
  db.prepare(`UPDATE rechnung SET status='versendet', versendet_am=datetime('now') WHERE id = ?`).run(id);
  emitBelegMutated("rechnung", id);
  return getRechnung(id);
}

export function pausiereMahnung(id: string, bis: string): ApiRechnung | null {
  const db = getDatabase();
  const cur = db.prepare(`SELECT 1 FROM rechnung WHERE id = ?`).get(id);
  if (!cur) return null;
  db.prepare(`UPDATE rechnung SET mahn_pausiert_bis = ? WHERE id = ?`).run(bis, id);
  return getRechnung(id);
}

export function markiereInkasso(id: string): ApiRechnung | null {
  const db = getDatabase();
  const cur = db.prepare(`SELECT 1 FROM rechnung WHERE id = ?`).get(id);
  if (!cur) return null;
  db.prepare(`UPDATE rechnung SET inkasso_markiert = 1 WHERE id = ?`).run(id);
  return getRechnung(id);
}
