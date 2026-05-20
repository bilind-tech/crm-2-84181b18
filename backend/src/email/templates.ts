// Email-Vorlagen und -Signaturen: CRUD + Default-Switch + Platzhalter-Render.
// Default-Switch: pro Kontext genau eine ist_standard=1.
// Default-Vorlagen werden beim Boot per seed_key idempotent eingespielt
// (siehe seedOrUpdateDefaultVorlagen). User-eigene Vorlagen haben seed_key
// = NULL und werden niemals überschrieben.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";

export type EmailKontext = "rechnung" | "angebot" | "mahnung" | "protokoll" | "allgemein";

export interface EmailVorlage {
  id: string;
  name: string;
  betreff: string;
  bodyHtml: string;
  kontext: EmailKontext;
  istStandard: boolean;
  seedKey: string | null;
  erstelltAm: string;
  geaendertAm: string;
}
export interface EmailSignatur {
  id: string;
  name: string;
  html: string;
  istStandard: boolean;
  erstelltAm: string;
  geaendertAm: string;
}

interface VorlageRow {
  id: string; name: string; betreff: string; body_html: string;
  kontext: EmailKontext; ist_standard: number; seed_key: string | null;
  erstellt_am: string; geaendert_am: string;
}
interface SignaturRow {
  id: string; name: string; html: string; ist_standard: number;
  erstellt_am: string; geaendert_am: string;
}

const mapV = (r: VorlageRow): EmailVorlage & { koerperHtml: string; aktualisiertAm: string } => ({
  id: r.id, name: r.name, betreff: r.betreff, bodyHtml: r.body_html,
  // Frontend-Alias: das UI erwartet `koerperHtml` und `aktualisiertAm`.
  koerperHtml: r.body_html,
  kontext: r.kontext, istStandard: !!r.ist_standard,
  seedKey: r.seed_key ?? null,
  erstelltAm: r.erstellt_am, geaendertAm: r.geaendert_am,
  aktualisiertAm: r.geaendert_am,
});
const mapS = (r: SignaturRow): EmailSignatur => ({
  id: r.id, name: r.name, html: r.html, istStandard: !!r.ist_standard,
  erstelltAm: r.erstellt_am, geaendertAm: r.geaendert_am,
});

// ---------------- Vorlagen ----------------
export function listVorlagen(kontext?: EmailKontext): EmailVorlage[] {
  const db = getDatabase();
  const rows = (kontext
    ? db.prepare(`SELECT * FROM email_vorlage WHERE kontext = ? ORDER BY name`).all(kontext)
    : db.prepare(`SELECT * FROM email_vorlage ORDER BY kontext, name`).all()) as VorlageRow[];
  return rows.map(mapV);
}
export function getVorlage(id: string): EmailVorlage | null {
  const r = getDatabase().prepare(`SELECT * FROM email_vorlage WHERE id = ?`).get(id) as VorlageRow | undefined;
  return r ? mapV(r) : null;
}
export function getStandardVorlage(kontext: EmailKontext): EmailVorlage | null {
  const r = getDatabase().prepare(`SELECT * FROM email_vorlage WHERE kontext = ? AND ist_standard = 1 LIMIT 1`).get(kontext) as VorlageRow | undefined;
  return r ? mapV(r) : null;
}
export function createVorlage(d: Partial<EmailVorlage>): EmailVorlage {
  const id = crypto.randomUUID();
  const k = (d.kontext ?? "allgemein") as EmailKontext;
  const std = d.istStandard ? 1 : 0;
  const db = getDatabase();
  const tx = db.transaction(() => {
    if (std) db.prepare(`UPDATE email_vorlage SET ist_standard = 0 WHERE kontext = ?`).run(k);
    db.prepare(`INSERT INTO email_vorlage (id, name, betreff, body_html, kontext, ist_standard, seed_key) VALUES (?,?,?,?,?,?,?)`)
      .run(id, d.name ?? "Neue Vorlage", d.betreff ?? "", d.bodyHtml ?? "", k, std, d.seedKey ?? null);
  });
  tx();
  return getVorlage(id)!;
}
export function updateVorlage(id: string, d: Partial<EmailVorlage>): EmailVorlage | null {
  const cur = getVorlage(id);
  if (!cur) return null;
  const next = { ...cur, ...d };
  const db = getDatabase();
  const tx = db.transaction(() => {
    if (d.istStandard) {
      db.prepare(`UPDATE email_vorlage SET ist_standard = 0 WHERE kontext = ?`).run(next.kontext);
    }
    db.prepare(
      `UPDATE email_vorlage SET name=?, betreff=?, body_html=?, kontext=?, ist_standard=?, geaendert_am=datetime('now') WHERE id=?`,
    ).run(next.name, next.betreff, next.bodyHtml, next.kontext, next.istStandard ? 1 : 0, id);
  });
  tx();
  return getVorlage(id);
}
export function deleteVorlage(id: string): boolean {
  return getDatabase().prepare(`DELETE FROM email_vorlage WHERE id = ?`).run(id).changes > 0;
}

