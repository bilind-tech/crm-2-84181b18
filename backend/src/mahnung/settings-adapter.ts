// Mappt zwischen flachem MahnungSchema (Persistenz) und nested UI-Shape
// ({ autoVorschlagAktiv, modus, cronZeit, ..., stufen: [...] }).
import { z } from "zod";
import { MahnungSchema } from "../settings/schemas.js";
import { defaultStufen } from "./regeln.js";

export type FlacheMahnung = z.infer<typeof MahnungSchema>;

export interface MahnStufeUi {
  stufe: 1 | 2 | 3;
  bezeichnung: string;
  tageNachVorgaenger: number;
  gebuehr: number;
  fristTage: number;
  emailVorlageId?: string | null;
}

export interface MahnEinstellungenUi {
  autoVorschlagAktiv: boolean;
  modus: "aus" | "vorschlag" | "auto";
  cronZeit: string;
  nurAnWerktagen: boolean;
  benachrichtigungBeiVorschlag: boolean;
  benachrichtigungBeiAutoversand: boolean;
  stufen: MahnStufeUi[];
}

export function flachZuUi(flach: FlacheMahnung): MahnEinstellungenUi {
  return {
    autoVorschlagAktiv: flach.aktiv,
    modus: flach.modus,
    cronZeit: flach.cronZeit,
    nurAnWerktagen: flach.nurAnWerktagen,
    benachrichtigungBeiVorschlag: flach.benachrichtigungBeiVorschlag,
    benachrichtigungBeiAutoversand: flach.benachrichtigungBeiAutoversand,
    stufen: defaultStufen({
      stufe1Tage: flach.stufe1Tage,
      stufe2Tage: flach.stufe2Tage,
      stufe3Tage: flach.stufe3Tage,
      gebuehrStufe2: flach.gebuehrStufe2,
      gebuehrStufe3: flach.gebuehrStufe3,
      emailVorlageStufe1: flach.emailVorlageStufe1 ?? null,
      emailVorlageStufe2: flach.emailVorlageStufe2 ?? null,
      emailVorlageStufe3: flach.emailVorlageStufe3 ?? null,
    }) as MahnStufeUi[],
  };
}

/** Akzeptiert sowohl UI-Shape als auch flache Felder; gibt Patch fürs flache Schema zurück. */
export function uiPatchZuFlach(
  body: Partial<MahnEinstellungenUi> & Record<string, unknown>,
): Partial<FlacheMahnung> {
  const out: Partial<FlacheMahnung> = {};
  if (typeof body.autoVorschlagAktiv === "boolean") out.aktiv = body.autoVorschlagAktiv;
  if (body.modus) out.modus = body.modus;
  if (typeof body.cronZeit === "string") out.cronZeit = body.cronZeit;
  if (typeof body.nurAnWerktagen === "boolean") out.nurAnWerktagen = body.nurAnWerktagen;
  if (typeof body.benachrichtigungBeiVorschlag === "boolean")
    out.benachrichtigungBeiVorschlag = body.benachrichtigungBeiVorschlag;
  if (typeof body.benachrichtigungBeiAutoversand === "boolean")
    out.benachrichtigungBeiAutoversand = body.benachrichtigungBeiAutoversand;
  if (Array.isArray(body.stufen)) {
    for (const s of body.stufen) {
      if (!s || typeof s !== "object") continue;
      if (s.stufe === 1) {
        if (typeof s.tageNachVorgaenger === "number") out.stufe1Tage = s.tageNachVorgaenger;
        if (s.emailVorlageId !== undefined) out.emailVorlageStufe1 = s.emailVorlageId ?? null;
      } else if (s.stufe === 2) {
        if (typeof s.tageNachVorgaenger === "number") out.stufe2Tage = s.tageNachVorgaenger;
        if (typeof s.gebuehr === "number") out.gebuehrStufe2 = s.gebuehr;
        if (s.emailVorlageId !== undefined) out.emailVorlageStufe2 = s.emailVorlageId ?? null;
      } else if (s.stufe === 3) {
        if (typeof s.tageNachVorgaenger === "number") out.stufe3Tage = s.tageNachVorgaenger;
        if (typeof s.gebuehr === "number") out.gebuehrStufe3 = s.gebuehr;
        if (s.emailVorlageId !== undefined) out.emailVorlageStufe3 = s.emailVorlageId ?? null;
      }
    }
  }
  // Erlaubt auch flache Patches (z. B. aus Tests):
  for (const k of [
    "aktiv",
    "stufe1Tage",
    "stufe2Tage",
    "stufe3Tage",
    "gebuehrStufe2",
    "gebuehrStufe3",
    "emailVorlageStufe1",
    "emailVorlageStufe2",
    "emailVorlageStufe3",
  ] as const) {
    if (body[k] !== undefined && (out as Record<string, unknown>)[k] === undefined) {
      (out as Record<string, unknown>)[k] = body[k];
    }
  }
  return out;
}
