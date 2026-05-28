// Datei-Cache für gerenderte PDFs.
// Pfad: {dataDir}/pdf-cache/{art}/{id}-{hash}.pdf
// Hash deckt alle ausgabe-relevanten Felder ab (Beleg + Kunde + Firma + Logo).

import crypto from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import type { ApiAngebot, ApiRechnung } from "../belege/mappers.js";
import type { ApiKunde, ApiAnsprechpartner, ApiObjekt } from "../kunden/mappers.js";
import type { FirmaForPdf } from "./types.js";

export type BelegArt = "angebot" | "rechnung";

function ensureDir(p: string): void {
  if (!existsSync(p)) mkdirSync(p, { recursive: true, mode: 0o700 });
}

export function cacheDir(art: BelegArt): string {
  const d = path.join(config.dataDir, "pdf-cache", art);
  ensureDir(d);
  return d;
}

export function computeHash(parts: {
  beleg: ApiAngebot | ApiRechnung;
  kunde: ApiKunde;
  firma: FirmaForPdf;
  ansprechpartner?: ApiAnsprechpartner;
  objekt?: ApiObjekt | null;
  logoFingerprint: string | null;
}): string {
  const { beleg, kunde, firma, ansprechpartner, objekt, logoFingerprint } = parts;
  const payload = {
    nummer: beleg.nummer,
    geaendertAm: beleg.geaendertAm,
    titel: beleg.titel,
    intro: beleg.introText,
    outro: beleg.outroText,
    rabatt: beleg.rabattGesamt,
    steuer: beleg.steuersatz,
    optionen: beleg.optionen,
    positionen: beleg.positionen.map((p) => ({
      b: p.beschreibung, m: p.menge, e: p.einheit, ep: p.einzelpreisNetto,
      st: p.steuersatz, r: p.rabatt, mo: p.modus, pp: p.pauschalpreisNetto,
    })),
    rechnungsdatum: (beleg as ApiRechnung).rechnungsdatum,
    faelligkeitsdatum: (beleg as ApiRechnung).faelligkeitsdatum,
    leistungsmonat: (beleg as ApiRechnung).leistungsmonat,
    gueltigBis: (beleg as ApiAngebot).gueltigBis,
    einsatzVon: (beleg as ApiAngebot).einsatzVon ?? (beleg as ApiRechnung).einsatzVon,
    einsatzBis: (beleg as ApiAngebot).einsatzBis ?? (beleg as ApiRechnung).einsatzBis,
    vertrag: (beleg as ApiRechnung).vertrag ?? null,
    kunde: {
      n: kunde.nummer, f: kunde.firmenname, v: kunde.vorname, na: kunde.nachname,
      s: kunde.strasse, p: kunde.plz, o: kunde.ort, l: kunde.land, a: kunde.anrede,
    },
    ap: ansprechpartner ? { v: ansprechpartner.vorname, n: ansprechpartner.nachname, a: ansprechpartner.anrede } : null,
    obj: objekt ? { s: objekt.strasse, p: objekt.plz, o: objekt.ort, l: objekt.land } : null,
    firma,
    logo: logoFingerprint,
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

function fileFor(art: BelegArt, id: string, hash: string): string {
  return path.join(cacheDir(art), `${id}-${hash}.pdf`);
}

export function readCached(art: BelegArt, id: string, hash: string): Buffer | null {
  const f = fileFor(art, id, hash);
  if (!existsSync(f)) return null;
  return readFileSync(f);
}

/** Schreibt atomar und entfernt veraltete Cache-Dateien zur selben id. */
export function writeCached(art: BelegArt, id: string, hash: string, data: Buffer): void {
  const dir = cacheDir(art);
  const tmp = path.join(dir, `.${id}-${hash}.tmp`);
  writeFileSync(tmp, data, { mode: 0o600 });
  renameSync(tmp, fileFor(art, id, hash));
  for (const f of readdirSync(dir)) {
    if (f.startsWith(`${id}-`) && f !== `${id}-${hash}.pdf`) {
      try { unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
    }
  }
}

export function invalidate(art: BelegArt, id: string): void {
  const dir = cacheDir(art);
  if (!existsSync(dir)) return;
  for (const f of readdirSync(dir)) {
    if (f.startsWith(`${id}-`)) {
      try { unlinkSync(path.join(dir, f)); } catch { /* ignore */ }
    }
  }
}

export function logoFingerprint(dataUrl: string | null): string | null {
  if (!dataUrl) return null;
  return crypto.createHash("sha256").update(dataUrl).digest("hex").slice(0, 12);
}
