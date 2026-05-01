// Standard-Mahnstufen und Standard-Mahn-E-Mail-Vorlagen.
// Werden im Seed verwendet; können in den Einstellungen überschrieben werden.

import type { EmailVorlage, MahnEinstellungen, MahnStufeConfig } from "@/lib/api/types";

export const STANDARD_MAHN_STUFEN: MahnStufeConfig[] = [
  {
    stufe: 1,
    bezeichnung: "Zahlungserinnerung",
    tageNachVorgaenger: 3,
    gebuehr: 0,
    fristTage: 7,
  },
  {
    stufe: 2,
    bezeichnung: "1. Mahnung",
    tageNachVorgaenger: 10,
    gebuehr: 5,
    fristTage: 7,
  },
  {
    stufe: 3,
    bezeichnung: "Letzte Mahnung",
    tageNachVorgaenger: 10,
    gebuehr: 10,
    fristTage: 7,
  },
];

export const STANDARD_MAHN_EINSTELLUNGEN: MahnEinstellungen = {
  autoVorschlagAktiv: true,
  stufen: STANDARD_MAHN_STUFEN,
};

/** Erzeugt 3 Standard-E-Mail-Vorlagen für die Mahnstufen. */
export function standardMahnVorlagen(jetzt: string, uuid: () => string): EmailVorlage[] {
  return [
    {
      id: uuid(),
      name: "Zahlungserinnerung (freundlich)",
      kontext: "mahnung",
      betreff: "Zahlungserinnerung zu Rechnung {{rechnung.nummer}}",
      koerperHtml:
        '<p>Sehr geehrte Damen und Herren,</p>\n' +
        '<p>vermutlich ist es Ihrer Aufmerksamkeit entgangen — die Rechnung <strong>{{rechnung.nummer}}</strong> über <strong>{{rechnung.summe}}</strong> war am {{rechnung.faellig}} fällig. Aktuell sind noch <strong>{{rechnung.offen}}</strong> offen.</p>\n' +
        '<p>Wir bitten Sie freundlich um Begleichung bis spätestens <strong>{{mahnung.neueFrist}}</strong>.</p>\n' +
        '<p>Sollten Sie die Zahlung in der Zwischenzeit bereits angewiesen haben, betrachten Sie diese Erinnerung bitte als gegenstandslos.</p>\n' +
        '<p>Mit freundlichen Grüßen</p>',
      istStandard: true,
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    },
    {
      id: uuid(),
      name: "1. Mahnung (bestimmt)",
      kontext: "mahnung",
      betreff: "1. Mahnung zu Rechnung {{rechnung.nummer}}",
      koerperHtml:
        '<p>Sehr geehrte Damen und Herren,</p>\n' +
        '<p>trotz unserer Zahlungserinnerung konnten wir bis heute keinen Zahlungseingang zu Rechnung <strong>{{rechnung.nummer}}</strong> verzeichnen. Die Rechnung ist seit <strong>{{mahnung.tageUeberfaellig}} Tagen</strong> überfällig.</p>\n' +
        '<p>Offener Betrag: <strong>{{rechnung.offen}}</strong><br/>\n' +
        'Mahngebühr: <strong>{{mahnung.gebuehr}}</strong><br/>\n' +
        'Gesamtforderung: <strong>{{mahnung.gesamtForderung}}</strong></p>\n' +
        '<p>Wir bitten Sie, den Gesamtbetrag bis spätestens <strong>{{mahnung.neueFrist}}</strong> auf unser Konto zu überweisen.</p>\n' +
        '<p>Mit freundlichen Grüßen</p>',
      istStandard: false,
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    },
    {
      id: uuid(),
      name: "Letzte Mahnung (Inkasso-Hinweis)",
      kontext: "mahnung",
      betreff: "Letzte Mahnung — Rechnung {{rechnung.nummer}}",
      koerperHtml:
        '<p>Sehr geehrte Damen und Herren,</p>\n' +
        '<p>leider ist auch unsere 1. Mahnung zur Rechnung <strong>{{rechnung.nummer}}</strong> ohne Reaktion geblieben. Diese Mahnung ist unsere <strong>letzte</strong> vor Übergabe an ein Inkassounternehmen.</p>\n' +
        '<p>Offener Betrag: <strong>{{rechnung.offen}}</strong><br/>\n' +
        'Mahngebühren gesamt: <strong>{{mahnung.gebuehr}}</strong><br/>\n' +
        'Gesamtforderung: <strong>{{mahnung.gesamtForderung}}</strong></p>\n' +
        '<p>Bitte überweisen Sie den Gesamtbetrag spätestens bis <strong>{{mahnung.neueFrist}}</strong>. Andernfalls werden wir die Forderung ohne weitere Ankündigung zur Beitreibung weitergeben — die dadurch entstehenden Kosten gehen zu Ihren Lasten.</p>\n' +
        '<p>Mit freundlichen Grüßen</p>',
      istStandard: false,
      erstelltAm: jetzt,
      aktualisiertAm: jetzt,
    },
  ];
}
