// Repository: alle SELECT/INSERT/UPDATE/DELETE für Step-3-Stammdaten.
// Prepared Statements werden lazy geholt, weil die DB beim Modul-Import
// noch nicht offen ist.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";
import {
  ansprechpartnerRowToApi,
  kundeRowToApi,
  notizRowToApi,
  objektRowToApi,
  type ApiAnsprechpartner,
  type ApiKunde,
  type ApiNotiz,
  type ApiObjekt,
  type DbAnsprechpartner,
  type DbKunde,
  type DbNotiz,
  type DbObjekt,
} from "./mappers.js";
import {
  formatKundeNummer,
  formatObjektNummer,
  nextKundeNummer,
  nextObjektNummer,
} from "./nummern.js";
import { normalizeKuerzel } from "./kuerzel.js";

// =============================================================================
// KUNDE
// =============================================================================

const KUNDE_COLS = `
  id, nummer, kuerzel, typ, anrede, firmenname, vorname, nachname,
  strasse, plz, ort, land, telefon, mobil, email, webseite,
  ust_id, steuernummer, zahlungsziel_tage, standard_steuersatz, standard_rabatt,
  notizen, tags, status, archiviert, erstellt_am, geaendert_am
`;

export interface KundeFilter {
  suche?: string;
  status?: string;
  archiviert?: boolean;
  limit?: number;
  offset?: number;
}

export function listKunden(f: KundeFilter = {}): ApiKunde[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (f.status) {
    where.push("status = ?");
    params.push(f.status);
  }
  if (typeof f.archiviert === "boolean") {
    where.push("archiviert = ?");
    params.push(f.archiviert ? 1 : 0);
  }
  if (f.suche && f.suche.trim()) {
    const q = `%${f.suche.trim().toLowerCase()}%`;
    where.push(
      `(LOWER(COALESCE(firmenname,'')) LIKE ? OR LOWER(COALESCE(nachname,'')) LIKE ?
        OR LOWER(COALESCE(vorname,'')) LIKE ?  OR LOWER(COALESCE(email,'')) LIKE ?
        OR LOWER(COALESCE(ort,'')) LIKE ?      OR LOWER(nummer) LIKE ?
        OR LOWER(COALESCE(kuerzel,'')) LIKE ?)`,
    );
    params.push(q, q, q, q, q, q, q);
  }
  const sql = `SELECT ${KUNDE_COLS} FROM kunde
               ${where.length ? "WHERE " + where.join(" AND ") : ""}
               ORDER BY archiviert ASC, geaendert_am DESC
               LIMIT ? OFFSET ?`;
  params.push(f.limit ?? 500, f.offset ?? 0);
  const rows = getDatabase().prepare(sql).all(...params) as DbKunde[];
  return rows.map(kundeRowToApi);
}

export function getKunde(id: string): ApiKunde | null {
  const row = getDatabase()
    .prepare(`SELECT ${KUNDE_COLS} FROM kunde WHERE id = ?`)
    .get(id) as DbKunde | undefined;
  return row ? kundeRowToApi(row) : null;
}

export interface KundeWrite {
  kuerzel?: string | null;
  typ?: string;
  anrede?: string;
  firmenname?: string;
  vorname?: string;
  nachname?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  telefon?: string;
  mobil?: string;
  email?: string;
  webseite?: string;
  ustId?: string;
  steuernummer?: string;
  zahlungszielTage?: number;
  standardSteuersatz?: number;
  standardRabatt?: number;
  notizen?: string;
  tags?: string[];
  status?: string;
  archiviert?: boolean;
}

