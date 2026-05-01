// Generischer CSV-Parser für Zahlungseingänge.
// Phase D: nur generisches Format mit Spalten-Mapping. CAMT.053 kommt im Pi-Backend.

export interface ParsedRow {
  raw: Record<string, string>;
}

export interface CsvParseResult {
  header: string[];
  rows: ParsedRow[];
}

/** Erkennt Trennzeichen (`;` oder `,` oder `\t`) anhand der ersten Zeile. */
function detectDelimiter(line: string): string {
  const cands = [";", ",", "\t"];
  let best = ";";
  let max = -1;
  for (const c of cands) {
    const n = line.split(c).length;
    if (n > max) { max = n; best = c; }
  }
  return best;
}

/** Sehr einfacher CSV-Parser mit Quote-Support ("…", verdoppeltes "" als Escape). */
function parseLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else cur += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === delim) { out.push(cur); cur = ""; }
      else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseCsv(text: string): CsvParseResult {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) return { header: [], rows: [] };
  const delim = detectDelimiter(lines[0]);
  const header = parseLine(lines[0], delim);
  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = parseLine(lines[i], delim);
    const raw: Record<string, string> = {};
    header.forEach((h, idx) => { raw[h] = cols[idx] ?? ""; });
    rows.push({ raw });
  }
  return { header, rows };
}

export interface SpaltenMapping {
  datum: string;
  betrag: string;
  zweck: string;
  sender?: string;
  iban?: string;
}

/** Versucht, Spaltennamen automatisch zu erkennen (DE/EN). */
export function autoMapping(header: string[]): Partial<SpaltenMapping> {
  const find = (...patterns: RegExp[]) =>
    header.find((h) => patterns.some((p) => p.test(h.toLowerCase())));
  return {
    datum: find(/buchungs/, /datum/, /date/),
    betrag: find(/betrag/, /amount/, /umsatz/),
    zweck: find(/verwendungs/, /zweck/, /buchungstext/, /reference/, /text/),
    sender: find(/auftraggeber/, /name/, /sender/, /payer/),
    iban: find(/iban/),
  };
}

/** Normalisiert deutsche Beträge (1.234,56) → number. Negative bleiben negativ. */
export function parseBetrag(raw: string): number {
  if (!raw) return 0;
  let s = raw.trim();
  // Vorzeichen am Ende?
  let neg = false;
  if (s.endsWith("-")) { neg = true; s = s.slice(0, -1).trim(); }
  // Tausenderpunkt + Komma → entfernen / durch Punkt
  if (s.includes(",") && s.includes(".")) {
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (s.includes(",")) {
    s = s.replace(",", ".");
  }
  const n = parseFloat(s.replace(/[^0-9.\-]/g, ""));
  if (Number.isNaN(n)) return 0;
  return neg ? -n : n;
}

/** Datum in ISO (YYYY-MM-DD) — akzeptiert "DD.MM.YYYY", "YYYY-MM-DD", "DD/MM/YYYY". */
export function parseDatum(raw: string): string {
  const s = raw.trim();
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const deMatch = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
  if (deMatch) {
    const tag = deMatch[1].padStart(2, "0");
    const monat = deMatch[2].padStart(2, "0");
    let jahr = deMatch[3];
    if (jahr.length === 2) jahr = "20" + jahr;
    return `${jahr}-${monat}-${tag}`;
  }
  return new Date().toISOString().slice(0, 10);
}

export interface ImportRow {
  buchungsdatum: string;
  betrag: number;
  verwendungszweck: string;
  senderName?: string;
  senderIban?: string;
  /** True wenn negativ (= Lastschrift / Ausgang) → wird übersprungen */
  istAusgang: boolean;
}

export function applyMapping(
  rows: ParsedRow[],
  mapping: SpaltenMapping,
): ImportRow[] {
  return rows.map((r) => {
    const betrag = parseBetrag(r.raw[mapping.betrag] ?? "");
    return {
      buchungsdatum: parseDatum(r.raw[mapping.datum] ?? ""),
      betrag: Math.abs(betrag),
      verwendungszweck: r.raw[mapping.zweck] ?? "",
      senderName: mapping.sender ? r.raw[mapping.sender] : undefined,
      senderIban: mapping.iban ? r.raw[mapping.iban] : undefined,
      istAusgang: betrag < 0,
    };
  });
}
