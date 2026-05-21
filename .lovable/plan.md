
# Ordner für Dokumente

Ziel: Auf `/dokumente` echte Ordner — verschachtelbar, mit Anlegen / Umbenennen / Verschieben / Löschen, und beim Datei-Upload eine Pflicht-Auswahl „in welchen Ordner?". Funktioniert auf Desktop und Mobil, hält sich an die Single-User- und Daten-strikt-getrennt-Regeln, und respektiert die Drive-Spiegelung sowie Soft-Delete.

## Was der Nutzer sieht

### Übersichtsseite `/dokumente`
- Neuer Bereich oben: **Ordnerpfad als Breadcrumb** (`Alle Dokumente › Steuer › 2026`) + Buttons „Neuer Ordner" und „Ordner umbenennen" (nur wenn nicht Root).
- Linke Spalte auf Desktop (`sm:`): **Ordnerbaum** (klappbar, mit Anzahl Dokumente). Auf Mobil stattdessen ein horizontaler Chip-Streifen + Sheet „Ordner wählen".
- Tabelle/Karten: zeigen nur Dokumente + direkte Unterordner des aktuellen Ordners. Ordner-Zeile mit Klapp-Icon, Klick navigiert hinein.
- Bestehende Filter (Tabs, Suche, Kunde, Objekt) bleiben; sie filtern **innerhalb** des gewählten Ordners. Zusätzlich Tab „Alle (rekursiv)" der den Ordner-Filter aufhebt — damit nichts verloren geht.
- Drag-&-Drop: Dokument-Zeile/Karte auf einen Ordner im Baum oder Breadcrumb ziehen verschiebt.
- Pro Dokument im Kontextmenü (3-Punkte): „Verschieben nach…" (öffnet Ordner-Picker-Sheet), „In neuen Ordner verschieben…", „Löschen" (wie bisher).
- Pro Ordner im Kontextmenü: „Umbenennen", „Verschieben nach…", „Löschen". Beim Löschen eines nicht-leeren Ordners erscheint ein Bestätigungsdialog mit zwei Optionen: **Inhalte in den Eltern-Ordner verschieben** (Standard) oder **Inhalte mitlöschen** (Soft-Delete, wie bisher).

