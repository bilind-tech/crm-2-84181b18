// Email-Vorlagen und -Signaturen: CRUD + Default-Switch + Platzhalter-Render.
// Default-Switch: pro Kontext genau eine ist_standard=1.
import crypto from "node:crypto";
import { getDatabase } from "../db/index.js";

export type EmailKontext = "rechnung" | "angebot" | "mahnung" | "allgemein";

export interface EmailVorlage {
  id: string;
  name: string;
  betreff: string;
  bodyHtml: string;
  kontext: EmailKontext;
  istStandard: boolean;
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
  kontext: EmailKontext; ist_standard: number; erstellt_am: string; geaendert_am: string;
}
interface SignaturRow {
  id: string; name: string; html: string; ist_standard: number;
  erstellt_am: string; geaendert_am: string;
}

const mapV = (r: VorlageRow): EmailVorlage => ({
  id: r.id, name: r.name, betreff: r.betreff, bodyHtml: r.body_html,
  kontext: r.kontext, istStandard: !!r.ist_standard,
  erstelltAm: r.erstellt_am, geaendertAm: r.geaendert_am,
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
    db.prepare(`INSERT INTO email_vorlage (id, name, betreff, body_html, kontext, ist_standard) VALUES (?,?,?,?,?,?)`)
      .run(id, d.name ?? "Neue Vorlage", d.betreff ?? "", d.bodyHtml ?? "", k, std);
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

// ---------------- Default-Vorlagen seeden ----------------
const DEFAULTS: Array<Omit<EmailVorlage, "id" | "erstelltAm" | "geaendertAm">> = [
  {
    name: "Rechnung Versand", kontext: "rechnung", istStandard: true,
    betreff: "Ihre Rechnung {{beleg.nummer}} – {{firma.name}}",
    bodyHtml:
      `<p>Sehr geehrte/r {{kunde.anrede}} {{kunde.nachname}},</p>` +
      `<p>anbei erhalten Sie die Rechnung <strong>{{beleg.nummer}}</strong>.</p>` +
      `<p>Bitte begleichen Sie den Rechnungsbetrag innerhalb der angegebenen Frist.</p>` +
      `<p>Mit freundlichen Grüßen<br>{{firma.name}}</p>`,
  },
  {
    name: "Angebot Versand", kontext: "angebot", istStandard: true,
    betreff: "Ihr Angebot {{beleg.nummer}} – {{firma.name}}",
    bodyHtml:
      `<p>Sehr geehrte/r {{kunde.anrede}} {{kunde.nachname}},</p>` +
      `<p>anbei erhalten Sie unser Angebot <strong>{{beleg.nummer}}</strong>.</p>` +
      `<p>Bei Fragen melden Sie sich gerne.</p>` +
      `<p>Mit freundlichen Grüßen<br>{{firma.name}}</p>`,
  },
  {
    name: "Mahnung Stufe 1", kontext: "mahnung", istStandard: true,
    betreff: "Zahlungserinnerung zur Rechnung {{beleg.nummer}}",
    bodyHtml:
      `<p>Sehr geehrte/r {{kunde.anrede}} {{kunde.nachname}},</p>` +
      `<p>vermutlich ist es Ihrer Aufmerksamkeit entgangen — die Rechnung <strong>{{beleg.nummer}}</strong> ist noch offen.</p>` +
      `<p>Bitte begleichen Sie den Betrag in den nächsten Tagen.</p>` +
      `<p>Freundliche Grüße<br>{{firma.name}}</p>`,
  },
];

export function seedDefaultVorlagen(): void {
  const db = getDatabase();
  const exists = db.prepare(`SELECT COUNT(*) as c FROM email_vorlage`).get() as { c: number };
  if (exists.c > 0) return;
  for (const d of DEFAULTS) createVorlage(d);
}
