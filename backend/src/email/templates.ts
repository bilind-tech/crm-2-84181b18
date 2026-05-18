// Email-Vorlagen und -Signaturen: CRUD + Default-Switch + Platzhalter-Render.
// Default-Switch: pro Kontext genau eine ist_standard=1.
// Default-Vorlagen werden beim Boot per seed_key idempotent eingespielt
// (siehe seedOrUpdateDefaultVorlagen). User-eigene Vorlagen haben seed_key
// = NULL und werden niemals überschrieben.
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

const DEFAULTS: DefaultVorlage[] = [
  // -------- Angebot --------
  {
    seedKey: "angebot.standard",
    name: "Angebot Versand",
    kontext: "angebot",
    betreff: "Ihr Angebot {{angebot.nummer}} von {{firma.name}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("vielen Dank für Ihr Interesse an unseren Leistungen. Im Anhang finden Sie unser Angebot <strong>{{angebot.nummer}}</strong> über {{angebot.summe}} brutto, gültig bis {{angebot.gueltigBis}}.") +
      P("Wir haben den Vorschlag genau auf Ihre Anforderungen abgestimmt. Sollten Sie Fragen haben oder Anpassungen wünschen, melden Sie sich gerne telefonisch unter {{firma.telefon}} oder per Antwort auf diese E-Mail.") +
      P("Wir freuen uns auf Ihre Rückmeldung und auf eine gute Zusammenarbeit.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },
  {
    seedKey: "angebot.nachfass",
    name: "Angebot freundlich nachfassen",
    kontext: "angebot",
    betreff: "Kurze Nachfrage zu Ihrem Angebot {{angebot.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("vor einigen Tagen haben wir Ihnen unser Angebot <strong>{{angebot.nummer}}</strong> vom {{angebot.datum}} zugesendet. Wir wollten kurz nachfragen, ob alle Punkte für Sie verständlich sind und ob bereits eine Entscheidung absehbar ist.") +
      P("Falls noch Informationen fehlen oder Sie sich Anpassungen wünschen, passen wir das Angebot selbstverständlich gerne an. Sie erreichen uns telefonisch unter {{firma.telefon}}.") +
      P("Wir freuen uns auf Ihre Rückmeldung.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },
  {
    seedKey: "angebot.auftragsbestaetigung",
    name: "Auftragsbestätigung",
    kontext: "angebot",
    betreff: "Auftragsbestätigung zu Angebot {{angebot.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("vielen Dank für Ihren Auftrag. Wir bestätigen die Annahme unseres Angebots <strong>{{angebot.nummer}}</strong> über {{angebot.summe}} brutto.") +
      P("Wir melden uns in Kürze mit den nächsten Schritten zur Terminabstimmung. Sollten Sie vorab Fragen haben, erreichen Sie uns telefonisch unter {{firma.telefon}} oder per Antwort auf diese E-Mail.") +
      P("Wir freuen uns sehr auf die Zusammenarbeit.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },

  // -------- Rechnung --------
  {
    seedKey: "rechnung.standard",
    name: "Rechnung Versand",
    kontext: "rechnung",
    betreff: "Ihre Rechnung {{rechnung.nummer}} von {{firma.name}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("anbei senden wir Ihnen die Rechnung <strong>{{rechnung.nummer}}</strong> vom {{rechnung.datum}} über {{rechnung.summe}} brutto.") +
      P("Wir bitten Sie, den Betrag bis zum <strong>{{rechnung.faellig}}</strong> auf folgendes Konto zu überweisen:<br>" +
        "Empfänger: {{firma.name}}<br>IBAN: {{firma.iban}}<br>BIC: {{firma.bic}}<br>Bank: {{firma.bank}}<br>Verwendungszweck: {{rechnung.nummer}}") +
      P("Bei Fragen zur Rechnung melden Sie sich jederzeit gerne telefonisch unter {{firma.telefon}} oder per Antwort auf diese E-Mail.") +
      P("Vielen Dank für Ihr Vertrauen und für die gute Zusammenarbeit.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },
  {
    seedKey: "rechnung.erinnerung",
    name: "Zahlungserinnerung freundlich",
    kontext: "rechnung",
    betreff: "Freundliche Erinnerung zu Rechnung {{rechnung.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("vermutlich ist es im Tagesgeschäft untergegangen. Unsere Rechnung <strong>{{rechnung.nummer}}</strong> vom {{rechnung.datum}} über {{rechnung.summe}} ist aktuell noch offen. Es sind {{rechnung.offen}} ausstehend.") +
      P("Bitte prüfen Sie den Vorgang und überweisen Sie den Betrag in den nächsten Tagen auf folgendes Konto:<br>" +
        "Empfänger: {{firma.name}}<br>IBAN: {{firma.iban}}<br>BIC: {{firma.bic}}<br>Verwendungszweck: {{rechnung.nummer}}") +
      P("Falls die Zahlung bereits unterwegs ist, betrachten Sie diese Nachricht bitte als gegenstandslos. Bei Rückfragen erreichen Sie uns telefonisch unter {{firma.telefon}}.") +
      P("Vielen Dank für Ihre Aufmerksamkeit.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },
  {
    seedKey: "rechnung.zahlungseingang",
    name: "Zahlungseingang Bestätigung",
    kontext: "rechnung",
    betreff: "Zahlungseingang zu Rechnung {{rechnung.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("vielen Dank, wir haben Ihre Zahlung zu Rechnung <strong>{{rechnung.nummer}}</strong> über {{rechnung.summe}} erhalten. Der Vorgang ist damit für uns abgeschlossen.") +
      P("Wir freuen uns auf die weitere Zusammenarbeit. Sollten Sie weitere Anliegen haben, erreichen Sie uns gerne telefonisch unter {{firma.telefon}} oder per E-Mail.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },

  // -------- Mahnung --------
  {
    seedKey: "mahnung.stufe1",
    name: "Mahnung Stufe 1",
    kontext: "mahnung",
    betreff: "Zahlungserinnerung zu Rechnung {{rechnung.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("die Rechnung <strong>{{rechnung.nummer}}</strong> vom {{rechnung.datum}} über {{rechnung.summe}} ist seit {{mahnung.tageUeberfaellig}} Tagen überfällig. Aktuell sind noch {{rechnung.offen}} offen.") +
      P("Wir bitten Sie, den ausstehenden Betrag bis zum <strong>{{mahnung.neueFrist}}</strong> auf folgendes Konto zu überweisen:<br>" +
        "Empfänger: {{firma.name}}<br>IBAN: {{firma.iban}}<br>BIC: {{firma.bic}}<br>Verwendungszweck: {{rechnung.nummer}}") +
      P("Sollten Sie die Zahlung in den letzten Tagen bereits veranlasst haben, betrachten Sie dieses Schreiben bitte als gegenstandslos. Bei Rückfragen erreichen Sie uns unter {{firma.telefon}}.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },
  {
    seedKey: "mahnung.stufe2",
    name: "Mahnung Stufe 2",
    kontext: "mahnung",
    betreff: "2. Mahnung zu Rechnung {{rechnung.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("trotz unserer Erinnerung ist die Rechnung <strong>{{rechnung.nummer}}</strong> vom {{rechnung.datum}} weiterhin offen. Aktuell sind {{rechnung.offen}} ausstehend, dazu kommen Mahngebühren in Höhe von {{mahnung.gebuehr}}. Die Gesamtforderung beträgt damit <strong>{{mahnung.gesamtForderung}}</strong>.") +
      P("Wir bitten Sie, den Gesamtbetrag bis spätestens <strong>{{mahnung.neueFrist}}</strong> auf folgendes Konto zu überweisen:<br>" +
        "Empfänger: {{firma.name}}<br>IBAN: {{firma.iban}}<br>BIC: {{firma.bic}}<br>Verwendungszweck: {{rechnung.nummer}}") +
      P("Bitte nehmen Sie diese Mahnung ernst. Sollte es Gründe geben, die einer fristgerechten Zahlung entgegenstehen, melden Sie sich bitte umgehend unter {{firma.telefon}}, damit wir gemeinsam eine Lösung finden können.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },
  {
    seedKey: "mahnung.stufe3",
    name: "Mahnung Stufe 3 letzte",
    kontext: "mahnung",
    betreff: "Letzte Mahnung zu Rechnung {{rechnung.nummer}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("zur Rechnung <strong>{{rechnung.nummer}}</strong> vom {{rechnung.datum}} ist trotz mehrfacher Erinnerung kein Zahlungseingang zu verzeichnen. Aktuell sind {{rechnung.offen}} offen, zuzüglich Mahngebühren von {{mahnung.gebuehr}}. Die Gesamtforderung beträgt <strong>{{mahnung.gesamtForderung}}</strong>.") +
      P("Wir setzen Ihnen hiermit eine letzte Frist bis zum <strong>{{mahnung.neueFrist}}</strong>. Bitte überweisen Sie den vollständigen Betrag auf folgendes Konto:<br>" +
        "Empfänger: {{firma.name}}<br>IBAN: {{firma.iban}}<br>BIC: {{firma.bic}}<br>Verwendungszweck: {{rechnung.nummer}}") +
      P("Sollte bis zu diesem Termin kein Zahlungseingang erfolgen, sehen wir uns gezwungen, die Forderung an ein Inkassobüro abzugeben oder gerichtliche Schritte einzuleiten. Bitte vermeiden Sie diesen Weg, indem Sie zeitnah reagieren oder unter {{firma.telefon}} mit uns Kontakt aufnehmen.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },

  // -------- Allgemein --------
  {
    seedKey: "allgemein.anfrage",
    name: "Allgemeine Nachricht",
    kontext: "allgemein",
    betreff: "Nachricht von {{firma.name}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("vielen Dank für Ihre Nachricht. Wir melden uns hiermit zu Ihrem Anliegen.") +
      P("Bitte ergänzen Sie hier den eigentlichen Inhalt Ihrer Nachricht. Bei Fragen erreichen Sie uns telefonisch unter {{firma.telefon}} oder per Antwort auf diese E-Mail.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
  },
  {
    seedKey: "allgemein.danke",
    name: "Dankesnachricht",
    kontext: "allgemein",
    betreff: "Vielen Dank von {{firma.name}}",
    bodyHtml:
      P("{{anrede.zeile}}") +
      P("wir möchten uns kurz für die angenehme Zusammenarbeit und Ihr Vertrauen bedanken. Es freut uns sehr, Sie zu unseren Kundinnen und Kunden zählen zu dürfen.") +
      P("Sollten Sie zukünftig weitere Anliegen haben, sind wir gerne für Sie da. Sie erreichen uns telefonisch unter {{firma.telefon}} oder per E-Mail.") +
      P("Mit freundlichen Grüßen<br>Ihr Team von {{firma.name}}"),
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
