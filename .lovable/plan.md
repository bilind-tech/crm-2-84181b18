# Verträge pro Kunde + Vertragsbezug auf Rechnung

Feature: jeder Kunde kann **mehrere Verträge** haben (Bezeichnung + Startdatum, optional Enddatum + Notiz). Beim Rechnungs­erstellen wird abgefragt, welcher Vertrag verwendet wird (oder „ohne"). Auf der PDF erscheint dann **oberhalb der Positionstabelle** ein professioneller Einleitungssatz, der Vertrag + Datum nennt.

Kein Datei-Upload, nur Stammdaten.

## Datenmodell (SQLite)

Neue Migration `039_kunde_vertrag.sql`:

```sql
CREATE TABLE kunde_vertrag (
  id            TEXT PRIMARY KEY,
  kunde_id      TEXT NOT NULL REFERENCES kunde(id) ON DELETE CASCADE,
  bezeichnung   TEXT NOT NULL DEFAULT '',   -- z.B. "Unterhaltsreinigung"
  start_datum   TEXT NOT NULL,              -- ISO YYYY-MM-DD
  end_datum     TEXT,                       -- optional
  notiz         TEXT,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geaendert_am  TEXT NOT NULL DEFAULT (datetime('now')),
  geloescht_am  TEXT
);
CREATE INDEX idx_kunde_vertrag_kunde ON kunde_vertrag(kunde_id) WHERE geloescht_am IS NULL;

ALTER TABLE rechnung ADD COLUMN vertrag_id TEXT
  REFERENCES kunde_vertrag(id) ON DELETE SET NULL;
```

Soft-Delete wie überall im System. Beim Löschen eines Vertrags: bestehende Rechnungen behalten ihren denormalisierten Intro-Text (wird beim Erstellen einmal gerendert oder live aus `vertrag_id` gelesen — siehe „PDF-Intro" unten).

## Backend

**Neu** `backend/src/kunden/vertraege-repo.ts`: `listVertraege(kundeId)`, `createVertrag`, `updateVertrag`, `softDeleteVertrag`, `getVertrag`.

**Routen** (`stammdaten.ts`, alle unter `requireAuth`):
- `GET    /kunden/:id/vertraege` → Liste (aktive zuerst, dann archivierte)
- `POST   /kunden/:id/vertraege` `{ bezeichnung, startDatum, endDatum?, notiz? }`
- `PATCH  /vertraege/:id`
- `DELETE /vertraege/:id` (soft)
- Validation per Zod, `startDatum` Pflicht (ISO), Bezeichnung max 120.

**Rechnung erweitern** (`belege/rechnungen-repo.ts` + `mappers.ts` + `routes/belege.ts`):
- `RechnungWrite.vertragId?: string | null`
- INSERT/UPDATE-Spalte `vertrag_id` mit Owner-Check (Vertrag gehört zum gleichen Kunden — sonst 422).
- `RECHNUNG_UPDATABLE.vertragId = "vertrag_id"`.
- `ApiRechnung.vertragId?` + im Mapping zurückgeben.
- Endpoint `GET /rechnungen/:id` liefert optional auch eingebettetes `vertrag` (für PDF) — pragmatisch: `vertragId` reicht, PDF lädt nach.

**PDF-Intro** (`backend/src/pdf/layout.ts` → `defaultIntroRechnung` und Pendant `src/lib/pdf/belegPdf.ts`):
Neue Prioritätsreihenfolge:
1. Manuell gesetzter `introText` → unverändert.
2. **Vertrag vorhanden** → professioneller Satz, z. B.:
   - mit Bezeichnung: `„Gemäß unserem Vertrag »{bezeichnung}« vom {DD.MM.YYYY} berechnen wir Ihnen folgende Leistungen:"`
   - ohne Bezeichnung: `„Gemäß unserem Vertrag vom {DD.MM.YYYY} berechnen wir Ihnen folgende Leistungen:"`
   - Zusatz Leistungsmonat anhängen wenn gesetzt: `„… für {Monat YYYY}."`
3. Sonst: bestehende Logik (Einsatz / Leistungsmonat / Default).

`belege/pdf-data.ts` / `pdf/cache.ts`: Vertrag (Bezeichnung + Startdatum) als Teil der Cache-Signatur, damit Änderungen am Vertrag PDFs invalidieren.

## Frontend

**Hooks** (`src/hooks/useApi.ts`):
- `useVertraege(kundeId)`, `useCreateVertrag`, `useUpdateVertrag`, `useDeleteVertrag` (invalidiert `qk.kunden` + `["pdf"]`).
- `qk.vertraege = (kundeId) => [...]`.

**Verwaltung (= „die Einstellungen des Kunden")**

Neue Komponente `src/components/kunden/VertraegeTab.tsx`:
- Tabelle/Liste der Verträge: Bezeichnung · Startdatum · (Enddatum) · Aktionen (Bearbeiten/Löschen).
- Inline „Neuer Vertrag"-Form (Bezeichnung, Start, End, Notiz) via `DateInput`.
- Eingebunden:
  - `KundeBearbeitenDialog`: neuer Tab „Verträge" neben „Stammdaten" und „Belegnummern".
  - `src/routes/kunden.$id.tsx`: Card „Verträge" unterhalb der Stammdaten.
- Kein globaler Einstellungen-Tab (Verträge sind kundenspezifisch). Falls du globale Vertrags­vorlagen willst, separat sagen.

**Rechnungs-Erstellung** (`src/components/forms/RechnungForm.tsx`):
- Nach Kundenwahl: `useVertraege(kundeId)`.
- 0 Verträge → kein Block.
- 1 Vertrag → kleiner Auswahl-Block:
  - Toggle „Diese Rechnung auf Basis des Vertrags «{Bezeichnung}» vom {DD.MM.YYYY}" (Default an).
  - Wenn aus: `vertragId = null`.
- ≥2 Verträge → Select „Bezug zu Vertrag" mit Optionen aller Verträge + Eintrag „Ohne Vertragsbezug" (Default = neuester Vertrag).
- Live-Vorschau des Intro-Satzes unter dem Auswahlblock.
- `vertragId` wird in `create.mutateAsync` mitgeschickt.

**Rechnung bearbeiten** (`src/routes/rechnungen.$id.bearbeiten.tsx` + Hotspot-Editor): zusätzlicher Picker für `vertragId` (gleiche Logik), Autosave wie gewohnt.

**Detailansicht** Rechnung: kleines Badge „Vertrag: {Bezeichnung} vom {Datum}" unterhalb der Kopfdaten (rein informativ).

## Was NICHT geändert wird

- Angebote bleiben unberührt (User sprach explizit von Rechnung). Wenn gewünscht später analog.
- Kein Datei-Upload, kein Vertragsdokument.
- Keine Auto-Mails, kein Status-Lifecycle für Verträge.
- Bestehende Belege ohne `vertrag_id` rendern wie bisher (Backwards-kompatibel).

## Tests

- `backend/test/vertraege.spec.ts` (neu): CRUD, Owner-Check (Vertrag eines anderen Kunden darf nicht an Rechnung gebunden werden → 422), Soft-Delete.
- `backend/test/belege.spec.ts` ergänzen: Rechnung mit Vertrag → PDF-Intro enthält Vertrag + Datum. Ohne Vertrag → bisheriges Verhalten.

## Dateien (Übersicht)

Neu:
- `backend/src/db/migrations/039_kunde_vertrag.sql`
- `backend/src/kunden/vertraege-repo.ts`
- `src/components/kunden/VertraegeTab.tsx`
- `backend/test/vertraege.spec.ts`

Geändert:
- `backend/src/routes/stammdaten.ts` (neue Routen)
- `backend/src/routes/belege.ts` (Validation `vertragId`)
- `backend/src/belege/rechnungen-repo.ts` (INSERT/UPDATE/Validierung)
- `backend/src/belege/mappers.ts` (`vertragId` in DTO)
- `backend/src/pdf/layout.ts` + `backend/src/pdf/cache.ts` (Intro-Logik + Cache-Sig)
- `src/lib/pdf/belegPdf.ts` (Client-PDF spiegelt Logik)
- `src/lib/api/types.ts` (`Vertrag`, `Rechnung.vertragId`)
- `src/hooks/useApi.ts` (neue Hooks, Cache-Invalidation)
- `src/components/forms/RechnungForm.tsx` (Auswahlblock)
- `src/routes/rechnungen.$id.bearbeiten.tsx` (Vertrags-Picker)
- `src/routes/rechnungen.$id.tsx` (Badge)
- `src/components/forms/KundeBearbeitenDialog.tsx` (Tab „Verträge")
- `src/routes/kunden.$id.tsx` (Card „Verträge")