### Upload-Flow
- `DokumentUploadPanel`: neue Pflicht-Auswahl **Ordner** (Default = aktuell sichtbarer Ordner, falls vorhanden, sonst „Allgemein").
  - Wenn auf `/dokumente` mit aktivem Ordner: Voreinstellung = dieser Ordner, geräuschlos.
  - Wenn Stapel ohne Ordner gestartet wird (z. B. via Global-DropZone): Sheet „In welchen Ordner?" vor dem Upload, mit Liste + „+ Neuer Ordner".
- Wenn an Kunde/Objekt-Detail hochgeladen wird (`kundeId`/`objektId` gesetzt): Ordner-Auswahl bleibt sichtbar, Default = „Kunde: <Name>" wenn ein Auto-Ordner existiert, sonst „Allgemein". Kein Zwang, einen Kunden-Ordner anzulegen.
- Handy-Scan-Sessions tragen den Ziel-Ordner im Session-Token; das Handy lädt direkt dort hoch.

### Globaler Drop
- `GlobalDropZone` zeigt vor dem Upload ein kleines „Ordner wählen"-Sheet (gleiche Komponente wie oben).

## Datenmodell (Backend, SQLite)

Neue Migration `034_dokument_ordner.sql`:

```text
CREATE TABLE dokument_ordner (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  parent_id     TEXT REFERENCES dokument_ordner(id) ON DELETE RESTRICT,
  erstellt_am   TEXT NOT NULL DEFAULT (datetime('now')),
  geloescht_am  TEXT,
  UNIQUE (parent_id, name) -- Geschwister müssen eindeutig sein
);
CREATE INDEX ix_ordner_parent ON dokument_ordner(parent_id) WHERE geloescht_am IS NULL;

ALTER TABLE dokumente ADD COLUMN ordner_id TEXT REFERENCES dokument_ordner(id) ON DELETE SET NULL;
CREATE INDEX ix_dok_ordner ON dokumente(ordner_id) WHERE geloescht_am IS NULL;
```

- Root = `ordner_id IS NULL` („Alle Dokumente" / Posteingang).
- Soft-Delete via `geloescht_am`, konsistent mit Step 27. Hartes Löschen + Datei-Cleanup nur über bestehende `/datenbank/...hart-loeschen`-Route (kein Sonderweg).
- Move-Operation prüft Zyklen (kein Ordner unter sich selbst).

## Backend-Routen (`backend/src/dokumente/ordner.ts` + Erweiterung in `routes/`)

| Methode + Pfad | Zweck |
|---|---|
| `GET /dokumente/ordner` | Baum (id, name, parentId, anzahl, kindAnzahl) — eine Query, im Server zu Baum geformt |
| `POST /dokumente/ordner` | `{ name, parentId? }` — anlegen |
| `PATCH /dokumente/ordner/:id` | `{ name?, parentId? }` — umbenennen / verschieben, mit Zyklus-Check |
| `DELETE /dokumente/ordner/:id?mode=move-to-parent\|cascade` | Standard `move-to-parent`; `cascade` soft-löscht Inhalte rekursiv |
| `PATCH /dokumente/:id` | bestehend, akzeptiert zusätzlich `ordnerId` |
| `POST /dokumente/bulk-move` | `{ ids: string[], ordnerId: string\|null }` für Mehrfach-Verschieben |
| `GET /dokumente` | bekommt `?ordnerId=` (mit `?recursive=1` rekursiv) |

Alle Routen via `requireAuth` (Single-User). Validierung via Zod (Namen `1..80` Zeichen, Whitelist `[\w \-/().&]`).

## Drive-Spiegelung
- Aktive Regel bleibt: PDFs (Rechnung/Angebot) laufen in den festen `Rechnungen/{YYYY}/{MM}` bzw. `Angebote/...` Pfad — **nicht** in Nutzer-Ordner. Diese Logik wird vom neuen Modul nicht angefasst.
- Frei hochgeladene Dokumente (Quelle `upload`/`drag-drop`/`handy-scan`) werden, sobald Drive verbunden ist, unter `mycleancenter.cm/Dokumente/<Ordnerpfad>/` gespiegelt. Ordner werden in Drive über das vorhandene `ensureFolderPath` angelegt.
- Verschieben in der App → asynchroner Drive-Move (wenn `drive_file_id` gesetzt); Fehlschlag setzt nur `drive_status="fehler"`, blockiert App-Aktion nicht.

## Frontend-Aufbau

Neue Dateien:
- `src/lib/dokumente/ordnerApi.ts` — fetch-Wrapper für die Routen.
- `src/hooks/useDokumentOrdner.ts` — `useQuery(["dokumente","ordner"])` + Mutationen.
- `src/components/dokumente/OrdnerBaum.tsx` — Desktop-Sidebar, klappbar, Drop-Target.
- `src/components/dokumente/OrdnerBreadcrumb.tsx`.
- `src/components/dokumente/OrdnerPickerSheet.tsx` — wiederverwendet in Upload + „Verschieben nach…".
- `src/components/dokumente/OrdnerLoeschenDialog.tsx` — 2-Stufen-Bestätigung (move-to-parent / cascade).
- `src/components/dokumente/NeuerOrdnerDialog.tsx`.

Änderungen in:
- `src/routes/dokumente.tsx` — Layout mit Sidebar/Breadcrumb, neuer Route-Param `?ordner=<id>` (validateSearch), Drop-Handler.
- `src/components/dokumente/DokumentUploadPanel.tsx` — Bulk-Meta bekommt Pflichtfeld `ordnerId`, Picker mit „+ Neuer Ordner".
- `src/components/dokumente/GlobalDropZone.tsx` — vorgeschaltetes Picker-Sheet.
- `src/components/dokumente/DokumentViewer.tsx` + `DokumentBearbeitenDialog.tsx` — Anzeige „Ordner: …" + Verschieben-Button.
- `src/lib/api/types.ts` + `src/lib/api/adapters.ts` — `ordnerId` an `Dokument`, neue Typen `DokumentOrdner`.
- `src/lib/mock/backend.ts` (falls verwendet) — Mock-Ordner für Preview.

## Migration bestehender Daten
- Migration legt keinen Default-Ordner an. Alle bisherigen Dokumente bleiben mit `ordner_id = NULL` und erscheinen unter „Alle Dokumente" — kein Datenverlust, kein Verschieben ohne Zustimmung.

## Tests
- `backend/test/dokumente-ordner.spec.ts`: CRUD, Zyklus-Verhinderung, Unique-Name pro Parent, Delete-Modi, Bulk-Move, recursive Listing.
- Erweiterung `backend/test/dokumente.spec.ts`: Upload mit `ordnerId`, Filter nach Ordner.
- Frontend-Smoke: Liste rendert mit/ohne Ordner, Upload-Pflichtfeld blockiert Submit.

## Reihenfolge der Implementierung
1. Migration + Backend-Repo + Routen + Tests.
2. Frontend-Hooks + Typen.
3. Übersichtsseite (Sidebar + Breadcrumb + Listenfilter).
4. Upload-Panel + GlobalDropZone Picker.
5. Verschieben (Kontextmenü + Drag) + Löschen-Dialog.
6. Drive-Spiegelung für freie Uploads + Move-Sync.
7. Memory aktualisieren (`mem/features/dokumente.md` + Index-Eintrag).

## Was bewusst NICHT in diesem Schritt steckt
- Keine Berechtigungen pro Ordner (Single-User).
- Keine Tag-/Smart-Folder-Logik — nur klassische Ordner.
- Keine Mehrfach-Auswahl-Toolbar; Bulk-Move-Endpoint existiert, UI dafür kommt später.
- Kein automatisches Sortieren nach Kunde/Jahr — Nutzer entscheidet selbst.