// ---------------- Signaturen ----------------
export function listSignaturen(): EmailSignatur[] {
  return (getDatabase().prepare(`SELECT * FROM email_signatur ORDER BY name`).all() as SignaturRow[]).map(mapS);
}
export function getSignatur(id: string): EmailSignatur | null {
  const r = getDatabase().prepare(`SELECT * FROM email_signatur WHERE id = ?`).get(id) as SignaturRow | undefined;
  return r ? mapS(r) : null;
}
export function getStandardSignatur(): EmailSignatur | null {
  const r = getDatabase().prepare(`SELECT * FROM email_signatur WHERE ist_standard = 1 LIMIT 1`).get() as SignaturRow | undefined;
  return r ? mapS(r) : null;
}
export function createSignatur(d: Partial<EmailSignatur>): EmailSignatur {
  const id = crypto.randomUUID();
  const std = d.istStandard ? 1 : 0;
  const db = getDatabase();
  const tx = db.transaction(() => {
    if (std) db.prepare(`UPDATE email_signatur SET ist_standard = 0`).run();
    db.prepare(`INSERT INTO email_signatur (id, name, html, ist_standard) VALUES (?,?,?,?)`)
      .run(id, d.name ?? "Neue Signatur", d.html ?? "", std);
  });
  tx();
  return getSignatur(id)!;
}
export function updateSignatur(id: string, d: Partial<EmailSignatur>): EmailSignatur | null {
  const cur = getSignatur(id);
  if (!cur) return null;
  const next = { ...cur, ...d };
  const db = getDatabase();
  const tx = db.transaction(() => {
    if (d.istStandard) db.prepare(`UPDATE email_signatur SET ist_standard = 0`).run();
    db.prepare(`UPDATE email_signatur SET name=?, html=?, ist_standard=?, geaendert_am=datetime('now') WHERE id=?`)
      .run(next.name, next.html, next.istStandard ? 1 : 0, id);
  });
  tx();
  return getSignatur(id);
}
export function deleteSignatur(id: string): boolean {
  return getDatabase().prepare(`DELETE FROM email_signatur WHERE id = ?`).run(id).changes > 0;
}

// ---------------- Platzhalter ----------------
// Whitelist-Render. Unbekannte Tokens bleiben leer. Werte werden HTML-escaped,
// damit ein Kundenname mit "<" das Mail-HTML nicht zerschießt.
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
export function renderTemplate(tpl: string, data: Record<string, unknown>): string {
  return tpl.replace(/\{\{\s*([a-zA-Z][\w.]*)\s*\}\}/g, (_, key) => {
    const parts = String(key).split(".");
    let v: unknown = data;
    for (const p of parts) {
      if (v && typeof v === "object" && p in (v as Record<string, unknown>)) {
        v = (v as Record<string, unknown>)[p];
      } else { v = ""; break; }
    }
    if (v == null) return "";
    return escapeHtml(String(v));
  });
}

// ---------------- Default-Vorlagen ----------------
// Stabile seed_keys ermöglichen idempotentes Seeden und additive Updates:
// neue Defaults in späteren Releases werden ergänzt, bestehende User- oder
// Default-Vorlagen werden niemals überschrieben.
//
// Tonalität: kurz, höflich, professionell, menschlich. Keine Gedankenstriche
// und keine Trenn-Bindestriche zwischen Wörtern. Anrede über
// {{anrede.zeile}} (fällt auf "Sehr geehrte Damen und Herren," zurück).
// Signaturen werden separat angehängt und sind hier bewusst nicht enthalten.

interface DefaultVorlage {
  seedKey: string;
  name: string;
  kontext: EmailKontext;
  betreff: string;
  bodyHtml: string;
}

const P = (s: string) => `<p style="margin:0 0 12px 0">${s}</p>`;

// Bankblock einmal definieren, damit alle Vorlagen einheitlich bleiben.
const BANK_BLOCK =
  "Empfänger: {{firma.name}}<br>" +
  "IBAN: {{firma.iban}}<br>" +
  "BIC: {{firma.bic}}<br>" +
  "Bank: {{firma.bank}}<br>" +
  "Verwendungszweck: {{rechnung.nummer}}";

