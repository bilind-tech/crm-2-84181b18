## Ziel

1. Du willst auf jeder Seite das **Stern-/Sparkles-/Info-Icon** loswerden (das kleine „ⓘ"/Sparkle hinter Überschriften wie auf Screenshot 8/9 neben „Kunden").
2. Aus den Listen (Kunden, Angebote, Rechnungen) öffnet sich beim Klick auf „+ Neu…" ein **Slide-Over-Panel** wie in deinen Screenshots (kein eigene Route mehr) mit Tabs **Basis / Adresse / Steuer & Zahlung / Notizen** beim Kunden, und einem Wizard-Form bei Angebot/Rechnung mit Live-Berechnung.
3. Jeder Kunde bekommt eine **vollwertige Detail-Seite** wie Screenshot 9 (Kopfzeile mit Avatar + Status, Tabs Übersicht / Ansprechpartner / Objekte / Angebote / Aufträge / Rechnungen / Belege / Notizen, Aktionen Bearbeiten + Archivieren).
4. Beim Erstellen von **Angebot/Rechnung**: Checkboxen für „Wir stellen Reinigungsmittel & Werkzeuge bereit", „Standard-Schlusstext anhängen" etc. + freier Text-Input („eigener Schlusstext") → fließt ins PDF.
5. **Backend liefert PDF** (laut deiner früheren Entscheidung) → in Detailansicht von Angebot/Rechnung wird das PDF via `<iframe>` angezeigt. Im Mock-Modus erzeugen wir das PDF direkt im Browser mit `pdfmake` (oder `jspdf`) so dass es **exakt dem Layout deiner mitgeschickten PDFs** entspricht (Kopfzeile mit Logo & Absenderzeile, Anrede, Leistungstabelle, Schlussformel, Footer mit 4 Spalten Bank/Kontakt/Register/Geschäftsführung).

## 1. Sparkle/Info-Icons radikal entfernen

Stelle in `PageHeader.tsx` und allen Listen sicher, dass **kein** `Sparkles`, `Info`, `HelpCircle` o. ä. Icon mehr neben dem Titel gerendert wird. Property `hint` aus PageHeader entfernen oder ignorieren. Codebase-weit per `rg` prüfen und alle Vorkommen löschen.

## 2. Neues UI-Pattern: Slide-Over Panel statt Subroute

Komponente `src/components/ui/slide-over.tsx` (basierend auf shadcn `Sheet` mit Side="right"). Breite ~`max-w-3xl`, weicher Schatten, weißer Hintergrund, runder X-Button oben rechts (so wie auf deinen Screenshots).

Routen-Cleanup: `kunden.neu.tsx`, `angebote.neu.tsx`, `rechnungen.neu.tsx`, `objekte.neu.tsx` werden durch ein **state-getriebenes Sheet** auf der jeweiligen Listen-Seite ersetzt. Die Routes bleiben (oder werden gelöscht und der „+ Neu"-Button öffnet das Sheet).

## 3. Kunde anlegen — Slide-Over mit Tabs

Tabs wie Screenshot 8: **Basis · Adresse · Steuer & Zahlung · Notizen**.

```text
Basis:           Typ (Firma/Privat) · Status · Firmenname · Anrede · Vorname · Nachname
                 Telefon · Mobil · E-Mail · Webseite
Adresse:         Straße · PLZ · Ort · Land
Steuer&Zahlung:  USt-IdNr · Steuernummer · Zahlungsziel (Tage) · Standard-Steuersatz % · Standard-Rabatt %
Notizen:         Tags (Pillen) · Freitext
```

Footer: rechts Button **„Kunde anlegen"** (Marineblau).

## 4. Kunde-Detailseite (`/kunden/$id`) — komplett neu

Layout exakt wie Screenshot 9:

```text
Breadcrumb: Home › Kunden › <Name>
H1: <Firmenname/Name>                                 [Bearbeiten] [Archivieren]
K-1003 · Firma
─────────────────────────────────────────────────────
[ Avatar ] <Name>  [Aktiv-Badge]
            🏢 N aktive Objekte
─────────────────────────────────────────────────────
Tabs: Übersicht · Ansprechpartner (n) · Objekte (n) ·
      Angebote (n) · Aufträge (n) · Rechnungen (n) · Belege (n) · Notizen (n)
─────────────────────────────────────────────────────
Übersicht:
 ┌─ STAMMDATEN ─────────┐  ┌─ ADRESSE ────────────┐
 │ Kundennummer  K-…    │  │ Straße               │
 │ Typ           Firma  │  │ PLZ Ort              │
 │ Firma         …      │  │ Land  Deutschland    │
 │ Person        …      │  └──────────────────────┘
 └──────────────────────┘
 ┌─ STEUER & ZAHLUNG ───┐  ┌─ TAGS & NOTIZEN ─────┐
 │ Zahlungsziel  14 Tage│  │ Tag-Pillen           │
 │ Standard-Steuer  19% │  │ Notizen Freitext     │
 └──────────────────────┘  └──────────────────────┘
```

Hinweis: „Aufträge"-Tab bleibt im Kunden-Detail (ist nur in der Sidebar entfernt). Falls du das auch hier nicht willst, sag Bescheid — ich nehme es dann raus.

Tab-Inhalte:
- **Ansprechpartner**: Liste + „+ Hinzufügen" → kleines Inline-Formular.
- **Objekte**: Tabelle der Objekte des Kunden + „+ Neues Objekt" (öffnet Slide-Over).
- **Angebote / Rechnungen**: gefilterte Tabelle + Direkt-Aktion „+ Neues Angebot/Rechnung für diesen Kunden" (Slide-Over mit vorausgewähltem Kunden).
- **Belege**: Dokumente mit `kundeId === id`.
- **Notizen**: Liste + Eingabefeld.

## 5. Angebot anlegen — Slide-Over (Screenshot 10)

```text
Kunde *  [Combobox]            Objekt (optional) [Combobox, erst nach Kunde]
Titel *  [Input]
─ Leistungen & Preise ──────────────────────────────────────────────
 # Beschreibung   Menge  Einheit  Einzelpreis €  MwSt %  Summe Netto
 1 …              1      Stk      0              19      0,00 €  [🗑]
 [+ Position hinzufügen]                  Netto / MwSt / Gesamt brutto
─ Wiederkehrendes Angebot (Dauerauftrag) [○]
─ Optionen ─────────────────────────────────────────────────────────
 ☑ Wir stellen Reinigungsmittel & Werkzeuge bereit
 ☑ Standard-Anschreiben verwenden
 ☐ Eigener Einleitungstext  → [Textarea]
 ☐ Eigener Schlusstext      → [Textarea]
Gültig bis [Datum]   MwSt-Satz % [19]   Rabatt % [0]
▾ Erweiterte Optionen (Ansprechpartner, Texte)
                                                  [Angebot anlegen]
```

Die Checkboxen werden auf den Angebot-Datensatz erweitert (siehe Datenmodell-Erweiterung).

## 6. Rechnung anlegen — Slide-Over (Screenshot 11)

Wie Angebot, zusätzlich:
- Datumsfelder: Rechnungsdatum / Fällig am / Frist (Tage)
- „Als Dauerauftrag anlegen" Toggle
- Button „Aus Vorlage…" neben „+ Position hinzufügen" (Auswahl Positionsvorlage)
- gleiche Checkboxen-Block wie beim Angebot

## 7. Datenmodell-Erweiterung (`src/lib/api/types.ts`)

```ts
interface AngebotOptionen {
  materialBereitgestellt: boolean;     // → Satz im PDF
  standardAnschreiben: boolean;        // intro aus Textvorlage
  eigenesIntro?: string;
  eigenesOutro?: string;
  wiederkehrend: boolean;
}
// → in Angebot + Rechnung als optionales Feld `optionen?: AngebotOptionen`
```

Mock-Backend übernimmt die Felder beim POST/PATCH.

## 8. PDF-Generator (Frontend, im Mock-Modus)

- npm-Paket `pdfmake` (worker-kompatibel, reines JS) hinzufügen.
- `src/lib/pdf/angebotPdf.ts`, `src/lib/pdf/rechnungPdf.ts` mit exakten Layouts laut deiner Vorlage:
  - Logo links oben (`src/assets/logo.png`)
  - Absenderzeile darunter klein in grau: `My Clean Center GmbH - Gartenstr. 16 - 53757 St. Augustin`
  - Empfänger-Block links, Datums-Block rechts
  - Überschrift „Angebot …" / „Rechnung"
  - Anrede + Einleitungstext
  - Leistungstabelle (Spalten lt. Vorlage)
  - „Zugunsten der Reinigung werden Reinigungswerkzeuge und Reinigungsmittel von uns zur Verfügung gestellt." → **wird nur eingefügt wenn `materialBereitgestellt = true`**
  - Schlussformel + Geschäftsführer
  - Footer 4-spaltig (Firma · Bank · Kontakt · Register), genau wie in PDF
- In `/angebote/$id` und `/rechnungen/$id`: `<iframe>` rechts, generiertes Blob-URL als `src`. Links Beträge & Aktionen.

## 9. Sonstige Aufräumarbeiten

- `Aktivität`-Route bleibt nur, falls woanders verlinkt; sonst entfernen.
- `objekte.neu.tsx` ebenfalls auf Slide-Over umstellen.
- Footer-Hinweis im Slide-Over: `Kunde XXX • erfolgreich gespeichert.` Toast nach Submit, dann automatisch zur Detailseite navigieren.

## Out of Scope (diese Runde)

- Reale E-Mail-Versendung des PDFs (bleibt Mock-Toast)
- Wiederkehrende Aufträge tatsächlich planen (nur Flag speichern)
- „Aus Vorlage…"-Editor für Positionsvorlagen verwalten

## Technische Umsetzung (Reihenfolge)

1. `bun add pdfmake` + Typen.
2. `src/components/ui/slide-over.tsx` neu (Sheet-Wrapper).
3. `src/lib/api/types.ts`: `AngebotOptionen` + Felder in `Angebot`/`Rechnung` ergänzen.
4. `src/lib/mock/backend.ts`: Felder mappen.
5. `src/lib/pdf/angebotPdf.ts` & `rechnungPdf.ts` (pdfmake Definitionen).
6. `src/components/forms/KundeForm.tsx`, `AngebotForm.tsx`, `RechnungForm.tsx`, `ObjektForm.tsx` mit Tabs + Checkboxen.
7. `src/components/layout/PageHeader.tsx`: `hint`-Prop & alle Sparkle-/Info-Icons entfernen.
8. `src/routes/kunden.tsx`, `angebote.tsx`, `rechnungen.tsx`, `objekte.tsx`: „+ Neu"-Button öffnet Slide-Over (lokaler State).
9. `src/routes/kunden.$id.tsx` komplett neu schreiben (Header + Tabs + Sektionen).
10. `src/routes/angebote.$id.tsx` & `rechnungen.$id.tsx`: 2-Spalten-Layout mit `<iframe>` PDF-Vorschau.
11. Stub-Routen `*.neu.tsx` auf Redirect zu Liste umstellen oder entfernen.
12. Codebase-Suche `rg "Sparkles|<Info |HelpCircle"` → alle Treffer entschärfen.

Sag „**weiter**" und ich setze das genau so um.