export function createKunde(data: KundeWrite): ApiKunde {
  const id = crypto.randomUUID();
  const jahr = new Date().getFullYear();
  const n = nextKundeNummer(jahr);
  const nummer = formatKundeNummer(jahr, n);
  const kuerzel = normalizeKuerzel(data.kuerzel ?? null);

  getDatabase()
    .prepare(
      `INSERT INTO kunde (
         id, nummer, kuerzel, typ, anrede, firmenname, vorname, nachname,
         strasse, plz, ort, land, telefon, mobil, email, webseite,
         ust_id, steuernummer, zahlungsziel_tage, standard_steuersatz, standard_rabatt,
         notizen, tags, status, archiviert
       ) VALUES (
         @id, @nummer, @kuerzel, @typ, @anrede, @firmenname, @vorname, @nachname,
         @strasse, @plz, @ort, @land, @telefon, @mobil, @email, @webseite,
         @ust_id, @steuernummer, @zahlungsziel_tage, @standard_steuersatz, @standard_rabatt,
         @notizen, @tags, @status, @archiviert
       )`,
    )
    .run({
      id,
      nummer,
      kuerzel,
      typ: data.typ ?? "firma",
      anrede: data.anrede ?? null,
      firmenname: data.firmenname ?? null,
      vorname: data.vorname ?? null,
      nachname: data.nachname ?? null,
      strasse: data.strasse ?? null,
      plz: data.plz ?? null,
      ort: data.ort ?? null,
      land: data.land ?? "Deutschland",
      telefon: data.telefon ?? null,
      mobil: data.mobil ?? null,
      email: data.email ?? null,
      webseite: data.webseite ?? null,
      ust_id: data.ustId ?? null,
      steuernummer: data.steuernummer ?? null,
      zahlungsziel_tage: data.zahlungszielTage ?? 14,
      standard_steuersatz: data.standardSteuersatz ?? 19,
      standard_rabatt: data.standardRabatt ?? 0,
      notizen: data.notizen ?? null,
      tags: JSON.stringify(data.tags ?? []),
      status: data.status ?? "aktiv",
      archiviert: data.archiviert ? 1 : 0,
    });

  return getKunde(id)!;
}

const KUNDE_UPDATABLE: Record<string, string> = {
  kuerzel: "kuerzel",
  typ: "typ",
  anrede: "anrede",
  firmenname: "firmenname",
  vorname: "vorname",
  nachname: "nachname",
  strasse: "strasse",
  plz: "plz",
  ort: "ort",
  land: "land",
  telefon: "telefon",
  mobil: "mobil",
  email: "email",
  webseite: "webseite",
  ustId: "ust_id",
  steuernummer: "steuernummer",
  zahlungszielTage: "zahlungsziel_tage",
  standardSteuersatz: "standard_steuersatz",
  standardRabatt: "standard_rabatt",
  notizen: "notizen",
  tags: "tags",
  status: "status",
  archiviert: "archiviert",
};

