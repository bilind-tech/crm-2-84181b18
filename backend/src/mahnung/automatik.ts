// Mahn-Automatik: Hauptjob, der alle offenen Rechnungen prüft und je nach Modus
// Vorschläge / Auto-Versand / Benachrichtigungen erzeugt.
import { listRechnungen, updateRechnung, getRechnung } from "../belege/rechnungen-repo.js";
import { getKunde } from "../kunden/repo.js";
import {
  bestimmeMahnZustand,
  berechneNeueFrist,
  defaultStufen,
  type MahnEinstellungenBackend,
  type MahnStufe,
  type MahnStufeConfig,
  type MahnVorgang,
} from "./regeln.js";
import {
  appendEintrag,
  createLauf,
  finishLauf,
  type MahnLaufModus,
  type MahnLaufQuelle,
} from "./repo.js";
import { getSetting } from "../settings/store.js";
import { MahnungSchema, FirmaSchema } from "../settings/schemas.js";
import { enqueueVersand } from "../email/versand-repo.js";
import { getStandardVorlage, getVorlage } from "../email/templates.js";
import { record } from "../aktivitaet/repo.js";
import { emit } from "../events/bus.js";

export interface AutomatikResult {
  laufId: string;
  modus: MahnLaufModus;
  geprueft: number;
  vorschlaege: number;
  versendet: number;
  uebersprungen: number;
  fehler: number;
}

export interface AutomatikOptions {
  /** Override Modus (z. B. für Dry-Run via API). */
  modusOverride?: MahnLaufModus;
  quelle?: MahnLaufQuelle;
  /** Heute als ISO-Datum (Tests). */
  heute?: string;
}

/** Liest die persistierten Mahn-Einstellungen aus dem settings-Store. */
export function ladeMahnEinstellungen(): MahnEinstellungenBackend {
  const raw = MahnungSchema.parse(getSetting("mahnung") ?? {});
  return {
    modus: raw.modus,
    cronZeit: raw.cronZeit,
    nurAnWerktagen: raw.nurAnWerktagen,
    benachrichtigungBeiVorschlag: raw.benachrichtigungBeiVorschlag,
    benachrichtigungBeiAutoversand: raw.benachrichtigungBeiAutoversand,
    stufen: defaultStufen({
      stufe1Tage: raw.stufe1Tage,
      stufe2Tage: raw.stufe2Tage,
      stufe3Tage: raw.stufe3Tage,
      gebuehrStufe2: raw.gebuehrStufe2,
      gebuehrStufe3: raw.gebuehrStufe3,
      emailVorlageStufe1: raw.emailVorlageStufe1 ?? null,
      emailVorlageStufe2: raw.emailVorlageStufe2 ?? null,
      emailVorlageStufe3: raw.emailVorlageStufe3 ?? null,
    }),
  };
}

function renderPlaceholder(text: string, ctx: Record<string, unknown>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const path = key.trim().split(".");
    let v: unknown = ctx;
    for (const p of path) {
      if (v && typeof v === "object" && p in (v as Record<string, unknown>)) {
        v = (v as Record<string, unknown>)[p];
      } else {
        return "";
      }
    }
    return v == null ? "" : String(v);
  });
}

interface VersendeOpts {
  rechnungId: string;
  stufe: MahnStufe;
  config: MahnStufeConfig;
  heute: string;
}

/** Versendet eine Mahnung: Email-Versand einreihen + mahnungen[]-Eintrag setzen. */
export function versendeMahnungJetzt(opts: VersendeOpts): {
  ok: boolean;
  emailVersandId?: string;
  grund?: string;
} {
  const r = getRechnung(opts.rechnungId);
  if (!r) return { ok: false, grund: "rechnung-nicht-gefunden" };

  const kunde = getKunde(r.kundeId);
  const empfaenger = (kunde as { email?: string } | null)?.email?.trim();
  if (!empfaenger) return { ok: false, grund: "keine-empfaenger-email" };

  const vorlage = opts.config.emailVorlageId
    ? getVorlage(opts.config.emailVorlageId)
    : getStandardVorlage("mahnung");
  if (!vorlage) return { ok: false, grund: "keine-vorlage" };

  const firma = FirmaSchema.parse(getSetting("firma") ?? {});
  const neueFrist = berechneNeueFrist(opts.config, opts.heute);

  const ctx = {
    beleg: { nummer: r.nummer, neueFrist, gebuehr: opts.config.gebuehr },
    kunde: kunde ?? {},
    firma,
    mahnung: { stufe: opts.stufe, bezeichnung: opts.config.bezeichnung, neueFrist },
  };
  const betreff = renderPlaceholder(vorlage.betreff, ctx);
  const bodyHtml = renderPlaceholder(vorlage.bodyHtml, ctx);

  const idempotenzKey = `mahnung-${r.id}-stufe-${opts.stufe}`;
  const enq = enqueueVersand({
    empfaengerTo: empfaenger,
    betreff,
    bodyHtml,
    belegArt: "rechnung",
    belegId: r.id,
    vorlageId: vorlage.id,
    idempotenzKey,
  });

  const vorgang: MahnVorgang = {
    stufe: opts.stufe,
    versendetAm: new Date().toISOString(),
    neueFrist,
    gebuehr: opts.config.gebuehr,
    emailVersandId: enq.row.id,
  };
  const bestand = ((r.mahnungen as MahnVorgang[] | undefined) ?? []).filter(
    (m) => m.stufe !== opts.stufe,
  );
  updateRechnung(r.id, { mahnungen: [...bestand, vorgang] } as Record<string, unknown>);

  record({
    art: "mahnung.erstellt",
    bezugArt: "rechnung",
    bezugId: r.id,
    titel: `Mahnung Stufe ${opts.stufe} für Rechnung ${r.nummer}`,
    beschreibung: `Versand eingereiht (${empfaenger}), Frist ${neueFrist}`,
  });
  emit("mahnung:erstellt", { rechnungId: r.id, stufe: opts.stufe });
  return { ok: true, emailVersandId: enq.row.id };
}

