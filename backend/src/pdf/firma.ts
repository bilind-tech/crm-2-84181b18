// Lädt Firma- + Branding-Settings und mappt sie in die PDF-FirmaForPdf-Form.
// Logo: Datei `${dataDir}/branding/logo.png` wird, wenn vorhanden, als data-URL geliefert.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config } from "../config.js";
import { getSetting } from "../settings/store.js";
import type { FirmaForPdf } from "./types.js";

interface FirmaSettings {
  name?: string;
  inhaber?: string;
  strasse?: string;
  plz?: string;
  ort?: string;
  telefon?: string;
  email?: string;
  web?: string;
  ustId?: string;
  steuernummer?: string;
  handelsregister?: string;
  geschaeftsfuehrer?: string;
  bankName?: string;
  iban?: string;
  bic?: string;
}

export function loadFirmaForPdf(): FirmaForPdf {
  const f = getSetting<FirmaSettings>("firma") ?? {};
  return {
    firmenname: f.name?.trim() || "MyCleanCenter GmbH",
    strasse: f.strasse ?? null,
    plz: f.plz ?? null,
    ort: f.ort ?? null,
    telefon: f.telefon ?? null,
    email: f.email ?? null,
    webseite: f.web ?? null,
    ustId: f.ustId ?? null,
    steuernummer: f.steuernummer ?? null,
    handelsregister: f.handelsregister ?? null,
    geschaeftsfuehrer: f.geschaeftsfuehrer ?? null,
    bankName: f.bankName ?? null,
    iban: f.iban ?? null,
    bic: f.bic ?? null,
  };
}

export function brandingDir(): string {
  return path.join(config.dataDir, "branding");
}

/** Liefert das Firmen-Logo als data-URL oder null, wenn keine Datei vorhanden. */
export function loadLogoDataUrl(): string | null {
  for (const ext of ["png", "jpg", "jpeg"] as const) {
    const p = path.join(brandingDir(), `logo.${ext}`);
    if (existsSync(p)) {
      const buf = readFileSync(p);
      const mime = ext === "png" ? "image/png" : "image/jpeg";
      return `data:${mime};base64,${buf.toString("base64")}`;
    }
  }
  return null;
}