export function updateKunde(id: string, patch: Record<string, unknown>): ApiKunde | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(patch)) {
    const col = KUNDE_UPDATABLE[k];
    if (!col) continue;
    if (k === "tags") {
      sets.push(`${col} = @${col}`);
      params[col] = JSON.stringify(Array.isArray(v) ? v : []);
    } else if (k === "archiviert") {
      sets.push(`${col} = @${col}`);
      params[col] = v ? 1 : 0;
    } else if (k === "kuerzel") {
      sets.push(`${col} = @${col}`);
      params[col] = normalizeKuerzel(v as string | null);
    } else {
      sets.push(`${col} = @${col}`);
      params[col] = v ?? null;
    }
  }
  if (sets.length === 0) return getKunde(id);
  getDatabase().prepare(`UPDATE kunde SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return getKunde(id);
}

export function hasKundeReferences(id: string): boolean {
  const db = getDatabase();
  const tableExists = (name: string): boolean =>
    !!db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(name);
  // intern (Step 3): Ansprechpartner / Objekte / Notizen → CASCADE löschen, kein Soft-Delete.
  // extern (Step 4/7): Angebote / Rechnungen schützen Kunde → Soft-Delete.
  if (tableExists("rechnung")) {
    const hit = db.prepare(`SELECT 1 FROM rechnung WHERE kunde_id = ? LIMIT 1`).get(id);
    if (hit) return true;
  }
  if (tableExists("angebot")) {
    const hit = db.prepare(`SELECT 1 FROM angebot WHERE kunde_id = ? LIMIT 1`).get(id);
    if (hit) return true;
  }
  return false;
}

export function deleteKunde(id: string): "soft" | "hard" | "missing" {
  const db = getDatabase();
  const exists = db.prepare(`SELECT 1 FROM kunde WHERE id = ?`).get(id);
  if (!exists) return "missing";
  if (hasKundeReferences(id)) {
    db.prepare(`UPDATE kunde SET archiviert = 1, status = 'inaktiv' WHERE id = ?`).run(id);
    return "soft";
  }
  db.prepare(`DELETE FROM kunde WHERE id = ?`).run(id);
  return "hard";
}

// =============================================================================
// ANSPRECHPARTNER
// =============================================================================

const AP_COLS = `
  id, kunde_id, anrede, vorname, nachname, position, abteilung,
  telefon, mobil, email, notiz, primaer, erstellt_am
`;

export function listAnsprechpartner(kundeId: string): ApiAnsprechpartner[] {
  const rows = getDatabase()
    .prepare(`SELECT ${AP_COLS} FROM ansprechpartner WHERE kunde_id = ? ORDER BY primaer DESC, erstellt_am ASC`)
    .all(kundeId) as DbAnsprechpartner[];
  return rows.map(ansprechpartnerRowToApi);
}

export function getAnsprechpartner(id: string): ApiAnsprechpartner | null {
  const row = getDatabase()
    .prepare(`SELECT ${AP_COLS} FROM ansprechpartner WHERE id = ?`)
    .get(id) as DbAnsprechpartner | undefined;
  return row ? ansprechpartnerRowToApi(row) : null;
}

export interface AnsprechpartnerWrite {
  kundeId: string;
  anrede?: string;
  vorname?: string;
  nachname?: string;
  position?: string;
  abteilung?: string;
  telefon?: string;
  mobil?: string;
  email?: string;
  notiz?: string;
  primaer?: boolean;
}

export function createAnsprechpartner(data: AnsprechpartnerWrite): ApiAnsprechpartner {
  const id = crypto.randomUUID();
  const db = getDatabase();
  const tx = db.transaction(() => {
    if (data.primaer) {
      db.prepare(`UPDATE ansprechpartner SET primaer = 0 WHERE kunde_id = ?`).run(data.kundeId);
    }
    db.prepare(
      `INSERT INTO ansprechpartner (
         id, kunde_id, anrede, vorname, nachname, position, abteilung,
         telefon, mobil, email, notiz, primaer
       ) VALUES (
         @id, @kunde_id, @anrede, @vorname, @nachname, @position, @abteilung,
         @telefon, @mobil, @email, @notiz, @primaer
       )`,
    ).run({
      id,
      kunde_id: data.kundeId,
      anrede: data.anrede ?? null,
      vorname: data.vorname ?? null,
      nachname: data.nachname ?? null,
      position: data.position ?? null,
      abteilung: data.abteilung ?? null,
      telefon: data.telefon ?? null,
      mobil: data.mobil ?? null,
      email: data.email ?? null,
      notiz: data.notiz ?? null,
      primaer: data.primaer ? 1 : 0,
    });
  });
  tx();
  return getAnsprechpartner(id)!;
}

const AP_UPDATABLE: Record<string, string> = {
  anrede: "anrede",
  vorname: "vorname",
  nachname: "nachname",
  position: "position",
  abteilung: "abteilung",
  telefon: "telefon",
  mobil: "mobil",
  email: "email",
  notiz: "notiz",
  primaer: "primaer",
};

export function updateAnsprechpartner(id: string, patch: Record<string, unknown>): ApiAnsprechpartner | null {
  const db = getDatabase();
  const cur = getAnsprechpartner(id);
  if (!cur) return null;

  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(patch)) {
    const col = AP_UPDATABLE[k];
    if (!col) continue;
    if (k === "primaer") {
      sets.push(`${col} = @${col}`);
      params[col] = v ? 1 : 0;
    } else {
      sets.push(`${col} = @${col}`);
      params[col] = v ?? null;
    }
  }
  if (sets.length === 0) return cur;

  const tx = db.transaction(() => {
    if (patch.primaer === true) {
      db.prepare(`UPDATE ansprechpartner SET primaer = 0 WHERE kunde_id = ? AND id != ?`).run(
        cur.kundeId,
        id,
      );
    }
    db.prepare(`UPDATE ansprechpartner SET ${sets.join(", ")} WHERE id = @id`).run(params);
  });
  tx();
  return getAnsprechpartner(id);
}

export function deleteAnsprechpartner(id: string): boolean {
  const db = getDatabase();
  const cur = getAnsprechpartner(id);
  if (!cur) return false;
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM ansprechpartner WHERE id = ?`).run(id);
    if (cur.primaer) {
      // Wenn der primäre weg war, ersten verbliebenen zum primären machen.
      const next = db
        .prepare(
          `SELECT id FROM ansprechpartner WHERE kunde_id = ? ORDER BY erstellt_am ASC LIMIT 1`,
        )
        .get(cur.kundeId) as { id: string } | undefined;
      if (next) {
        db.prepare(`UPDATE ansprechpartner SET primaer = 1 WHERE id = ?`).run(next.id);
      }
    }
  });
  tx();
  return true;
}

