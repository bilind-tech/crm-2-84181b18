// Repository: Angebote (CRUD + Positionen-Replace, Filter, Liste).
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import {
  angebotRowToApi,
  type ApiAngebot,
  type DbAngebot,
} from "./mappers.js";
import { vergebeBelegnummer } from "./belegnummer.js";
import {
  listPositionen,
  replacePositionen,
  type PositionInput,
} from "./positionen.js";
import { isValidAngebotTransition } from "./status.js";
import { emitBelegMutated } from "./events.js";

const ANGEBOT_COLS = `
  id, nummer, kunde_id, objekt_id, ansprechpartner_id, titel,
  intro_text, outro_text, rabatt_gesamt, steuersatz, gueltig_bis,
  notizen, status, versendet_am, archiviert, optionen, drive,
  erstellt_am, geaendert_am
`;

export interface AngebotFilter {
  kundeId?: string;
  status?: string;
  archiviert?: boolean;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listAngebote(f: AngebotFilter = {}): ApiAngebot[] {
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
  const sql = `SELECT ${ANGEBOT_COLS} FROM angebot
               ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY archiviert ASC, geaendert_am DESC
               LIMIT ? OFFSET ?`;
  params.push(f.limit ?? 500, f.offset ?? 0);
  const rows = db.prepare(sql).all(...params) as DbAngebot[];
  return rows.map((r) => angebotRowToApi(r, listPositionen(db, "angebot_position", "angebot_id", r.id)));
}

export function getAngebot(id: string): ApiAngebot | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT ${ANGEBOT_COLS} FROM angebot WHERE id = ?`).get(id) as
    | DbAngebot
    | undefined;
  if (!row) return null;
  return angebotRowToApi(row, listPositionen(db, "angebot_position", "angebot_id", id));
}

export interface AngebotWrite {
  kundeId: string;
  objektId?: string | null;
  ansprechpartnerId?: string | null;
  titel?: string;
  introText?: string;
  outroText?: string;
  positionen?: PositionInput[];
  rabattGesamt?: number;
  steuersatz?: number;
  gueltigBis?: string;
  notizen?: string;
  optionen?: unknown;
}

export function createAngebot(data: AngebotWrite): ApiAngebot {
  const db = getDatabase();
  const id = crypto.randomUUID();
  let result!: ApiAngebot;
  const tx = db.transaction(() => {
    const nummer = vergebeBelegnummer(data.kundeId, "angebot");
    db.prepare(
      `INSERT INTO angebot (
         id, nummer, kunde_id, objekt_id, ansprechpartner_id, titel,
         intro_text, outro_text, rabatt_gesamt, steuersatz, gueltig_bis,
         notizen, status, archiviert, optionen
       ) VALUES (
         @id, @nummer, @kunde_id, @objekt_id, @ansprechpartner_id, @titel,
         @intro_text, @outro_text, @rabatt_gesamt, @steuersatz, @gueltig_bis,
         @notizen, 'entwurf', 0, @optionen
       )`,
    ).run({
      id,
      nummer,
      kunde_id: data.kundeId,
      objekt_id: data.objektId ?? null,
      ansprechpartner_id: data.ansprechpartnerId ?? null,
      titel: data.titel ?? "",
      intro_text: data.introText ?? null,
      outro_text: data.outroText ?? null,
      rabatt_gesamt: data.rabattGesamt ?? 0,
      steuersatz: data.steuersatz ?? 19,
      gueltig_bis: data.gueltigBis ?? null,
      notizen: data.notizen ?? null,
      optionen: data.optionen != null ? JSON.stringify(data.optionen) : null,
    });
    if (data.positionen?.length) {
      replacePositionen(db, "angebot_position", "angebot_id", id, data.positionen);
    }
    result = getAngebot(id)!;
  });
  tx();
  emitBelegMutated("angebot", id);
  return result;
}

const ANGEBOT_UPDATABLE: Record<string, string> = {
  objektId: "objekt_id",
  ansprechpartnerId: "ansprechpartner_id",
  titel: "titel",
  introText: "intro_text",
  outroText: "outro_text",
  rabattGesamt: "rabatt_gesamt",
  steuersatz: "steuersatz",
  gueltigBis: "gueltig_bis",
  notizen: "notizen",
  archiviert: "archiviert",
  optionen: "optionen",
};

export function updateAngebot(id: string, patch: Record<string, unknown>): ApiAngebot | null {
  const db = getDatabase();
  const cur = db.prepare(`SELECT status FROM angebot WHERE id = ?`).get(id) as
    | { status: string }
    | undefined;
  if (!cur) return null;

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(patch)) {
    if (k === "status") continue; // separat behandelt
    if (k === "positionen") continue;
    const col = ANGEBOT_UPDATABLE[k];
    if (!col) continue;
    if (k === "archiviert") {
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
  // Status-Wechsel separat mit Transition-Check
  if (typeof patch.status === "string" && isValidAngebotTransition(cur.status, patch.status)) {
    sets.push(`status = @status`);
    params.status = patch.status;
  }

  const tx = db.transaction(() => {
    if (sets.length > 0) {
      db.prepare(`UPDATE angebot SET ${sets.join(", ")} WHERE id = @id`).run(params);
    }
    if (Array.isArray(patch.positionen)) {
      replacePositionen(
        db,
        "angebot_position",
        "angebot_id",
        id,
        patch.positionen as PositionInput[],
      );
    }
  });
  tx();
  emitBelegMutated("angebot", id);
  return getAngebot(id);
}

export function deleteAngebot(id: string): "soft" | "hard" | "missing" {
  const db = getDatabase();
  const cur = db.prepare(`SELECT versendet_am FROM angebot WHERE id = ?`).get(id) as
    | { versendet_am: string | null }
    | undefined;
  if (!cur) return "missing";
  if (cur.versendet_am) {
    db.prepare(`UPDATE angebot SET archiviert = 1 WHERE id = ?`).run(id);
    emitBelegMutated("angebot", id);
    return "soft";
  }
  db.prepare(`DELETE FROM angebot WHERE id = ?`).run(id);
  emitBelegMutated("angebot", id);
  return "hard";
}

export function sendeAngebot(id: string): ApiAngebot | null {
  const db = getDatabase();
  const cur = db.prepare(`SELECT status FROM angebot WHERE id = ?`).get(id) as
    | { status: string }
    | undefined;
  if (!cur) return null;
  if (!isValidAngebotTransition(cur.status, "versendet")) return getAngebot(id);
  db.prepare(`UPDATE angebot SET status='versendet', versendet_am=datetime('now') WHERE id = ?`).run(id);
  emitBelegMutated("angebot", id);
  return getAngebot(id);
}

export function duplicateAngebot(id: string): ApiAngebot | null {
  const db = getDatabase();
  const src = getAngebot(id);
  if (!src) return null;
  return createAngebot({
    kundeId: src.kundeId,
    objektId: src.objektId,
    ansprechpartnerId: src.ansprechpartnerId,
    titel: src.titel,
    introText: src.introText,
    outroText: src.outroText,
    positionen: src.positionen.map((p) => ({
      beschreibung: p.beschreibung,
      menge: p.menge,
      einheit: p.einheit,
      einzelpreisNetto: p.einzelpreisNetto,
      steuersatz: p.steuersatz,
      rabatt: p.rabatt,
      modus: p.modus,
      pauschalpreisNetto: p.pauschalpreisNetto,
      ausfuehrung: p.ausfuehrung,
    })),
    rabattGesamt: src.rabattGesamt,
    steuersatz: src.steuersatz,
    gueltigBis: src.gueltigBis,
    notizen: src.notizen,
    optionen: src.optionen,
  });
}
