## Ziel

Alle Dokumente und Ordner aus „Dokumente" werden **1:1 in Google Drive gespiegelt**.  
Was in der lokalen Datenbank passiert (Hochladen, Löschen, Verschieben, Umbenennen, Ordner anlegen/umbenennen/löschen), wird automatisch in Drive nachgezogen — **mit Sicherheits-Garantien**, damit nie versehentlich falsche Dateien oder ganze Ordner verschwinden.  
Jede Datei zeigt ihren Sync-Status (✓ synchronisiert, ⟳ in Arbeit, ⚠ Fehler) und kann manuell neu versucht werden.

---

## Architektur-Entscheidungen

### 1. Drive-Ordnerstruktur

Aktuell nutzt der Worker für Dokumente Datums-Templates (`Dokumente/{YYYY}/{MM}_{MMMM}`). Das **passt nicht** zu User-Ordnern.

Neue Regel:
- Root in Drive bleibt `mycleancenter.cm`
- Darunter ein fester Ordner **`Dokumente`** (statt monatlicher Schemas)
- Innerhalb von `Dokumente` wird die **CRM-Ordnerhierarchie 1:1 abgebildet** (gleiche Namen, gleiche Eltern-Beziehungen)
- Rechnungen / Angebote / Protokolle bleiben **unverändert** in ihren bestehenden Strukturen (`Rechnungen/{YYYY}/…`, `Protokolle/…`) — die Ordner-Spiegelung gilt nur für freie Dokumente
- Gelöschte Ordner werden nicht gelöscht, sondern in **`Dokumente/_Papierkorb/{YYYY-MM-DD}/`** verschoben (umkehrbar)

### 2. Mapping CRM ↔ Drive

Neue Tabelle `dokument_ordner_drive_map` (Migration 035):
```
ordner_id TEXT PRIMARY KEY  -- FK auf dokument_ordner.id
drive_folder_id TEXT NOT NULL
drive_pfad TEXT NOT NULL    -- z. B. "Dokumente/Kunden/ACME/2024"
zuletzt_geprueft_am TEXT
fehler_text TEXT
```
- Root-Mapping (für `ordner_id IS NULL`) wird im `googleDrive.folderCache` als fester Schlüssel `Dokumente` gepflegt
- Beim Anlegen eines Ordners → sofort Eintrag erzeugen + Drive-Ordner erstellen
- Beim Umbenennen / Verschieben → Drive-Ordner `files.update` (parents + name)
- Beim Löschen → Drive-Ordner in Papierkorb-Pfad verschieben, Mapping als `geloescht` markiert behalten (für evtl. Restore)

### 3. Sync-Queue erweitern

Statt nur Datei-Uploads brauchen wir auch **Ordner-Operationen**. Erweiterung von `drive_upload_queue`:

Neue Werte für `beleg_art`: zusätzlich `ordner_create`, `ordner_rename`, `ordner_move`, `ordner_delete`, `dokument_delete`, `dokument_move`.

Migration 036 ergänzt den CHECK-Constraint (gleiches Muster wie 017) und fügt Spalten:
- `op_payload_json TEXT` (Parameter für die Operation: neuer Name, neuer Parent, Ziel-Drive-Ordner, …)

Das **erbt automatisch** Retry-Backoff, Idempotenz, „manuell"-Status, Fehler-Display. Worker bekommt einen `processOrdner`-Zweig.

### 4. Reihenfolge (Konsistenz)

Operationen werden **strikt FIFO pro Ordner-/Datei-ID** abgearbeitet:
- `claimDue` zieht max. 1 Job pro `beleg_id` (kleine Sortier-Anpassung) → kein Race wenn z. B. „Ordner umbenennen" + „Datei verschieben" gleichzeitig anfallen
- Beim Verschieben einer Datei wird vorher sichergestellt, dass der Ziel-Drive-Ordner existiert (sonst eigene `ordner_create`-Job zuerst)

### 5. Sicherheits-Garantien gegen Fehl-Löschungen

**Niemals** `drive.files.delete(folderId)` bei Ordner-Löschung. Stattdessen:
1. **Soft-Move in `_Papierkorb`** mit Timestamp im Namen
2. Erst bei Bestätigung „endgültig löschen" durch User (eigener Button, separater Dialog) wird `drive.files.delete` ausgeführt — **und nur, wenn der Drive-Ordner ausschließlich Dateien enthält, die in der DB ebenfalls als gelöscht markiert sind** (Sicherheits-Check via `files.list`)
3. Bei Datei-Löschung (`dokument_delete`): in den Drive-Trash legen (`trashed=true`), nicht `files.delete`. Drive-Trash hält 30 Tage → Rettungsnetz
4. Bei Cascade-Löschung von CRM-Ordnern: Drive-Ordner wird **als Einheit** in Papierkorb verschoben — keine Pro-Datei-Operationen, kein Risiko von „halb geleert"
5. **Pre-Flight-Check vor jeder destruktiven Operation**: hole `files.get(driveFolderId, fields=trashed,parents,name)`. Wenn der Drive-Ordner unerwartet woanders liegt oder unerwartete Inhalte hat → Job auf Status `manuell` setzen mit Klartext-Fehler, **keine Aktion** ausführen. User entscheidet.

### 6. Per-Datei-Status-UI

