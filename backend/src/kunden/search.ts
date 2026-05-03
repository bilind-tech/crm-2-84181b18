// FTS5-Suche über kunde / objekt / notiz / angebot / rechnung / dokument / protokoll.
// Wir bauen einen prefix-toleranten MATCH-String. Sicherer Umgang mit Sonderzeichen
// via Whitelist + Tokenisierung — keine direkte String-Konkatenation in MATCH.
// Zusätzlich: Belegnummern-Fallback per LIKE, damit "RE0526/01" oder "01" auch matchen.
import { getDatabase } from "../db/index.js";

export interface SuchTreffer {
  id: string;
  typ: "kunde" | "objekt" | "angebot" | "rechnung" | "dokument" | "protokoll" | "notiz";
  titel: string;
  untertitel?: string;
  link: { route: string; params?: Record<string, string> };
}

interface Row {
  entity_typ: SuchTreffer["typ"];
  entity_id: string;
  titel: string;
  untertitel: string | null;
  link_route: string;
  link_param_id: string;
}

/** Wandelt freien User-Input in einen FTS5-tauglichen MATCH-Ausdruck. */
function buildMatch(q: string): string | null {
  const cleaned = q
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9äöüß ]+/gi, " ");
  const tokensRaw = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
  if (tokensRaw.length === 0) return null;
  // Normalerweise Mindestlänge 2; wenn der gesamte Query nur kurze Codes enthält
  // (z. B. "01" oder "K1"), erlauben wir auch 1-Zeichen-Tokens.
  const minLen = tokensRaw.every((t) => t.length <= 3) ? 1 : 2;
  const tokens = tokensRaw.filter((t) => t.length >= minLen);
  if (tokens.length === 0) return null;
  return tokens.map((t) => `${t}*`).join(" AND ");
}

/** Erkennt typische Belegnummern wie "RE0526/01", "AN-0526-01", "GFU0526/01". */
function looksLikeBelegnummer(q: string): boolean {
  return /[a-zA-Z].*[\-/0-9]/.test(q.trim()) && /[\-/]/.test(q);
}

function nummerLikeFallback(q: string, limit: number): SuchTreffer[] {
  const db = getDatabase();
  const like = `%${q.trim()}%`;
  const rows: SuchTreffer[] = [];

  // Angebote
  for (const r of db
    .prepare(
      `SELECT a.id, a.nummer, a.titel,
              COALESCE(k.firmenname, TRIM(COALESCE(k.nachname,'') || ' ' || COALESCE(k.vorname,''))) AS kunde
         FROM angebot a LEFT JOIN kunde k ON k.id = a.kunde_id
        WHERE a.nummer LIKE ? LIMIT ?`,
    )
    .all(like, limit) as Array<{ id: string; nummer: string; titel: string | null; kunde: string | null }>) {
    rows.push({
      id: r.id,
      typ: "angebot",
      titel: `${r.nummer}${r.titel ? " · " + r.titel : ""}`,
      untertitel: r.kunde ?? undefined,
      link: { route: "/angebote/$id", params: { id: r.id } },
    });
  }
  // Rechnungen
  for (const r of db
    .prepare(
      `SELECT a.id, a.nummer, a.titel,
              COALESCE(k.firmenname, TRIM(COALESCE(k.nachname,'') || ' ' || COALESCE(k.vorname,''))) AS kunde
         FROM rechnung a LEFT JOIN kunde k ON k.id = a.kunde_id
        WHERE a.nummer LIKE ? LIMIT ?`,
    )
    .all(like, limit) as Array<{ id: string; nummer: string; titel: string | null; kunde: string | null }>) {
    rows.push({
      id: r.id,
      typ: "rechnung",
      titel: `${r.nummer}${r.titel ? " · " + r.titel : ""}`,
      untertitel: r.kunde ?? undefined,
      link: { route: "/rechnungen/$id", params: { id: r.id } },
    });
  }
  // Protokolle
  for (const r of db
    .prepare(
      `SELECT p.id, p.nummer, p.kind,
              COALESCE(k.firmenname, TRIM(COALESCE(k.nachname,'') || ' ' || COALESCE(k.vorname,''))) AS kunde,
              o.name AS objekt
         FROM protokolle p
         LEFT JOIN kunde k ON k.id = p.kunde_id
         LEFT JOIN objekt o ON o.id = p.objekt_id
        WHERE p.nummer LIKE ? LIMIT ?`,
    )
    .all(like, limit) as Array<{ id: string; nummer: string; kind: string; kunde: string | null; objekt: string | null }>) {
    rows.push({
      id: r.id,
      typ: "protokoll",
      titel: `${r.nummer} · ${r.kind === "schluessel" ? "Schlüsselübergabe" : "Übergabe-/Abnahmeprotokoll"}`,
      untertitel: [r.kunde, r.objekt].filter(Boolean).join(" · ") || undefined,
      link: { route: "/protokolle/$id", params: { id: r.id } },
    });
  }
  // Kunden (Nummer)
  for (const r of db
    .prepare(
      `SELECT id, nummer,
              COALESCE(firmenname, TRIM(COALESCE(nachname,'') || ' ' || COALESCE(vorname,''))) AS name
         FROM kunde WHERE nummer LIKE ? LIMIT ?`,
    )
    .all(like, limit) as Array<{ id: string; nummer: string; name: string | null }>) {
    rows.push({
      id: r.id,
      typ: "kunde",
      titel: r.name ?? r.nummer,
      untertitel: r.nummer,
      link: { route: "/kunden/$id", params: { id: r.id } },
    });
  }
  return rows;
}

export function suche(q: string, limit = 25): SuchTreffer[] {
  const trimmed = q.trim();
  if (trimmed.length === 0) return [];

  const results: SuchTreffer[] = [];
  const seen = new Set<string>();
  const push = (t: SuchTreffer) => {
    const key = `${t.typ}:${t.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    results.push(t);
  };

  // 1) Belegnummer-Fallback zuerst (exakte/teil-Treffer ranken oben)
  if (looksLikeBelegnummer(trimmed) || /^\d+$/.test(trimmed)) {
    for (const t of nummerLikeFallback(trimmed, limit)) push(t);
  }

  // 2) FTS5-Volltextsuche
  const match = buildMatch(trimmed);
  if (match) {
    try {
      const rows = getDatabase()
        .prepare(
          `SELECT entity_typ, entity_id, titel, untertitel, link_route, link_param_id
             FROM suche_idx
            WHERE suche_idx MATCH ?
            ORDER BY rank
            LIMIT ?`,
        )
        .all(match, limit) as Row[];
      for (const r of rows) {
        push({
          id: r.entity_id,
          typ: r.entity_typ,
          titel: r.titel,
          untertitel: r.untertitel ?? undefined,
          link: {
            route: r.link_route,
            params: r.link_param_id ? { id: r.link_param_id } : undefined,
          },
        });
      }
    } catch (e) {
      console.error("FTS error:", e);
    }
  }

  return results.slice(0, limit);
}
