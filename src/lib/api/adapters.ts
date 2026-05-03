// Adapter: Backend-Form (Step 7) → Frontend-Typen aus src/lib/api/types.ts.
// Hält bestehende UI-Komponenten (AppHeader, VerlaufTab) unverändert kompatibel.

import type {
  Aktivitaet,
  AktivitaetTyp,
  Benachrichtigung,
  BenachrichtigungTyp,
  ID,
} from "@/lib/api/types";

interface BackendAktivitaet {
  id: string;
  art: string;
  bezugArt?: string | null;
  bezugId?: string | null;
  titel: string;
  beschreibung: string;
  zeitpunkt: string;
}

interface BackendBenachrichtigung {
  id: string;
  prioritaet: "info" | "erfolg" | "warnung" | "fehler";
  titel: string;
  beschreibung: string;
  aktionRoute?: string | null;
  gelesenAm?: string | null;
  erstelltAm: string;
}

const ALLOWED_AKT_TYPEN: ReadonlySet<AktivitaetTyp> = new Set<AktivitaetTyp>([
  "kunde_angelegt",
  "kunde_geaendert",
  "objekt_angelegt",
  "angebot_angelegt",
  "angebot_versendet",
  "angebot_in_rechnung_umgewandelt",
  "rechnung_angelegt",
  "rechnung_versendet",
  "zahlung_erfasst",
  "dokument_hochgeladen",
  "einstellung_geaendert",
  "backup_erstellt",
  "dauerauftrag_angelegt",
  "dauerauftrag_lauf_erzeugt",
  "zahlungseingang_zugeordnet",
  "zahlungseingang_importiert",
  "system",
]);

function toAktTyp(art: string): AktivitaetTyp {
  return (ALLOWED_AKT_TYPEN.has(art as AktivitaetTyp) ? art : "system") as AktivitaetTyp;
}

function toIsoDateTime(s: string): string {
  // Backend speichert "YYYY-MM-DD HH:MM:SS" (UTC). Frontend erwartet ISO.
  if (s.includes("T")) return s;
  return s.replace(" ", "T") + "Z";
}

function routeKey(
  route?: string | null,
): { route: string; params?: Record<string, string> } | undefined {
  if (!route) return undefined;
  // Backend liefert konkrete Pfade wie "/rechnungen/123" oder "/kunden/abc".
  // Frontend-Typ erwartet ein abstraktes route+params-Pattern.
  const m = route.match(/^\/(rechnungen|angebote|kunden|objekte)\/([^/?#]+)/);
  if (m) {
    return { route: `/${m[1]}/$id`, params: { id: decodeURIComponent(m[2]) } };
  }
  return { route };
}

export function adaptAktivitaet(b: BackendAktivitaet): Aktivitaet {
  return {
    id: b.id as ID,
    zeitpunkt: toIsoDateTime(b.zeitpunkt),
    typ: toAktTyp(b.art),
    beschreibung: b.beschreibung || b.titel,
    entitaet: b.bezugArt && b.bezugId ? { typ: b.bezugArt, id: b.bezugId as ID } : undefined,
  };
}

export function adaptBenachrichtigung(b: BackendBenachrichtigung): Benachrichtigung {
  const typMap: Record<BackendBenachrichtigung["prioritaet"], BenachrichtigungTyp> = {
    info: "info",
    erfolg: "erfolg",
    warnung: "warnung",
    fehler: "fehler",
  };
  return {
    id: b.id as ID,
    zeitpunkt: toIsoDateTime(b.erstelltAm),
    typ: typMap[b.prioritaet],
    titel: b.titel,
    text: b.beschreibung,
    link: routeKey(b.aktionRoute),
    gelesen: b.gelesenAm != null,
  };
}

// Backend-Listenform: { items: [...] } oder direkt Array (Mock).
export function unwrapList<T>(raw: unknown): T[] {
  if (Array.isArray(raw)) return raw as T[];
  if (
    raw &&
    typeof raw === "object" &&
    "items" in raw &&
    Array.isArray((raw as { items: T[] }).items)
  ) {
    return (raw as { items: T[] }).items;
  }
  return [];
}

export type { BackendAktivitaet, BackendBenachrichtigung };
