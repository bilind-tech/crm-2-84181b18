## Ziel

PDF-Layout für Rechnungen (und Angebote/Protokolle, wo sinnvoll) verbessern und ein neues Feld „Leistungsmonat" für Rechnungen einführen.

## 1. Empfänger-Adressblock (Rechnung, Angebot, Protokoll)

**Soll-Zustand**:
```
Firmenname Mustermann GmbH
Max Mustermann               ← Ansprechpartner (oder Vor-/Nachname Kunde)
Musterstraße 12              ← Adresse
53757 Sankt Augustin         ← PLZ + Ort
```

**Beobachtung**: Der Code in `kundeAdresse()` baut diese Zeilen bereits korrekt (sowohl in `src/lib/pdf/belegPdf.ts` als auch in `backend/src/pdf/layout.ts`). Wenn Adresse/PLZ/Ort aktuell fehlen, kommt das fast sicher daher, dass diese Felder am **Kunden-Datensatz** leer sind und stattdessen am **Objekt** stehen.

**Fix**:
- Fallback einbauen: wenn `kunde.strasse` / `plz` / `ort` leer sind und ein `objektId` am Beleg hängt, Adresse aus dem Objekt ziehen (Frontend-Generator + Backend-Layout).
- Bei Protokollen analog dafür sorgen, dass der gleiche 4-Zeilen-Block (Firma, Ansprechpartner, Strasse, PLZ Ort) im Empfänger steht (`src/lib/pdf/werkzeugePdf.ts`).

## 2. Leistungsmonat für Rechnungen

**Neues optionales Feld** `leistungsmonat` (Format `YYYY-MM`, z. B. `2026-04`).

**Backend**:
- Migration `034_rechnung_leistungsmonat.sql`: `ALTER TABLE rechnungen ADD COLUMN leistungsmonat TEXT NULL`.
- Schema/Validation/Mapper in `backend/src/belege/` erweitern (create + update).

**Frontend `RechnungForm`**:
- Neuer Select „Leistungsmonat" mit Optionen aus den letzten 6 + nächsten 2 Monaten + „Kein Monat".
- Default: aktueller Monat.
- Wird in `useCreateRechnung` mitgeschickt.

**PDF-Intro (sowohl Frontend `belegPdf.ts` als auch Backend `layout.ts`)**:
- `defaultIntroRechnung(r)` so erweitern: wenn `r.leistungsmonat` gesetzt → `„hiermit übersenden wir Ihnen die Rechnung v. April 2026 für folgende Leistungen:"` (Monat lokalisiert via `toLocaleDateString("de-DE", { month: "long", year: "numeric" })`).
- Ohne Leistungsmonat bleibt der bisherige Satz.
- Custom `introText` / `eigenesIntro` überschreibt weiterhin.

## 3. Signatur „Mit freundlichen Grüßen"

Aktuell wird der Geschäftsführer-Name und „Geschäftsführer" in `COLOR_MUTED` (`#555555`) gerendert.

**Fix** in `belegPdf.ts` + `layout.ts`: beide Zeilen auf `COLOR_TEXT` (`#000000`) umstellen.

## 4. Footer-Ausrichtung

Aktueller 4-spaltiger Footer (Firma | Bank | Telefon/Email | Handelsregister) ist komplett linksbündig.

**Fix**: Die zwei mittleren Spalten (Bank + Telefon/Email) bekommen `alignment: "center"`; die zwei äußeren Spalten bleiben linksbündig. Wird in beiden `footer()`-Funktionen (Frontend + Backend) gesetzt.

## Geänderte Dateien (Übersicht)

- `backend/src/db/migrations/034_rechnung_leistungsmonat.sql` *(neu)*
- `backend/src/belege/types.ts`, `validation.ts`, `mappers.ts`, `rechnungen-repo.ts`
- `backend/src/pdf/layout.ts` — Adresse mit Objekt-Fallback, Intro mit Leistungsmonat, Signatur-Farbe, Footer-Ausrichtung
- `src/lib/api/types.ts`, `src/lib/api/adapters.ts` — Feld `leistungsmonat`
- `src/components/forms/RechnungForm.tsx` — Monats-Select
- `src/lib/pdf/belegPdf.ts` — gleiche 4 PDF-Änderungen wie Backend
- `src/lib/pdf/werkzeugePdf.ts` — Protokoll-Empfängerblock (Strasse + PLZ/Ort)

## Offene Frage

Soll der Leistungsmonat-Select **Pflicht** sein (jede Rechnung muss einen Monat haben) oder **optional** (Default „—", Satz erscheint dann ohne Monat)?
