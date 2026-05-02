// Hochlevel-Renderer mit Cache. Liefert Buffer + Hash + Dateiname.

import { getAngebot } from "../belege/angebote-repo.js";
import { getRechnung } from "../belege/rechnungen-repo.js";
import { getKunde, getAnsprechpartner } from "../kunden/repo.js";
import { angebotDocDef, rechnungDocDef } from "./layout.js";
import { renderPdf } from "./render.js";
import { computeHash, invalidate, logoFingerprint, readCached, writeCached, type BelegArt } from "./cache.js";
import { loadFirmaForPdf, loadLogoDataUrl } from "./firma.js";
import type { ApiAngebot, ApiRechnung } from "../belege/mappers.js";
import type { ApiKunde, ApiAnsprechpartner } from "../kunden/mappers.js";

function dateinameAngebot(a: ApiAngebot, k: ApiKunde): string {
  const kn = (k.firmenname || [k.vorname, k.nachname].filter(Boolean).join(" ") || k.nummer)
    .replace(/[^\p{L}\p{N}\- _]/gu, "").trim();
  return `Angebot ${a.nummer} ${kn}.pdf`.replace(/\s+/g, " ");
}
function dateinameRechnung(r: ApiRechnung, k: ApiKunde): string {
  const kn = (k.firmenname || [k.vorname, k.nachname].filter(Boolean).join(" ") || k.nummer)
    .replace(/[^\p{L}\p{N}\- _]/gu, "").trim();
  return `Rechnung ${r.nummer} ${kn}.pdf`.replace(/\s+/g, " ");
}

export interface RenderResult {
  buffer: Buffer;
  hash: string;
  dateiname: string;
  fromCache: boolean;
}

export async function renderAngebotPdf(angebotId: string): Promise<RenderResult | null> {
  const a = getAngebot(angebotId);
  if (!a) return null;
  const k = getKunde(a.kundeId);
  if (!k) return null;
  const ap: ApiAnsprechpartner | undefined = a.ansprechpartnerId
    ? (getAnsprechpartner(a.ansprechpartnerId) ?? undefined)
    : undefined;
  const firma = loadFirmaForPdf();
  const logoDataUrl = loadLogoDataUrl();
  const hash = computeHash({ beleg: a, kunde: k, firma, ansprechpartner: ap, logoFingerprint: logoFingerprint(logoDataUrl) });
  const dateiname = dateinameAngebot(a, k);

  const cached = readCached("angebot", a.id, hash);
  if (cached) return { buffer: cached, hash, dateiname, fromCache: true };

  const docDef = angebotDocDef({ angebot: a, kunde: k, firma, ansprechpartner: ap, logoDataUrl });
  const buffer = await renderPdf(docDef);
  writeCached("angebot", a.id, hash, buffer);
  return { buffer, hash, dateiname, fromCache: false };
}

export async function renderRechnungPdf(rechnungId: string): Promise<RenderResult | null> {
  const r = getRechnung(rechnungId);
  if (!r) return null;
  const k = getKunde(r.kundeId);
  if (!k) return null;
  const ap: ApiAnsprechpartner | undefined = r.ansprechpartnerId
    ? (getAnsprechpartner(r.ansprechpartnerId) ?? undefined)
    : undefined;
  const firma = loadFirmaForPdf();
  const logoDataUrl = loadLogoDataUrl();
  const hash = computeHash({ beleg: r, kunde: k, firma, ansprechpartner: ap, logoFingerprint: logoFingerprint(logoDataUrl) });
  const dateiname = dateinameRechnung(r, k);

  const cached = readCached("rechnung", r.id, hash);
  if (cached) return { buffer: cached, hash, dateiname, fromCache: true };

  const docDef = rechnungDocDef({ rechnung: r, kunde: k, firma, ansprechpartner: ap, logoDataUrl });
  const buffer = await renderPdf(docDef);
  writeCached("rechnung", r.id, hash, buffer);
  return { buffer, hash, dateiname, fromCache: false };
}

export function invalidatePdfCache(art: BelegArt, id: string): void {
  invalidate(art, id);
}
