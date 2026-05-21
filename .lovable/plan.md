## Ziel

In Angebot- und Rechnungsformularen:

1. Das Feld **„Ausführung"** in jeder Position entfernen — es ist redundant, weil bei Dauerauftrag die Frequenz/Ausführung bereits dort konfiguriert wird.
2. Stattdessen auf **Beleg-Ebene** ein optionales **Einsatzdatum / -zeitraum** anbieten, das **nur sichtbar ist, wenn kein Dauerauftrag aktiv ist** (z. B. einmalige Reinigung am 12.06.2026 oder vom 12.–14.06.2026).
3. **Auto-Formatierung** in der Leistungsbeschreibung komplett abschalten: kein automatischer `• `-Bullet nach Enter, kein Tab→2 Leerzeichen, kein Bullet-Fortsetzen. Formatierung ausschließlich manuell über die Toolbar (B / I / U / Liste-Button bleiben).

## Frontend

### `src/components/forms/LeistungsBeschreibung.tsx`
- `handleKeyDown` entkernen: Enter-Sonderlogik (Bullet-Fortsetzung) und Tab→2-Spaces komplett entfernen.
- Markdown-Wrap-Shortcuts (Cmd/Ctrl+B/I/U) bleiben.
- Bullet-Button in der Toolbar bleibt (manuelles Einfügen via `bulletEinfuegen`).

### `src/components/forms/PositionenEditor.tsx`
- Feld „Ausführung (optional, …)" inkl. Label, Input und Hilfstext im Pauschal-Modus entfernen.
- `PositionDraft.ausfuehrung`, `emptyPosition().ausfuehrung`, `defaultAusfuehrung`-Prop, `add(modus)`-Vorbelegung, `toApiPositionen`/`fromApiPosition`-Mapping entfernen.
- Hinweistext „Tipp: Enter nach … setzt automatisch …" entfernen (passt nicht mehr).

### `src/components/forms/RechnungForm.tsx` und `AngebotForm.tsx`
- `defaultAusfuehrung={…formatWiederkehrend(…)}`-Prop am `PositionenEditor` entfernen.
- Neuen Block **„Einsatztermin"** einbauen (nur wenn `!dauerauftragAktiv`):
  - Zwei Date-Inputs: `einsatzVon` (Pflicht im Block) und `einsatzBis` (optional; wenn leer ⇒ ein-Tages-Einsatz).
  - Default: `einsatzVon = heute`, `einsatzBis = leer`.
  - Hinweistext: „Lass leer, wenn der Termin noch offen ist."
- Beim Submit `einsatzVon`/`einsatzBis` als ISO-Datum mitsenden; bei Dauerauftrag immer `null`/weglassen.

### `src/routes/angebote.$id.tsx` und `rechnungen.$id.tsx`
- Anzeige `{p.ausfuehrung && <span>{p.ausfuehrung} · </span>}` entfernen.
- Einsatzdatum/-zeitraum im Detail anzeigen (z. B. „Einsatz: 12.06.2026" oder „Einsatz: 12.–14.06.2026"), wenn gesetzt.

### `src/lib/api/types.ts`
- `Position.ausfuehrung` als deprecated markieren (im Type-Layer entfernen, sobald Backend mitzieht — siehe unten).
- Auf `Angebot` und `Rechnung`: `einsatzVon?: string` (ISO), `einsatzBis?: string | null` ergänzen.

## Backend

### Migration `037_beleg_einsatztermin.sql`
- `ALTER TABLE angebot ADD COLUMN einsatz_von TEXT, ADD COLUMN einsatz_bis TEXT;`
- `ALTER TABLE rechnung ADD COLUMN einsatz_von TEXT, ADD COLUMN einsatz_bis TEXT;`
- Format `YYYY-MM-DD`, beide nullable.

### Repos & Mapper (`backend/src/belege/`)
- `angebote-repo.ts`, `rechnungen-repo.ts`: `einsatz_von`/`einsatz_bis` lesen/schreiben.
- `mappers.ts`: `einsatzVon`/`einsatzBis` ins API-DTO mappen.
- `validation.ts`: optionales `einsatzVon` (`YYYY-MM-DD`), `einsatzBis` ≥ `einsatzVon`, beide nur erlaubt wenn `!dauerauftrag`.

### `backend/src/belege/positionen.ts` und `umwandeln.ts`
- `ausfuehrung`-Spalte/-Feld **vorerst beibehalten** (Bestandsdaten), aber beim Insert nicht mehr aus dem Frontend übernehmen — immer `null` setzen.
- Folge-Migration (separat, später) kann die Spalte droppen, sobald Bestand migriert ist.

### PDF (`backend/src/pdf/layout.ts` + `src/lib/pdf/belegPdf.ts`)
- Position-Zeile: `p.ausfuehrung`-Fallback in `formatModus` entfernen.
- Intro-Text um Einsatztermin erweitern, wenn gesetzt: „… für die Reinigung am 12.06.2026" / „… vom 12.06.2026 bis 14.06.2026". Bei Dauerauftrag unverändert.

## Open Question

Soll der Einsatztermin auch in die **PDF-Kopfzeile** (z. B. unter „Rechnungsdatum") als eigene Zeile „Einsatz: 12.06.2026" gerendert werden, oder reicht die Erwähnung im Intro-Text?

## Out of Scope

- Per-Position-Einsatzdaten (z. B. Position A am Tag 1, Position B am Tag 2) — wäre Overkill.
- Drop der `ausfuehrung`-Spalte in der DB (separate Aufräum-Migration).
- Änderungen am Protokoll-PDF.
