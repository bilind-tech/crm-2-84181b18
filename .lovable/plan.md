## Ziel

Drei Verbesserungen am Angebot-/Rechnung-Erstellen-Formular, abgeleitet aus deinen echten Beispielen:

1. **Dauerauftrag** beim Erstellen direkt mit **Rhythmus, Wochentagen & optional Stichtag** konfigurierbar — landet sichtbar im PDF.
2. **Position-Modus „Pauschal"**: ein großer Beschreibungsblock (mehrere Zeilen, Bullets) → **ein Preis** für alles. Genau das Layout deines Angebot-/Rechnung-Beispiels („Mo–Fr • Liste an Tätigkeiten • 3.750 € Pauschal").
3. **Beschreibungs-Eingabe vergrößern** (richtiges Auto-Resize-Textarea mit Bullet/Tab-Helfern), damit lange Leistungstexte vernünftig erfasst werden können.

Nicht vorgesehen: Menge/Einheit ganz entfernen — sie bleiben für Stunden-/m²-Abrechnungen wichtig (z. B. „2 h × 35 €"). Aber bei einer **Pauschal-Position** werden sie automatisch ausgeblendet, weil sie da sinnlos sind. Genau wie in deinem Rechnungs-Beispiel: Spalte „Stunden" leer, „Abrechnungsart = Pauschal".

---

## 1. PositionenEditor neu: Modus pro Position

Jede Position bekommt ein neues Feld `modus: "einzel" | "pauschal"`:

- **`einzel`** (Standard, wie heute): Menge × Einzelpreis. Beschreibung 1–2 Zeilen.
- **`pauschal`**: keine Menge/Einheit/Einzelpreis-Spalten — stattdessen **eine große Beschreibungs-Box** (Auto-Resize-Textarea, Bullet-Tasten, Markdown-leichte Liste) und **ein Pauschal-Preis-Feld** rechts.

Visuelles Layout `pauschal`:

```text
┌─ Position 1 · [Pauschal ▾]  [⋯ × ]
│  ┌─────────────────────────────────────────────┐
│  │ Büro Unterhalts- + Sanitäranlagenreinigung  │
│  │ • Böden feucht wischen / Teppich saugen     │
│  │ • Schreibtische & Oberflächen abwischen     │
│  │ • Papierkörbe entleeren                     │
│  │ • …                                         │
│  └─────────────────────────────────────────────┘
│  Häufigkeit (optional): [Mo–Fr · 5× wöchentlich]
│
│  Pauschalpreis (netto):  [    3.750,00 €  ]
│  MwSt: 19 %                Summe: 3.750,00 €
└────────────────────────────────────────────────
```

Implementierung:
- `PositionDraft` erweitern: `modus`, `pauschalpreisNetto`, `ausfuehrung?` (kurzer Frequenz-Tag wie „Mo–Fr • 5× wöchentlich" oder „2× monatlich"). 
- `summe(p)` wird zu: `modus === "pauschal" ? p.pauschalpreisNetto * (1 - rabatt/100) : menge * einzelpreis * …`.
- Kopf jeder Position bekommt einen kleinen **Mode-Switch** „Einzelpreis | Pauschal", damit man es schnell umschalten kann ohne die Position zu löschen.
- Toolbar im Editor-Footer: zwei Buttons — **„+ Position"** (Einzelpreis) und **„+ Pauschal-Block"** (legt direkt eine Pauschal-Position mit großer Box an).

## 2. Auto-Resize-Beschreibungsfeld + Bullet-Helfer

Neue kleine Komponente `<LeistungsBeschreibung>` (in `src/components/forms/`):
- `<textarea>` mit Auto-Höhe (mind. 4 Zeilen, max. ~16, scrollt danach).
- Tab in einer Zeile rückt ein. Enter auf einer „• "-Zeile macht automatisch ein neues „• ".
- Mini-Toolbar oben rechts: **„• Liste"** (markierte oder Cursor-Zeile mit „• " versehen) und **„↩ Zeilenumbruch"**-Hint.
- Wird auch im `einzel`-Modus genutzt — dann startet sie kompakt (1 Zeile), wächst bei Bedarf.

So sieht es nicht mehr „eingequetscht" aus, egal wie viel Text drinsteht.

## 3. Dauerauftrag-Konfiguration im Erstell-Formular

Wenn der Toggle „Dauerauftrag" aktiv ist, klappt direkt **darunter** ein kleiner Block auf:

