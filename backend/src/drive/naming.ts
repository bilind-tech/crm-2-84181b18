// Template-Replacer für Drive-Pfade und Dateinamen.
// Pfad-Platzhalter:  {YYYY} {MM}
// Datei-Platzhalter: {nummer} {kunde} {leistung} {MM} {YYYY} {datum}

export interface NamingContext {
  jahr: number;       // 4-stellig
  monat: number;      // 1..12
  tag?: number;       // 1..31 (für {datum})
  nummer?: string;
  kunde?: string;
  leistung?: string;
}

/** Entfernt Drive-untaugliche Zeichen, kollabiert Whitespace. */
export function sanitizeSegment(s: string): string {
  // Drive verbietet praktisch nur "/" und Steuerzeichen, wir sind konservativer
  // damit Synology/Win-Mounts nicht zicken.
  return s
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function applyPathTemplate(template: string, ctx: NamingContext): string {
  const yyyy = String(ctx.jahr);
  const mm = pad2(ctx.monat);
  return template
    .replace(/\{YYYY\}/g, yyyy)
    .replace(/\{MM\}/g, mm)
    .split("/")
    .map((seg) => sanitizeSegment(seg))
    .filter((seg) => seg.length > 0)
    .join("/");
}

export function applyFileNameTemplate(template: string, ctx: NamingContext): string {
  const yyyy = String(ctx.jahr);
  const mm = pad2(ctx.monat);
  const dd = pad2(ctx.tag ?? 1);
  const datum = `${yyyy}-${mm}-${dd}`;
  const out = template
    .replace(/\{nummer\}/g, ctx.nummer ?? "")
    .replace(/\{kunde\}/g, ctx.kunde ?? "")
    .replace(/\{leistung\}/g, ctx.leistung ?? "")
    .replace(/\{datum\}/g, datum)
    .replace(/\{MM\}/g, mm)
    .replace(/\{YYYY\}/g, yyyy);
  return sanitizeSegment(out);
}

/** Zerlegt einen aufgelösten Pfad ("Rechnungen/2026/05") in Segmente. */
export function pathSegments(resolved: string): string[] {
  return resolved.split("/").map((s) => sanitizeSegment(s)).filter((s) => s.length > 0);
}
