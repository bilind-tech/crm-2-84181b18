// Hochlevel-Renderer mit Cache. Liefert Buffer + Hash + Dateiname.

import { getAngebot } from "../belege/angebote-repo.js";
import { getRechnung } from "../belege/rechnungen-repo.js";
import { getKunde, getAnsprechpartner, getObjekt } from "../kunden/repo.js";
import { angebotDocDef, rechnungDocDef } from "./layout.js";
import { renderPdf } from "./render.js";
import { computeHash, invalidate, logoFingerprint, readCached, writeCached, type BelegArt } from "./cache.js";
import { loadFirmaForPdf, loadLogoDataUrl } from "./firma.js";
import type { ApiAngebot, ApiRechnung } from "../belege/mappers.js";
import type { ApiKunde, ApiAnsprechpartner, ApiObjekt } from "../kunden/mappers.js";

function safe(s: string): string {
  return s.replace(/[^\p{L}\p{N}\- _]/gu, "").replace(/\s+/g, " ").trim();
}
function kundeName(k: ApiKunde): string {
  return safe(k.firmenname || [k.vorname, k.nachname].filter(Boolean).join(" ") || k.nummer);
}
function mmYYYY(iso?: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return mmYYYY(undefined);
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${mm}-${d.getUTCFullYear()}`;
}
function nummerForFilename(n: string): string {
  return n.replace(/\//g, "-");
}
function dateinameAngebot(a: ApiAngebot, k: ApiKunde): string {
  const teile = [`Angebot ${nummerForFilename(a.nummer)}`, kundeName(k)];
  const titel = safe(a.titel || "");
  if (titel) teile.push(`– ${titel}`);
  teile.push(`(${mmYYYY(a.erstelltAm)})`);
  return `${teile.join(" ")}.pdf`.replace(/\s+/g, " ");
}
function dateinameRechnung(r: ApiRechnung, k: ApiKunde): string {
  const teile = [`Rechnung ${nummerForFilename(r.nummer)}`, kundeName(k)];
  const titel = safe(r.titel || "");
  if (titel) teile.push(`– ${titel}`);
  teile.push(`(${mmYYYY(r.rechnungsdatum || r.erstelltAm)})`);
  return `${teile.join(" ")}.pdf`.replace(/\s+/g, " ");
}

export interface RenderResult {
  buffer: Buffer;
  hash: string;
  dateiname: string;
  fromCache: boolean;
}

export async function renderAngebotPdf(angebotId: string): Promise<RenderResult | null> {
  const a = getAngebot(angebotId);
  if (!a) throw new Error("Angebot nicht gefunden");
  const k = getKunde(a.kundeId);
  if (!k) throw new Error("Kunde zum Angebot nicht gefunden");
  const ap: ApiAnsprechpartner | undefined = a.ansprechpartnerId
    ? (getAnsprechpartner(a.ansprechpartnerId) ?? undefined)
    : undefined;
  const obj: ApiObjekt | null = a.objektId ? (getObjekt(a.objektId) ?? null) : null;
  const firma = loadFirmaForPdf();
  const logoDataUrl = loadLogoDataUrl();
  const hash = computeHash({ beleg: a, kunde: k, firma, ansprechpartner: ap, objekt: obj, logoFingerprint: logoFingerprint(logoDataUrl) });
  const dateiname = dateinameAngebot(a, k);

  const cached = readCached("angebot", a.id, hash);
  if (cached) return { buffer: cached, hash, dateiname, fromCache: true };

  const docDef = angebotDocDef({ angebot: a, kunde: k, firma, ansprechpartner: ap, objekt: obj, logoDataUrl });
  const buffer = await renderPdf(docDef);
  writeCached("angebot", a.id, hash, buffer);
  return { buffer, hash, dateiname, fromCache: false };
}

export async function renderRechnungPdf(rechnungId: string): Promise<RenderResult | null> {
  const r = getRechnung(rechnungId);
  if (!r) throw new Error("Rechnung nicht gefunden");
  const k = getKunde(r.kundeId);
  if (!k) throw new Error("Kunde zur Rechnung nicht gefunden");
  const ap: ApiAnsprechpartner | undefined = r.ansprechpartnerId
    ? (getAnsprechpartner(r.ansprechpartnerId) ?? undefined)
    : undefined;
  const obj: ApiObjekt | null = r.objektId ? (getObjekt(r.objektId) ?? null) : null;
  const firma = loadFirmaForPdf();
  const logoDataUrl = loadLogoDataUrl();
  const hash = computeHash({ beleg: r, kunde: k, firma, ansprechpartner: ap, objekt: obj, logoFingerprint: logoFingerprint(logoDataUrl) });
  const dateiname = dateinameRechnung(r, k);

  const cached = readCached("rechnung", r.id, hash);
  if (cached) return { buffer: cached, hash, dateiname, fromCache: true };

  const docDef = rechnungDocDef({ rechnung: r, kunde: k, firma, ansprechpartner: ap, objekt: obj, logoDataUrl });
  const buffer = await renderPdf(docDef);
  writeCached("rechnung", r.id, hash, buffer);
  return { buffer, hash, dateiname, fromCache: false };
}

export function invalidatePdfCache(art: BelegArt, id: string): void {
  invalidate(art, id);
}