/** Hauptlauf: prüft alle offenen Rechnungen einmal. Idempotent — keine doppelten Sends durch idempotenzKey. */
export function runMahnAutomatik(opts: AutomatikOptions = {}): AutomatikResult {
  const cfg = ladeMahnEinstellungen();
  const quelle: MahnLaufQuelle = opts.quelle ?? "manuell";
  const heute = opts.heute ?? new Date().toISOString().slice(0, 10);

  // HARTER GUARD: niemals automatischer Mail-Versand.
  // Selbst wenn jemand den Cron-Scheduler reaktiviert, läuft der Job nicht.
  if (quelle === "cron") {
    return { laufId: "", modus: "aus", geprueft: 0, vorschlaege: 0, versendet: 0, uebersprungen: 0, fehler: 0 };
  }
  // Auto-Modus ist generell deaktiviert — wird auf "vorschlag" zurückgestuft,
  // damit niemals automatisch Mails enqueued werden.
  const rohmodus = opts.modusOverride ?? cfg.modus;
  const modus: MahnLaufModus = rohmodus === "auto" ? "vorschlag" : rohmodus;

  const laufId = createLauf(quelle, modus);

  let geprueft = 0;
  let vorschlaege = 0;
  let versendet = 0;
  let uebersprungen = 0;
  let fehler = 0;

  if (modus === "aus") {
    finishLauf(laufId, { geprueft, vorschlaege, versendet, uebersprungen, fehler, notiz: "modus=aus" });
    return { laufId, modus, geprueft, vorschlaege, versendet, uebersprungen, fehler };
  }

  const rechnungen = listRechnungen({ archiviert: false, limit: 1000 });
  for (const r of rechnungen) {
    geprueft++;
    const z = bestimmeMahnZustand(r, cfg, heute);
    if (!z.empfohleneStufe) {
      uebersprungen++;
      continue;
    }
    const config = cfg.stufen.find((c) => c.stufe === z.empfohleneStufe);
    if (!config) {
      uebersprungen++;
      continue;
    }

    if (modus === "vorschlag") {
      appendEintrag({
        laufId,
        rechnungId: r.id,
        rechnungNr: r.nummer,
        stufe: z.empfohleneStufe,
        aktion: "vorschlag",
      });
      vorschlaege++;
      if (cfg.benachrichtigungBeiVorschlag) {
        record({
          art: "mahnung.vorschlag",
          bezugArt: "rechnung",
          bezugId: r.id,
          titel: `Mahnvorschlag Stufe ${z.empfohleneStufe}: ${r.nummer}`,
          beschreibung: `Offen ${z.offenEUR.toFixed(2)} €, ${z.tageUeberfaellig} Tage überfällig`,
          notify: {
            prioritaet: "warnung",
            titel: `Mahnvorschlag Stufe ${z.empfohleneStufe}`,
            beschreibung: `Rechnung ${r.nummer} – ${z.offenEUR.toFixed(2)} € offen`,
            aktionLabel: "Öffnen",
            aktionRoute: `/rechnungen/${r.id}`,
          },
        });
      }
      continue;
    }

    // modus === "auto"
    try {
      const res = versendeMahnungJetzt({
        rechnungId: r.id,
        stufe: z.empfohleneStufe,
        config,
        heute,
      });
      if (res.ok) {
        appendEintrag({
          laufId,
          rechnungId: r.id,
          rechnungNr: r.nummer,
          stufe: z.empfohleneStufe,
          aktion: "versendet",
          emailVersandId: res.emailVersandId ?? null,
        });
        versendet++;
      } else {
        appendEintrag({
          laufId,
          rechnungId: r.id,
          rechnungNr: r.nummer,
          stufe: z.empfohleneStufe,
          aktion: "fehler",
          grund: res.grund ?? "unbekannt",
        });
        fehler++;
      }
    } catch (e) {
      appendEintrag({
        laufId,
        rechnungId: r.id,
        rechnungNr: r.nummer,
        stufe: z.empfohleneStufe,
        aktion: "fehler",
        grund: e instanceof Error ? e.message : String(e),
      });
      fehler++;
    }
  }

  finishLauf(laufId, { geprueft, vorschlaege, versendet, uebersprungen, fehler, notiz: null });
  emit("einstellung:geaendert", { key: "mahnung.lauf", userId: null });
  return { laufId, modus, geprueft, vorschlaege, versendet, uebersprungen, fehler };
}
