// Platzhalter-System für E-Mail-Vorlagen.
// Syntax: {{kunde.firmenname}}, {{rechnung.offen}}, {{mahnung.gebuehr}} …
// Wird auf Betreff UND HTML-Body angewendet.

import type {
  Angebot,
  Firmendaten,
  Kunde,
  MahnEinstellungen,
  MahnStufe,
  Rechnung,
} from "@/lib/api/types";
import { formatDate, formatEUR } from "@/lib/format";
import { summenRechnung } from "@/lib/belege/summen";
import { berechneNeueFrist, bestimmeMahnZustand, stufenLabel } from "@/lib/mahnung/regeln";

export interface PlaceholderContext {
  kunde?: Kunde | null;
  angebot?: Angebot | null;
  rechnung?: Rechnung | null;
  firma?: Firmendaten | null;
  /** Optional — wenn gesetzt, werden {{mahnung.*}} Platzhalter aufgelöst. */
  mahnung?: {
    stufe: MahnStufe;
    einstellungen?: MahnEinstellungen | null;
  } | null;
}

const ANREDE_LABELS: Record<string, string> = {
  herr: "Herr",
  frau: "Frau",
  divers: "",
  keine: "",
};

function flatten(ctx: PlaceholderContext): Record<string, string> {
  const out: Record<string, string> = {};

  if (ctx.kunde) {
    const k = ctx.kunde;
    out["kunde.firmenname"] = k.firmenname ?? "";
    out["kunde.vorname"] = k.vorname ?? "";
    out["kunde.nachname"] = k.nachname ?? "";
    out["kunde.anrede"] = k.anrede ? ANREDE_LABELS[k.anrede] ?? "" : "";
    out["kunde.email"] = k.email ?? "";
    out["kunde.nummer"] = k.nummer;
    const name = k.firmenname || `${k.vorname ?? ""} ${k.nachname ?? ""}`.trim();
    out["kunde.name"] = name;
  }

  if (ctx.angebot) {
    const a = ctx.angebot;
    const s = summenRechnung(a.positionen, a.rabattGesamt);
    out["angebot.nummer"] = a.nummer;
    out["angebot.titel"] = a.titel;
    out["angebot.datum"] = formatDate(a.erstelltAm);
    out["angebot.gueltigBis"] = a.gueltigBis ? formatDate(a.gueltigBis) : "—";
    out["angebot.summe"] = formatEUR(s.brutto);
    out["angebot.netto"] = formatEUR(s.netto);
  }

  if (ctx.rechnung) {
    const r = ctx.rechnung;
    const s = summenRechnung(r.positionen, r.rabattGesamt);
    const bezahlt = r.zahlungen.reduce((acc, z) => acc + z.betrag, 0);
    const offen = Math.max(0, s.brutto - bezahlt);
    out["rechnung.nummer"] = r.nummer;
    out["rechnung.titel"] = r.titel;
    out["rechnung.datum"] = formatDate(r.rechnungsdatum);
    out["rechnung.faellig"] = formatDate(r.faelligkeitsdatum);
    out["rechnung.summe"] = formatEUR(s.brutto);
    out["rechnung.netto"] = formatEUR(s.netto);
    out["rechnung.bezahlt"] = formatEUR(bezahlt);
    out["rechnung.offen"] = formatEUR(offen);
  }

  if (ctx.firma) {
    const f = ctx.firma;
    out["firma.name"] = f.firmenname;
    out["firma.telefon"] = f.telefon ?? "";
    out["firma.email"] = f.email ?? "";
    out["firma.iban"] = f.iban ?? "";
  }

  if (ctx.mahnung && ctx.rechnung && ctx.mahnung.einstellungen) {
    const stufeConfig = ctx.mahnung.einstellungen.stufen.find(
      (s) => s.stufe === ctx.mahnung!.stufe,
    );
    if (stufeConfig) {
      const z = bestimmeMahnZustand(ctx.rechnung, ctx.mahnung.einstellungen);
      const neueFrist = berechneNeueFrist(stufeConfig);
      const gesamt = z.offenEUR + stufeConfig.gebuehr;
      out["mahnung.stufe"] = stufenLabel(ctx.mahnung.stufe, ctx.mahnung.einstellungen);
      out["mahnung.gebuehr"] = formatEUR(stufeConfig.gebuehr);
      out["mahnung.neueFrist"] = formatDate(neueFrist);
      out["mahnung.gesamtForderung"] = formatEUR(gesamt);
      out["mahnung.tageUeberfaellig"] = String(Math.max(0, z.tageUeberfaellig));
    }
  }

  return out;
}

const TOKEN = /\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g;

export function replacePlaceholders(text: string, ctx: PlaceholderContext): string {
  if (!text) return text;
  const map = flatten(ctx);
  return text.replace(TOKEN, (_, key) => {
    return key in map ? map[key] : `{{${key}}}`;
  });
}

/** Findet alle nicht aufgelösten Platzhalter — für UI-Hinweis. */
export function findUnresolvedPlaceholders(text: string, ctx: PlaceholderContext): string[] {
  const map = flatten(ctx);
  const out = new Set<string>();
  for (const m of text.matchAll(TOKEN)) {
    if (!(m[1] in map)) out.add(m[1]);
  }
  return Array.from(out);
}

export const ALLE_PLATZHALTER = [
  "kunde.firmenname",
  "kunde.vorname",
  "kunde.nachname",
  "kunde.anrede",
  "kunde.name",
  "kunde.email",
  "angebot.nummer",
  "angebot.summe",
  "angebot.gueltigBis",
  "rechnung.nummer",
  "rechnung.summe",
  "rechnung.faellig",
  "rechnung.offen",
  "rechnung.bezahlt",
  "firma.name",
  "firma.telefon",
  "firma.email",
  "lauf.zeitraum",
  "lauf.monat",
  "lauf.von",
  "lauf.bis",
];
