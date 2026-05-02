// Status-Lifecycle für Rechnungen.
// Endzustand `bezahlt` und `storniert` sind terminal — werden nur durch
// explizite Aktion (Zahlung/PATCH) geändert.
import { getDatabase } from "../db/index.js";
import { rechnungBruttoCt, zahlungSummeCt } from "./totals.js";

export function recomputeRechnungStatus(rechnungId: string): string {
  const db = getDatabase();
  const cur = db
    .prepare(`SELECT status FROM rechnung WHERE id = ?`)
    .get(rechnungId) as { status: string } | undefined;
  if (!cur) return "missing";
  // storniert ist terminal — nicht überschreiben
  if (cur.status === "storniert") return cur.status;

  const brutto = rechnungBruttoCt(db, rechnungId);
  const bezahlt = zahlungSummeCt(db, rechnungId);

  let next = cur.status;
  if (brutto > 0 && bezahlt >= brutto) {
    next = "bezahlt";
  } else if (bezahlt > 0 && bezahlt < brutto) {
    next = "teilbezahlt";
  } else if (bezahlt === 0) {
    // Wenn keine Zahlung mehr da ist, Rückfall in versendet/entwurf/ueberfaellig je nach Vorzustand
    if (cur.status === "bezahlt" || cur.status === "teilbezahlt") {
      const versendet = db
        .prepare(`SELECT versendet_am, faelligkeitsdatum FROM rechnung WHERE id = ?`)
        .get(rechnungId) as { versendet_am: string | null; faelligkeitsdatum: string };
      next = versendet.versendet_am ? "versendet" : "entwurf";
      // Fälligkeit prüfen
      if (next === "versendet" && versendet.faelligkeitsdatum < new Date().toISOString().slice(0, 10)) {
        next = "ueberfaellig";
      }
    }
  }
  if (next !== cur.status) {
    db.prepare(`UPDATE rechnung SET status = ? WHERE id = ?`).run(next, rechnungId);
  }
  return next;
}

/** Tagesjob: alle versendeten/teilbezahlten Rechnungen auf ueberfaellig setzen. */
export function markOverdueRechnungen(today: string = new Date().toISOString().slice(0, 10)): number {
  const db = getDatabase();
  const result = db
    .prepare(
      `UPDATE rechnung
          SET status = 'ueberfaellig'
        WHERE status IN ('versendet','teilbezahlt')
          AND faelligkeitsdatum < ?
          AND (mahn_pausiert_bis IS NULL OR mahn_pausiert_bis < ?)`,
    )
    .run(today, today);
  return result.changes;
}

const ANGEBOT_TRANSITIONS: Record<string, string[]> = {
  entwurf: ["versendet", "abgelaufen"],
  versendet: ["angenommen", "abgelehnt", "abgelaufen"],
  angenommen: [],
  abgelehnt: [],
  abgelaufen: [],
};

export function isValidAngebotTransition(from: string, to: string): boolean {
  if (from === to) return true;
  return (ANGEBOT_TRANSITIONS[from] ?? []).includes(to);
}
