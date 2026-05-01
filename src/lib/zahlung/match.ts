// Reine Match-Engine für Zahlungseingänge ↔ offene Rechnungen.
//
// Score 0–100, deterministisch. Wird im Frontend für Vorschläge und im Backend
// für die Auto-Zuordnung (≥ Schwellwert) verwendet.

import type { Kunde, Rechnung, Zahlungseingang } from "@/lib/api/types";

export interface MatchKontext {
  rechnung: Rechnung;
  kunde?: Kunde;
  /** Brutto der Rechnung (vorberechnet) */
  brutto: number;
  /** Bereits bezahlter Betrag (Summe Zahlungen) */
  bezahlt: number;
  /** Anzahl noch offener Rechnungen desselben Kunden (inkl. dieser) */
  offeneAnzahlKunde: number;
}

export interface MatchResult {
  rechnungId: string;
  score: number;
  begruendungen: string[];
}

const EPS = 0.005;

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, " ").trim();
}

function levenshtein(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const dp: number[] = [];
  for (let i = 0; i <= a.length; i++) dp[i] = i;
  for (let j = 1; j <= b.length; j++) {
    let prev = dp[0];
    dp[0] = j;
    let zeileMin = dp[0];
    for (let i = 1; i <= a.length; i++) {
      const tmp = dp[i];
      dp[i] = a[i - 1] === b[j - 1]
        ? prev
        : Math.min(prev, dp[i - 1], dp[i]) + 1;
      prev = tmp;
      if (dp[i] < zeileMin) zeileMin = dp[i];
    }
    if (zeileMin > max) return max + 1;
  }
  return dp[a.length];
}

function kundenNameTreffer(zweck: string, kunde?: Kunde): boolean {
  if (!kunde) return false;
  const z = normalize(zweck);
  const kandidaten = [kunde.firmenname, kunde.nachname, kunde.vorname]
    .filter((s): s is string => !!s && s.length >= 3)
    .map((s) => normalize(s));
  for (const k of kandidaten) {
    if (z.includes(k)) return true;
    // Token-weise Levenshtein
    for (const tok of z.split(" ")) {
      if (tok.length >= 4 && levenshtein(tok, k, 2) <= 2) return true;
    }
  }
  return false;
}

function rechnungsnummerImZweck(zweck: string, nummer: string): boolean {
  const z = normalize(zweck);
  const n = normalize(nummer);
  if (z.includes(n)) return true;
  // auch ohne Bindestriche / Trennzeichen versuchen
  const nKompakt = n.replace(/\s+/g, "");
  return z.replace(/\s+/g, "").includes(nKompakt);
}

export function bewerteMatch(
  tx: Zahlungseingang,
  k: MatchKontext,
): MatchResult {
  const begruendungen: string[] = [];
  let score = 0;

  const offen = Math.max(0, k.brutto - k.bezahlt);
  const betragIstOffen = Math.abs(tx.betrag - offen) < EPS;
  const betragIstBrutto = Math.abs(tx.betrag - k.brutto) < EPS;
  const betragIstTeil = !betragIstOffen && tx.betrag > EPS && tx.betrag < offen - EPS;

  if (betragIstOffen) {
    score += 50;
    begruendungen.push("Betrag = offener Rest");
  } else if (betragIstBrutto) {
    score += 40;
    begruendungen.push("Betrag = Rechnungsbrutto");
  } else if (betragIstTeil) {
    score += 20;
    begruendungen.push("möglicher Teilbetrag");
  }

  if (rechnungsnummerImZweck(tx.verwendungszweck, k.rechnung.nummer)) {
    score += 30;
    begruendungen.push("Rechnungsnummer im Verwendungszweck");
  }

  if (kundenNameTreffer(tx.verwendungszweck, k.kunde)) {
    score += 15;
    begruendungen.push("Kundenname im Verwendungszweck");
  }
  if (tx.senderName && kundenNameTreffer(tx.senderName, k.kunde)) {
    score += 10;
    begruendungen.push("Sender = Kunde");
  }

  if (k.offeneAnzahlKunde === 1 && k.kunde) {
    score += 5;
    begruendungen.push("einzige offene Rechnung des Kunden");
  }

  return { rechnungId: k.rechnung.id, score: Math.min(100, score), begruendungen };
}

/** Top-N Vorschläge sortiert nach Score absteigend. Filtert Scores ≤ 0. */
export function topVorschlaege(
  tx: Zahlungseingang,
  kontexte: MatchKontext[],
  n = 3,
): MatchResult[] {
  return kontexte
    .map((k) => bewerteMatch(tx, k))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, n);
}

export function scoreFarbe(score: number): "green" | "yellow" | "red" {
  if (score >= 80) return "green";
  if (score >= 50) return "yellow";
  return "red";
}