```text
[✓] Dauerauftrag  
   Rhythmus:    ( ) Wöchentlich  (•) Monatlich  ( ) Quartalsweise  ( ) Jährlich
   Wochentage:  [Mo] [Di] [Mi] [Do] [Fr] [Sa] [So]    (mehrere wählbar)
   Stichtag:    Erster Werktag des Monats ▾
```

- State erweitert in `OptionenState`: `wiederkehrend`, `rhythmus: "woechentlich"|"monatlich"|"quartalsweise"|"jaehrlich"`, `wochentage: number[]` (0=So…6=Sa), `stichtag: { typ, tag? }`.
- Im Speicher-Payload geht das in das vorhandene `Angebot.optionen` (Feld `wiederkehrendDetails`) bzw. wird beim späteren „in Dauerauftrag umwandeln" in `Dauerauftrag.frequenz`/`stichtag` übernommen.
- Hilfstext, der live formatiert: „Mo–Fr · 5× wöchentlich" oder „2× monatlich" — derselbe Text wird **automatisch als `ausfuehrung`** in alle Positionen übernommen, wenn diese leer ist (genau wie in deinem Beispiel-PDF).

## 4. PDF-Renderer (`src/lib/pdf/belegPdf.ts`)

Tabelle wird angepasst, damit beide Modi sauber aussehen — exakt am Stil deines hochgeladenen Beispiels:

- Neue Spalten: **Ausführung | Leistung | Preis** (wenn mindestens eine Position pauschal ist), sonst die bisherige Tabelle.
- Pauschal-Positionen: 
  - Spalte „Ausführung" zeigt z. B. „Täglich · Mo–Fr · (5× wöchentlich)".
  - Spalte „Leistung" rendert die mehrzeilige Beschreibung mit echten Bullets (`text` als Stack mit `marker: "•"`).
  - Spalte „Preis" zeigt den Pauschalbetrag, vertikal zentriert.
- Einzel-Positionen behalten die feinere Aufschlüsselung (Menge/Einheit/Einzelpreis), werden in dieselbe Tabelle einsortiert.
- Summenblock unten unverändert.

## 5. Datenmodell + Migration

- `Position` in `src/lib/api/types.ts` erweitern um optionale Felder: `modus?: "einzel"|"pauschal"`, `pauschalpreisNetto?: number`, `ausfuehrung?: string`.
- Bestehende Positionen ohne `modus` werden als `einzel` interpretiert (Default in Editor & PDF).
- `BelegOptionen` erweitern um `wiederkehrendDetails?: { rhythmus, wochentage, stichtag }` — keine Pflichtfelder, alte Daten bleiben gültig.
- `toApiPositionen` mappt das neue Feld 1:1 durch.

## Geänderte / neue Dateien

- **neu** `src/components/forms/LeistungsBeschreibung.tsx` — Auto-Resize-Textarea mit Bullet-Helfer.
- **neu** `src/components/forms/DauerauftragKonfig.tsx` — der ausklappbare Rhythmus/Wochentage-Block.
- `src/components/forms/PositionenEditor.tsx` — Mode-Switch pro Position, Pauschal-Layout, neue „+ Pauschal-Block"-Aktion, große Beschreibungs-Box.
- `src/components/forms/OptionenBlock.tsx` — Felder für `wiederkehrendDetails` (über die neue DauerauftragKonfig-Komponente integriert).
- `src/components/forms/AngebotForm.tsx` & `RechnungForm.tsx` — neuen State, `DauerauftragKonfig` einbinden, `ausfuehrung` automatisch füllen, neuer Payload.
- `src/lib/api/types.ts` — `Position`/`BelegOptionen` erweitert.
- `src/lib/pdf/belegPdf.ts` — Tabelle „Ausführung | Leistung | Preis" für Pauschal-Mix.

## Akzeptanzkriterien

- Beim Erstellen eines neuen Angebots/einer Rechnung kann ich pro Position zwischen **Einzelpreis** und **Pauschal** umschalten.
- Im Pauschal-Modus erscheint **eine große, automatisch wachsende Textbox** mit Bullet-Helfer und genau **einem Preisfeld**. Menge/Einheit verschwinden.
- Toggle „Dauerauftrag" öffnet darunter einen Block mit **Rhythmus + Wochentagen** (+ optional Stichtag); der zusammengefasste Text („Mo–Fr · 5× wöchentlich") landet im PDF in der Spalte „Ausführung".
- PDF eines reinen Pauschal-Angebots sieht aus wie das hochgeladene Beispiel: drei Spalten, mehrzeilige Bullet-Beschreibung, Pauschalpreis vertikal zentriert.
- Alte, bereits gespeicherte Angebote/Rechnungen (ohne `modus`) rendern unverändert wie vorher.
