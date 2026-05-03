## Ziel

Aktuell legt jeder Klick auf "Übergabe"/"Schlüssel" (Plus-Buttons in `/protokolle`) sowie das Öffnen von `/werkzeuge/uebergabeprotokoll` bzw. `/werkzeuge/schluesseluebergabe` **sofort einen leeren Datensatz** im Backend an. Das soll nicht mehr passieren. Stattdessen soll – wie bei Angeboten/Rechnungen – zuerst ein Formular (SlideOver) erscheinen, in dem Kunde, Objekt, Datum und Basis-Daten erfasst werden. Erst beim Klick auf „Anlegen" wird das Protokoll erstellt und der Editor geöffnet.

## Umsetzung

### 1. Neue Form-Komponenten (analog zu `AngebotForm`)

`src/components/forms/UebergabeProtokollForm.tsx`
- Felder: Kunde (Pflicht), Objekt (gefiltert nach Kunde, optional), Ansprechpartner (optional), Datum (default heute), Art (Übergabe / Abnahme / Beides), Leistungsumfang (Textarea, default aus Einstellungen), Bemerkungen.
- Vorschau-Nummer (über `useNummernkreise` + `vorschauBelegnummer` mit Präfix `PR`).
- Submit ruft `useCreateProtokoll` mit allen Daten und navigiert zu `/protokolle/$id/bearbeiten`.

`src/components/forms/SchluesselProtokollForm.tsx`
- Felder: Kunde (Pflicht), Objekt (optional), Ansprechpartner (optional), Datum, Richtung (Ausgabe / Rücknahme), Pfand (€), Schlüssel-Tabelle (Bezeichnung, Anzahl, Nr., Bemerkung – mind. eine Zeile, hinzufügen/entfernen).
- Vorschau-Nummer mit Präfix `SU`.
- Submit + Navigation analog.

Beide Formulare verwenden dieselben UI-Bausteine wie `AngebotForm` (Label, Input, Select, DateInput, PrimaryAction, Toast-Validierung).

### 2. Liste `/protokolle` anpassen (`src/routes/protokolle.tsx`)

- Plus-Buttons öffnen nicht mehr direkt `create.mutateAsync`, sondern setzen einen lokalen State `openForm: null | "uebergabe" | "schluessel"`.
- Zwei `SlideOver` (wie bei Angeboten):
  - Titel "Neues Übergabe-/Abnahmeprotokoll" → rendert `UebergabeProtokollForm`.
  - Titel "Neue Schlüsselübergabe" → rendert `SchluesselProtokollForm`.
- `useCreateProtokoll` wird nur noch innerhalb der Forms aufgerufen.

### 3. Werkzeug-Routen wieder als Einstiegsseiten

`src/routes/werkzeuge.uebergabeprotokoll.tsx` und `werkzeuge.schluesseluebergabe.tsx`:
- Kein Auto-Create mehr.
- Stattdessen kleine Landing-Seite mit Beschreibung („Erfasse ein Übergabe-/Abnahmeprotokoll. Wird live gespeichert und im Bereich Protokolle archiviert.") und einem `PrimaryAction`-Button „Neues Protokoll erstellen", der dasselbe Form-SlideOver öffnet (gleiche Komponente wiederverwenden).
- Optional: Liste der letzten 5 Protokolle dieser Art mit Link zum Editor (verbessert UX, ohne Pflicht).

### 4. Backend-Hook unverändert

`useCreateProtokoll` akzeptiert bereits `Partial<Protokoll>`, daher reichen die Forms ohne Backend-Änderung. Lediglich sicherstellen, dass übermittelte Felder (`kundeId`, `objektId`, `ansprechpartnerId`, `datum`, `art`/`richtung`, `leistungsumfang`, `bemerkungen`, `schluessel`, `pfandEur`) im Mock-Backend (`backend.ts` Zeilen 1948–1967) korrekt durchgereicht werden – aktuell nur teilweise. Falls nötig: Spread `...p` so erweitern, dass sämtliche Form-Felder ankommen statt durch Defaults überschrieben zu werden.

### 5. Kein Verhalten geändert für

- Editor `/protokolle/$id/bearbeiten` (Live-Vorschau, Autosave, Abschließen → PDF in Dokumente) bleibt 1:1.
- Detailseite `/protokolle/$id` bleibt.
- Kein automatischer Mailversand.

## Ergebnis

- Klick auf Plus oder auf eine Werkzeug-Kachel öffnet **nur** ein Formular.
- Es entsteht **kein leerer Datensatz** mehr.
- Erst „Anlegen" erzeugt das Protokoll mit Kundenbezug und öffnet den Live-Editor – exakt wie bei Angebot/Rechnung.
