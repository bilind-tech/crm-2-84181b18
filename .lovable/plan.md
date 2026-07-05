## Änderung 1 — Objektname als eigene Zeile in der Empfängeradresse

In der PDF-Adressbox (oben links, Empfänger) wird direkt nach Firma/Person eine zusätzliche Zeile mit dem Objektnamen eingefügt — aber nur, wenn ein Objekt gewählt wurde und `objekt.name` gepflegt ist. Beispiel:

```text
Musterfirma GmbH
Julia Weber
Objekt Nordpark            ← NEU
Schlossstraße 27
70173 Stuttgart
```

Betroffen: Rechnung **und** Angebot (gleiche `kundeAdresse()`-Funktion wird von beiden benutzt).

Dateien:
- `backend/src/pdf/layout.ts` → `kundeAdresse()`: nach der Personen-Zeile `if (o?.name) lines.push(o.name);` einfügen.
- `src/lib/pdf/belegPdf.ts` → gleiche Ergänzung in der dortigen `kundeAdresse()` (Frontend-Preview-Renderer).

Kein Datenmodell-, kein Backend-Route-, kein Formular-Change.

## Änderung 2 — Rechnungs-Einleitungstext auf „Monat Jahr" umstellen

Aktuell steht im Intro entweder das exakte Vertragsdatum (`gemäß unserem Vertrag vom 12.04.2025 …`) oder ein exakter Einsatzzeitraum. Gewünscht ist eine kompakte Monats-/Jahresangabe wie „v. Juni 2026".

Neue Reihenfolge in `defaultIntroRechnung()` (in `backend/src/pdf/layout.ts` **und** `src/lib/pdf/belegPdf.ts` gespiegelt):

1. Wenn der Nutzer einen eigenen Intro-Text gesetzt hat → weiterhin dieser Text.
2. Sonst wird der Monat bestimmt in dieser Reihenfolge:
   - `rechnung.leistungsmonat` (Format `YYYY-MM`, falls gepflegt)
   - sonst der Monat aus `rechnung.rechnungsdatum`
   - sonst leer.
3. Ausgabe:
   - Mit Vertrag + Monat: `gemäß unserem Vertrag »<Bezeichnung>« berechnen wir Ihnen für Juni 2026 folgende Leistungen:` (Vertragsdatum entfällt vollständig).
   - Ohne Vertrag, mit Monat: `hiermit übersenden wir Ihnen die Rechnung v. Juni 2026 für folgende Leistungen:`.
   - Ohne Vertrag, ohne Monat (Fallback): `hiermit übersenden wir Ihnen die Rechnung für folgende Leistungen:`.

Der bisherige „vom TT.MM.JJJJ bis TT.MM.JJJJ"-Einsatzsatz entfällt aus dem Default-Intro — er wurde nur zusätzlich zum Datum genutzt und passt nicht zu „nur Monat".

Deutsche Monatsformatierung wie bisher via `toLocaleDateString("de-DE", { month: "long", year: "numeric", timeZone: "UTC" })`, damit Zeitzonen-Off-by-one ausgeschlossen ist.

## Verifikation

- `bunx tsgo` (Typecheck).
- Vitest `backend/test/pdf.spec.ts` läuft weiter grün (falls Snapshots betroffen sind, aktualisieren).
- Manuelle Sichtprüfung: Rechnung mit Objekt → Objektname erscheint als eigene Zeile; Intro zeigt „v. Juni 2026" statt Tages-Datum.

## Nicht Teil der Änderung

- Kein neues Feld in Formularen.
- Kein Backend-API-Change, keine Migration.
- Angebots-Intro bleibt unverändert (User hat nur Rechnungs-Intro angesprochen).
- Der Editor-Text (eigener Intro/Outro) bleibt unangetastet.