Bereits vorhanden: `dokumente.drive_status` (`pending` | `uploaded` | `fehler`). Wird ergänzt um:
- Status-Badge in der Dokument-Liste (Icon: ✓ / ⟳ / ⚠)
- Tooltip mit `drive_fehler`
- Button „Erneut versuchen" pro Zeile → `POST /drive/uploads/{queueId}/retry` (Endpoint existiert teils, wird verlinkt)
- Bei `manuell` zusätzlich Hinweis „Manuelles Eingreifen nötig"

Für Ordner analog: in `OrdnerBaum.tsx` ein kleiner Status-Punkt pro Ordner (aus `dokument_ordner_drive_map.fehler_text` / `zuletzt_geprueft_am`).

### 7. Konsistenz-Check & Backfill

Erweiterung von `backfill.ts`:
- Endpoint `POST /drive/sync/dokumente-full` macht einen **Drift-Check**:
  1. Listet alle CRM-Ordner ohne Drive-Mapping → enqueued `ordner_create`
  2. Listet alle CRM-Dokumente mit `drive_status != 'uploaded'` ODER ohne passende `drive_upload_queue`-Zeile → enqueued Upload
  3. Listet alle Drive-Ordner unter `Dokumente/` und vergleicht mit DB → meldet verwaiste Drive-Ordner (löscht sie **nicht** automatisch, sondern listet sie unter „Inkonsistenzen" in Einstellungen → Google Drive)
- UI-Button „Vollständig synchronisieren" in Einstellungen

---

## Implementierungs-Schritte

1. **Migration 035** — `dokument_ordner_drive_map` (Mapping-Tabelle, Index auf `drive_folder_id`)
2. **Migration 036** — `drive_upload_queue.beleg_art` um Ordner-/Move-/Delete-Ops erweitern + Spalte `op_payload_json`
3. **`backend/src/drive/folders.ts`** — neue Helfer:
   - `ensureDokumenteRoot()` → einmaliger Ordner `mycleancenter.cm/Dokumente`
   - `ensureCrmOrdnerInDrive(ordnerId)` → rekursiv (eigenen + Eltern), schreibt Mapping
   - `moveDriveFolder(driveId, neuerParentDriveId)`, `renameDriveFolder(driveId, name)`
   - `trashDriveFile(fileId)`, `moveDriveFolderToPapierkorb(driveId)`
4. **`backend/src/dokumente/ordner-repo.ts`** — bei `createOrdner / updateOrdner / deleteOrdner / moveDokumente`: zusätzlich Sync-Job enqueuen (eigene Helfer-Funktion `enqueueOrdnerOp(...)`)
5. **`backend/src/dokumente/drive-wireup.ts`** — auf `dokument:erstellt` jetzt mit korrektem `ordnerId` arbeiten; zusätzlich `dokument:verschoben`, `dokument:geloescht` Events abonnieren
6. **`backend/src/dokumente/repo.ts`** — bei Soft-Delete + Move: Event emittieren, das den Sync-Job erzeugt
7. **`backend/src/drive/upload-worker.ts`** — `processOrdnerOp(row)`-Zweig hinzufügen:
   - `ordner_create` → Pfad in Drive erzeugen, Mapping schreiben
   - `ordner_rename` → `files.update({name})`, Mapping `drive_pfad` aktualisieren
   - `ordner_move` → `files.update({addParents, removeParents})`
   - `ordner_delete` → Pre-Flight-Check, dann in Papierkorb-Drive-Ordner verschieben
   - `dokument_delete` → `trashDriveFile`
   - `dokument_move` → `files.update({addParents, removeParents})`
   - `dokument` (Upload) → **vor Upload** sicherstellen, dass `ensureCrmOrdnerInDrive(ordnerId)` erfolgt ist; Ziel-Folder = Mapping (statt Datums-Template)
8. **`backend/src/routes/dokumente.ts`** — neuer Endpoint `POST /drive/sync/dokumente-full` (Backfill/Drift-Check) + `POST /drive/uploads/:id/retry` falls noch nicht da
9. **Frontend**
   - `src/components/dokumente/DokumentListe.tsx` (oder Liste in `dokumente.tsx`): Status-Badge + Retry-Button pro Zeile
   - `src/components/dokumente/OrdnerBaum.tsx`: kleiner Status-Punkt pro Ordner; Tooltip mit Fehler
   - `src/components/settings/GoogleDriveCard.tsx` (vorhanden): Sektion „Dokumente-Synchronisation" mit Button „Vollständig prüfen", Liste der Inkonsistenzen
10. **Tests/Manueller Smoke**
    - Ordner anlegen → erscheint in Drive
    - Umbenennen → in Drive umbenannt
    - Verschieben → in Drive verschoben
    - Datei in Ordner laden → landet im richtigen Drive-Ordner
    - Datei löschen → Drive-Trash
    - Ordner löschen → Drive-Papierkorb-Ordner, Inhalte mitverschoben, nichts hart gelöscht
    - Drive temporär trennen (Token ungültig machen) → Status `manuell`, Klartext-Fehler, Retry-Button funktioniert

---

## Was bleibt unverändert

- Rechnungen, Angebote, Protokolle, Backups → keine Änderung an Drive-Ordnern oder Pfaden
- OAuth-Flow, Folder-Cache, Retry-Backoff
- Soft-Delete-Semantik in der DB (`geloescht_am`)
- **Keine automatischen Mails** (steht außer Frage, Memory)

---

## Offene Frage

Soll der Drive-Ordner `Dokumente/_Papierkorb/...` für gelöschte Ordner **automatisch nach 30 Tagen** endgültig gelöscht werden (entsprechend Drive-Trash-Logik), oder bleibt er bestehen, bis du ihn manuell aufräumst?