const DEFAULTS: DefaultVorlage[] = [
  // -------- Angebot --------
  {
    seedKey: "angebot.versand.v4",
    name: "Angebot Versand",
    kontext: "angebot",
    betreff: "Angebot {{angebot.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("im Anhang erhalten Sie unser Angebot {{angebot.nummer}} vom {{angebot.datum}} über {{angebot.summe}} brutto. Das Angebot ist gültig bis zum {{angebot.gueltigBis}}."),
  },

  // -------- Rechnung --------
  {
    seedKey: "rechnung.versand.v4",
    name: "Rechnung Versand",
    kontext: "rechnung",
    betreff: "Rechnung {{rechnung.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("im Anhang erhalten Sie unsere Rechnung {{rechnung.nummer}} vom {{rechnung.datum}} über {{rechnung.summe}} brutto.") +
      P("Bitte überweisen Sie den Betrag bis zum {{rechnung.faellig}} auf folgendes Konto:<br>" + BANK_BLOCK),
  },
  {
    seedKey: "rechnung.erinnerung.v4",
    name: "Zahlungserinnerung",
    kontext: "rechnung",
    betreff: "Zahlungserinnerung zu Rechnung {{rechnung.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("die Rechnung {{rechnung.nummer}} vom {{rechnung.datum}} über {{rechnung.summe}} ist seit dem {{rechnung.faellig}} fällig. Bislang konnten wir keinen Zahlungseingang feststellen.") +
      P("Wir bitten Sie, den offenen Betrag von {{rechnung.offen}} auf folgendes Konto zu überweisen:<br>" + BANK_BLOCK) +
      P("Sollte die Zahlung bereits erfolgt sein, ist diese Nachricht gegenstandslos."),
  },

  // -------- Mahnung --------
  {
    seedKey: "mahnung.stufe2.v4",
    name: "Mahnung Stufe 2",
    kontext: "mahnung",
    betreff: "2. Mahnung zu Rechnung {{rechnung.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("die Rechnung {{rechnung.nummer}} vom {{rechnung.datum}} ist trotz unserer Erinnerung weiterhin offen. Aktuell sind {{rechnung.offen}} ausstehend, dazu kommen Mahngebühren in Höhe von {{mahnung.gebuehr}}. Die Gesamtforderung beträgt {{mahnung.gesamtForderung}}.") +
      P("Wir bitten Sie, den Gesamtbetrag bis spätestens {{mahnung.neueFrist}} auf folgendes Konto zu überweisen:<br>" + BANK_BLOCK) +
      P("Sollte die Zahlung in den letzten Tagen bereits erfolgt sein, betrachten Sie dieses Schreiben bitte als gegenstandslos."),
  },
  {
    seedKey: "mahnung.stufe3.v4",
    name: "Letzte Mahnung",
    kontext: "mahnung",
    betreff: "Letzte Mahnung zu Rechnung {{rechnung.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("zur Rechnung {{rechnung.nummer}} vom {{rechnung.datum}} liegt uns trotz mehrfacher Erinnerung kein Zahlungseingang vor. Offen sind {{rechnung.offen}} zuzüglich Mahngebühren von {{mahnung.gebuehr}}. Die Gesamtforderung beträgt {{mahnung.gesamtForderung}}.") +
      P("Wir setzen Ihnen hiermit eine letzte Frist bis zum {{mahnung.neueFrist}}. Bitte überweisen Sie den vollständigen Betrag auf folgendes Konto:<br>" + BANK_BLOCK) +
      P("Sollte bis zu diesem Termin kein Zahlungseingang erfolgen, behalten wir uns weitere Schritte vor."),
  },

  // -------- Protokoll --------
  {
    seedKey: "protokoll.versand.v4",
    name: "Protokoll Versand",
    kontext: "protokoll",
    betreff: "Protokoll {{protokoll.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("im Anhang erhalten Sie das unterzeichnete Protokoll {{protokoll.nummer}} vom {{protokoll.datum}} zu Ihrer Ablage."),
  },
];

/**
 * Spielt fehlende Default-Vorlagen ein. Idempotent: ON CONFLICT(seed_key) DO
 * NOTHING. Bestehende Vorlagen (auch User-editierte Defaults) bleiben
 * unverändert. Ist für einen Kontext noch keine Standard-Vorlage gesetzt,
 * wird die zuerst gefundene neue Default-Vorlage als Standard markiert.
 */
export function seedOrUpdateDefaultVorlagen(): { eingefuegt: number; bestand: number } {
  const db = getDatabase();
  let eingefuegt = 0;
  let bestand = 0;

  // Welche Kontexte haben bereits eine Standard-Vorlage?
  const standardKontexte = new Set<string>(
    (db.prepare(`SELECT DISTINCT kontext FROM email_vorlage WHERE ist_standard = 1`).all() as { kontext: string }[]).map(
      (r) => r.kontext,
    ),
  );

  const existsStmt = db.prepare(`SELECT 1 FROM email_vorlage WHERE seed_key = ? LIMIT 1`);
  const insertStmt = db.prepare(
    `INSERT INTO email_vorlage (id, name, betreff, body_html, kontext, ist_standard, seed_key)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  const tx = db.transaction(() => {
    for (const d of DEFAULTS) {
      if (existsStmt.get(d.seedKey)) {
        bestand++;
        continue;
      }
      const istStandard = standardKontexte.has(d.kontext) ? 0 : 1;
      if (istStandard) standardKontexte.add(d.kontext);
      insertStmt.run(crypto.randomUUID(), d.name, d.betreff, d.bodyHtml, d.kontext, istStandard, d.seedKey);
      eingefuegt++;
    }
  });
  tx();

  return { eingefuegt, bestand };
}

/** @deprecated Wird nicht mehr genutzt — siehe seedOrUpdateDefaultVorlagen. */
export function seedDefaultVorlagen(): void {
  seedOrUpdateDefaultVorlagen();
}
