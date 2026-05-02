// CRUD für mahn_laeufe + mahn_lauf_eintraege.
import { randomUUID } from "node:crypto";
import { getDatabase } from "../db/index.js";

export type MahnLaufModus = "aus" | "vorschlag" | "auto";
export type MahnLaufQuelle = "cron" | "manuell";
export type MahnLaufAktion = "vorschlag" | "versendet" | "uebersprungen" | "fehler";

export interface MahnLaufRow {
  id: string;
  gestartetAm: string;
  beendetAm?: string | null;
  ausgeloestDurch: MahnLaufQuelle;
  modus: MahnLaufModus;
  geprueft: number;
  vorschlaege: number;
  versendet: number;
  uebersprungen: number;
  fehler: number;
  notiz?: string | null;
}

export interface MahnLaufEintragRow {
  id: string;
  laufId: string;
  rechnungId: string;
  rechnungNr?: string | null;
  stufe: number;
  aktion: MahnLaufAktion;
  grund?: string | null;
  emailVersandId?: string | null;
  erstelltAm: string;
}

interface DbLauf {
  id: string;
  gestartet_am: string;
  beendet_am: string | null;
  ausgeloest_durch: MahnLaufQuelle;
  modus: MahnLaufModus;
  geprueft: number;
  vorschlaege: number;
  versendet: number;
  uebersprungen: number;
  fehler: number;
  notiz: string | null;
}
interface DbEintrag {
  id: string;
  lauf_id: string;
  rechnung_id: string;
  rechnung_nr: string | null;
  stufe: number;
  aktion: MahnLaufAktion;
  grund: string | null;
  email_versand_id: string | null;
  erstellt_am: string;
}

function mapLauf(r: DbLauf): MahnLaufRow {
  return {
    id: r.id,
    gestartetAm: r.gestartet_am,
    beendetAm: r.beendet_am,
    ausgeloestDurch: r.ausgeloest_durch,
    modus: r.modus,
    geprueft: r.geprueft,
    vorschlaege: r.vorschlaege,
    versendet: r.versendet,
    uebersprungen: r.uebersprungen,
    fehler: r.fehler,
    notiz: r.notiz,
  };
}
function mapEintrag(r: DbEintrag): MahnLaufEintragRow {
  return {
    id: r.id,
    laufId: r.lauf_id,
    rechnungId: r.rechnung_id,
    rechnungNr: r.rechnung_nr,
    stufe: r.stufe,
    aktion: r.aktion,
    grund: r.grund,
    emailVersandId: r.email_versand_id,
    erstelltAm: r.erstellt_am,
  };
}

export function createLauf(quelle: MahnLaufQuelle, modus: MahnLaufModus): string {
  const id = randomUUID();
  getDatabase()
    .prepare(
      `INSERT INTO mahn_laeufe (id, ausgeloest_durch, modus) VALUES (?, ?, ?)`,
    )
    .run(id, quelle, modus);
  return id;
}

export function appendEintrag(input: Omit<MahnLaufEintragRow, "id" | "erstelltAm">): string {
  const id = randomUUID();
  getDatabase()
    .prepare(
      `INSERT INTO mahn_lauf_eintraege
       (id, lauf_id, rechnung_id, rechnung_nr, stufe, aktion, grund, email_versand_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.laufId,
      input.rechnungId,
      input.rechnungNr ?? null,
      input.stufe,
      input.aktion,
      input.grund ?? null,
      input.emailVersandId ?? null,
    );
  return id;
}

export function finishLauf(
  id: string,
  totals: {
    geprueft: number;
    vorschlaege: number;
    versendet: number;
    uebersprungen: number;
    fehler: number;
    notiz?: string | null;
  },
): void {
  getDatabase()
    .prepare(
      `UPDATE mahn_laeufe
          SET beendet_am = datetime('now'),
              geprueft = ?, vorschlaege = ?, versendet = ?,
              uebersprungen = ?, fehler = ?, notiz = ?
        WHERE id = ?`,
    )
    .run(
      totals.geprueft,
      totals.vorschlaege,
      totals.versendet,
      totals.uebersprungen,
      totals.fehler,
      totals.notiz ?? null,
      id,
    );
}

export function listLaeufe(limit = 30): MahnLaufRow[] {
  return (
    getDatabase()
      .prepare(`SELECT * FROM mahn_laeufe ORDER BY gestartet_am DESC LIMIT ?`)
      .all(limit) as DbLauf[]
  ).map(mapLauf);
}

export function getLauf(id: string): MahnLaufRow | null {
  const r = getDatabase()
    .prepare(`SELECT * FROM mahn_laeufe WHERE id = ?`)
    .get(id) as DbLauf | undefined;
  return r ? mapLauf(r) : null;
}

export function listEintraege(laufId: string): MahnLaufEintragRow[] {
  return (
    getDatabase()
      .prepare(
        `SELECT * FROM mahn_lauf_eintraege WHERE lauf_id = ? ORDER BY erstellt_am ASC`,
      )
      .all(laufId) as DbEintrag[]
  ).map(mapEintrag);
}

/** Letzter erfolgreich abgeschlossener Lauf (für Status-Endpoint). */
export function letzterLauf(): MahnLaufRow | null {
  const r = getDatabase()
    .prepare(
      `SELECT * FROM mahn_laeufe WHERE beendet_am IS NOT NULL ORDER BY gestartet_am DESC LIMIT 1`,
    )
    .get() as DbLauf | undefined;
  return r ? mapLauf(r) : null;
}