// =============================================================================
// OBJEKT
// =============================================================================

const OBJEKT_COLS = `
  id, nummer, kunde_id, name, typ, strasse, plz, ort, land,
  qm_gesamt, qm_zu_reinigen, stockwerke, raeume, frequenz, reinigungstage,
  uhrzeit_von, uhrzeit_bis, zugangsinfo, alarm_info, ansprechpartner_vor_ort_id,
  notizen, status, archiviert, erstellt_am, geaendert_am
`;

export function listObjekte(kundeId?: string): ApiObjekt[] {
  const sql = kundeId
    ? `SELECT ${OBJEKT_COLS} FROM objekt WHERE kunde_id = ? ORDER BY archiviert ASC, geaendert_am DESC`
    : `SELECT ${OBJEKT_COLS} FROM objekt ORDER BY archiviert ASC, geaendert_am DESC LIMIT 500`;
  const rows = (kundeId
    ? getDatabase().prepare(sql).all(kundeId)
    : getDatabase().prepare(sql).all()) as DbObjekt[];
  return rows.map(objektRowToApi);
}

export function getObjekt(id: string): ApiObjekt | null {
  const row = getDatabase()
    .prepare(`SELECT ${OBJEKT_COLS} FROM objekt WHERE id = ?`)
    .get(id) as DbObjekt | undefined;
  return row ? objektRowToApi(row) : null;
}

export interface ObjektWrite {
  kundeId: string;
  name: string;
  typ?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  land?: string;
  qmGesamt?: number;
  qmZuReinigen?: number;
  stockwerke?: number;
  raeume?: number;
  frequenz?: string;
  reinigungstage?: string[];
  uhrzeitVon?: string;
  uhrzeitBis?: string;
  zugangsinfo?: string;
  alarmInfo?: string;
  ansprechpartnerVorOrtId?: string;
  notizen?: string;
  status?: string;
  archiviert?: boolean;
}

export function createObjekt(data: ObjektWrite): ApiObjekt {
  const id = crypto.randomUUID();
  const jahr = new Date().getFullYear();
  const nummer = formatObjektNummer(jahr, nextObjektNummer(jahr));

  getDatabase()
    .prepare(
      `INSERT INTO objekt (
         id, nummer, kunde_id, name, typ, strasse, plz, ort, land,
         qm_gesamt, qm_zu_reinigen, stockwerke, raeume, frequenz, reinigungstage,
         uhrzeit_von, uhrzeit_bis, zugangsinfo, alarm_info, ansprechpartner_vor_ort_id,
         notizen, status, archiviert
       ) VALUES (
         @id, @nummer, @kunde_id, @name, @typ, @strasse, @plz, @ort, @land,
         @qm_gesamt, @qm_zu_reinigen, @stockwerke, @raeume, @frequenz, @reinigungstage,
         @uhrzeit_von, @uhrzeit_bis, @zugangsinfo, @alarm_info, @ansprechpartner_vor_ort_id,
         @notizen, @status, @archiviert
       )`,
    )
    .run({
      id,
      nummer,
      kunde_id: data.kundeId,
      name: data.name,
      typ: data.typ ?? "sonstiges",
      strasse: data.strasse ?? null,
      plz: data.plz ?? null,
      ort: data.ort ?? null,
      land: data.land ?? "Deutschland",
      qm_gesamt: data.qmGesamt ?? null,
      qm_zu_reinigen: data.qmZuReinigen ?? null,
      stockwerke: data.stockwerke ?? null,
      raeume: data.raeume ?? null,
      frequenz: data.frequenz ?? "auf_abruf",
      reinigungstage: JSON.stringify(data.reinigungstage ?? []),
      uhrzeit_von: data.uhrzeitVon ?? null,
      uhrzeit_bis: data.uhrzeitBis ?? null,
      zugangsinfo: data.zugangsinfo ?? null,
      alarm_info: data.alarmInfo ?? null,
      ansprechpartner_vor_ort_id: data.ansprechpartnerVorOrtId ?? null,
      notizen: data.notizen ?? null,
      status: data.status ?? "aktiv",
      archiviert: data.archiviert ? 1 : 0,
    });

  return getObjekt(id)!;
}

