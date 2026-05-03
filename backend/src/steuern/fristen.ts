// Tägliche Steuer-Frist-Prüfung — Benachrichtigungen für offene/fällige
// **manuelle** Steuer-Posten. Auto-Posten (USt/KSt/Soli/GewSt) leben im
// Frontend-Berechnungs-Layer und werden dort gewarnt.
import { getDatabase } from "../db/index.js";
import { listManuellePosten, listBezahlt } from "./repo.js";
import { record } from "../aktivitaet/repo.js";

export type FristStatus = "ok" | "bald" | "heute" | "ueberfaellig" | "erledigt";

const TAGE_BALD = 7;

function tageDifferenz(a: string, b: string): number {
  const dA = new Date(a + "T00:00:00").getTime();
  const dB = new Date(b + "T00:00:00").getTime();
  return Math.round((dA - dB) / 86_400_000);
}

export function fristStatusFor(faelligAm: string, heute: string): FristStatus {
  const d = tageDifferenz(faelligAm, heute);
  if (d < 0) return "ueberfaellig";
  if (d === 0) return "heute";
  if (d <= TAGE_BALD) return "bald";
  return "ok";
}

const STATUS_LABEL: Record<
  "ueberfaellig" | "heute" | "bald",
  { titel: (t: string) => string; prio: "warnung" | "fehler" }
> = {
  ueberfaellig: { titel: (t) => `Steuer überfällig: ${t}`, prio: "fehler" },
  heute: { titel: (t) => `Steuer heute fällig: ${t}`, prio: "warnung" },
  bald: { titel: (t) => `Steuer bald fällig: ${t}`, prio: "warnung" },
};

function alreadyLogged(postenId: string, tag: string, status: string): boolean {
  const db = getDatabase();
  const r = db
    .prepare(
      "SELECT 1 FROM steuer_frist_benachrichtigung_log WHERE posten_id = ? AND tag = ? AND status = ? LIMIT 1",
    )
    .get(postenId, tag, status);
  return !!r;
}

function logBenachrichtigung(postenId: string, tag: string, status: string): void {
  const db = getDatabase();
  db.prepare(
    "INSERT OR IGNORE INTO steuer_frist_benachrichtigung_log (posten_id, tag, status) VALUES (?, ?, ?)",
  ).run(postenId, tag, status);
}

export interface SteuerFristResult {
  geprueft: number;
  benachrichtigt: number;
  uebersprungen: number;
}

/** Liefert deterministische Auto-Steuer-Termine für die nächsten ~60 Tage.
 *  Reine Kalender-Logik — Beträge werden hier NICHT berechnet (das passiert
 *  im Frontend), nur die Termine zur Erinnerung.
 */
export function naechsteAutoFristen(now: Date): Array<{ id: string; titel: string; faelligAm: string }> {
  const heute = now.toISOString().slice(0, 10);
  const horizont = new Date(now.getTime() + 60 * 86_400_000).toISOString().slice(0, 10);
  const out: Array<{ id: string; titel: string; faelligAm: string }> = [];

  const jahr = now.getFullYear();
  // KSt/Soli: 10.03/06/09/12  ·  GewSt: 15.02/05/08/11
  const kstMonate = [3, 6, 9, 12];
  const gewstMonate = [2, 5, 8, 11];
  for (const m of kstMonate) {
    const d = `${jahr}-${String(m).padStart(2, "0")}-10`;
    if (d >= heute && d <= horizont) {
      out.push({ id: `auto-kst-${jahr}-${m}`, titel: `KSt-/Soli-Vorauszahlung Q${Math.ceil(m / 3)}`, faelligAm: d });
    }
  }
  for (const m of gewstMonate) {
    const d = `${jahr}-${String(m).padStart(2, "0")}-15`;
    if (d >= heute && d <= horizont) {
      out.push({ id: `auto-gewst-${jahr}-${m}`, titel: `GewSt-Vorauszahlung Q${Math.ceil(m / 3)}`, faelligAm: d });
    }
  }
  // USt: 10. des Folgemonats — nur die nächsten 2 Termine erinnern
  for (let i = 0; i < 2; i++) {
    const ref = new Date(now.getFullYear(), now.getMonth() + i + 1, 10);
    const d = ref.toISOString().slice(0, 10);
    if (d >= heute && d <= horizont) {
      const periode = `${ref.getFullYear()}-M${String(ref.getMonth()).padStart(2, "0")}`;
      // Periode = Vormonat (Folge-10. = Frist für den Vormonat → ref.getMonth() ist 1-basiert für Vormonat)
      const periodMonth = ref.getMonth(); // 0-basiert = Vormonat 1-basiert
      const labelMonth = periodMonth === 0 ? 12 : periodMonth;
      const labelYear = periodMonth === 0 ? ref.getFullYear() - 1 : ref.getFullYear();
      out.push({
        id: `auto-ust-${labelYear}-M${String(labelMonth).padStart(2, "0")}`,
        titel: `USt-Voranmeldung ${String(labelMonth).padStart(2, "0")}/${labelYear}`,
        faelligAm: d,
      });
      void periode;
    }
  }
  return out;
}

export function runSteuerFristCheck(now = new Date()): SteuerFristResult {
  const heute = now.toISOString().slice(0, 10);
  const tag = heute;
  const posten = listManuellePosten();
  const bezahlt = listBezahlt();

  let benachrichtigt = 0;
  let uebersprungen = 0;
  for (const p of posten) {
    if (bezahlt[p.id]) {
      uebersprungen++;
      continue;
    }
    const status = fristStatusFor(p.faelligAm, heute);
    if (status === "ok" || status === "erledigt") {
      uebersprungen++;
      continue;
    }
    if (alreadyLogged(p.id, tag, status)) {
      uebersprungen++;
      continue;
    }
    const tpl = STATUS_LABEL[status];
    record({
      art: "steuer_frist",
      bezugArt: "steuer_posten",
      bezugId: p.id,
      titel: tpl.titel(p.titel),
      beschreibung: `Fällig am ${p.faelligAm} — geschätzt ${p.geschaetzterBetrag.toFixed(2)} €`,
      notify: {
        prioritaet: tpl.prio,
        titel: tpl.titel(p.titel),
        beschreibung: `Fällig am ${p.faelligAm}`,
        aktionLabel: "Öffnen",
        aktionRoute: "/steuern",
      },
    });
    logBenachrichtigung(p.id, tag, status);
    benachrichtigt++;
  }

  // --- Auto-Posten (USt/KSt/GewSt) — deterministische Kalender-Termine ---
  const auto = naechsteAutoFristen(now);
  for (const a of auto) {
    if (bezahlt[a.id]) { uebersprungen++; continue; }
    const status = fristStatusFor(a.faelligAm, heute);
    if (status === "ok" || status === "erledigt") { uebersprungen++; continue; }
    if (alreadyLogged(a.id, tag, status)) { uebersprungen++; continue; }
    const tpl = STATUS_LABEL[status];
    record({
      art: "steuer_frist",
      bezugArt: "steuer_posten",
      bezugId: a.id,
      titel: tpl.titel(a.titel),
      beschreibung: `Fällig am ${a.faelligAm}`,
      notify: {
        prioritaet: tpl.prio,
        titel: tpl.titel(a.titel),
        beschreibung: `Fällig am ${a.faelligAm}`,
        aktionLabel: "Öffnen",
        aktionRoute: "/steuern",
      },
    });
    logBenachrichtigung(a.id, tag, status);
    benachrichtigt++;
  }

  return { geprueft: posten.length + auto.length, benachrichtigt, uebersprungen };
}