const OBJEKT_UPDATABLE: Record<string, string> = {
  name: "name",
  typ: "typ",
  strasse: "strasse",
  plz: "plz",
  ort: "ort",
  land: "land",
  qmGesamt: "qm_gesamt",
  qmZuReinigen: "qm_zu_reinigen",
  stockwerke: "stockwerke",
  raeume: "raeume",
  frequenz: "frequenz",
  reinigungstage: "reinigungstage",
  uhrzeitVon: "uhrzeit_von",
  uhrzeitBis: "uhrzeit_bis",
  zugangsinfo: "zugangsinfo",
  alarmInfo: "alarm_info",
  ansprechpartnerVorOrtId: "ansprechpartner_vor_ort_id",
  notizen: "notizen",
  status: "status",
  archiviert: "archiviert",
};

export function updateObjekt(id: string, patch: Record<string, unknown>): ApiObjekt | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id };
  for (const [k, v] of Object.entries(patch)) {
    const col = OBJEKT_UPDATABLE[k];
    if (!col) continue;
    if (k === "reinigungstage") {
      sets.push(`${col} = @${col}`);
      params[col] = JSON.stringify(Array.isArray(v) ? v : []);
    } else if (k === "archiviert") {
      sets.push(`${col} = @${col}`);
      params[col] = v ? 1 : 0;
    } else {
      sets.push(`${col} = @${col}`);
      params[col] = v ?? null;
    }
  }
  if (sets.length === 0) return getObjekt(id);
  getDatabase().prepare(`UPDATE objekt SET ${sets.join(", ")} WHERE id = @id`).run(params);
  return getObjekt(id);
}

export function deleteObjekt(id: string): "soft" | "hard" | "missing" {
  const db = getDatabase();
  const exists = db.prepare(`SELECT 1 FROM objekt WHERE id = ?`).get(id);
  if (!exists) return "missing";
  // Step 4/7: später check auf rechnungspositionen / angebotsbezug.
  db.prepare(`DELETE FROM objekt WHERE id = ?`).run(id);
  return "hard";
}

// =============================================================================
// NOTIZ
// =============================================================================

const NOTIZ_COLS = `id, kunde_id, objekt_id, angebot_id, rechnung_id, text, autor_id, erstellt_am`;

export function listNotizenForKunde(kundeId: string): ApiNotiz[] {
  const rows = getDatabase()
    .prepare(`SELECT ${NOTIZ_COLS} FROM notiz WHERE kunde_id = ? ORDER BY erstellt_am DESC`)
    .all(kundeId) as DbNotiz[];
  return rows.map(notizRowToApi);
}

export interface NotizWrite {
  kundeId?: string;
  objektId?: string;
  angebotId?: string;
  rechnungId?: string;
  text: string;
  autorId?: string;
}

export function createNotiz(data: NotizWrite): ApiNotiz {
  const fks = [data.kundeId, data.objektId, data.angebotId, data.rechnungId].filter(Boolean);
  if (fks.length !== 1) {
    throw new Error("Notiz muss exakt eine Beziehung haben (kundeId | objektId | angebotId | rechnungId).");
  }
  const id = crypto.randomUUID();
  getDatabase()
    .prepare(
      `INSERT INTO notiz (id, kunde_id, objekt_id, angebot_id, rechnung_id, text, autor_id)
       VALUES (@id, @kunde_id, @objekt_id, @angebot_id, @rechnung_id, @text, @autor_id)`,
    )
    .run({
      id,
      kunde_id: data.kundeId ?? null,
      objekt_id: data.objektId ?? null,
      angebot_id: data.angebotId ?? null,
      rechnung_id: data.rechnungId ?? null,
      text: data.text,
      autor_id: data.autorId ?? null,
    });
  const row = getDatabase()
    .prepare(`SELECT ${NOTIZ_COLS} FROM notiz WHERE id = ?`)
    .get(id) as DbNotiz;
  return notizRowToApi(row);
}

export function deleteNotiz(id: string): boolean {
  const r = getDatabase().prepare(`DELETE FROM notiz WHERE id = ?`).run(id);
  return r.changes > 0;
}
