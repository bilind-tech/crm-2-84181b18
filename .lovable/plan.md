# Plan: Drive-Sync Folge-Runde abschließen

Stand nach Code-Check:
- Backend-Mapping `dokument_ordner_drive_map`, Queue-Ops und Worker sind da (Mig. 035/036, `ordner-drive-map-repo.ts`, `upload-worker.ts`).
- Drift-Check-Route `/drive/sync/dokumente-full` existiert noch **nicht** (`backend/src/routes/drive.ts`).
- `DriveSyncBadge` zeigt Status („synced / pending / error"), aber **kein Retry-Button** in den Listen (`src/routes/dokumente.tsx`, ebenso Rechnungen/Angebote, wo der Badge nicht eingebunden ist).
- `OrdnerBaum.tsx` zeigt **keinen Drive-Status-Punkt** pro Ordnerzeile.

Es sind also alle drei offenen Punkte noch zu bauen.

---

## 1) Backend — Drift-Check Route `POST /drive/sync/dokumente-full`

Zweck: alle CRM-Ordner & Dokumente gegen Drive abgleichen, fehlende Mappings/Uploads/Verschiebungen als Queue-Ops nachziehen. Idempotent, sicher (nur additiv, **niemals** lokal löschen).

**Datei:** `backend/src/drive/drift-check.ts` (neu) + Route in `backend/src/routes/drive.ts`.

**Schritte des Drift-Checks:**
1. `loadDriveSettings()` — wenn nicht verbunden → 409 wie bei `/drive/backfill`.
2. `ensureRootFolder()` aufrufen, dann `Dokumente/`-Stamm sicherstellen.
3. **Ordner:** `listOrdner()` aus DB → für jeden Ordner ohne Eintrag in `dokument_ordner_drive_map` (oder mit `fehler_text`) → `enqueue({ belegArt: "ordner_create", op_payload_json: { ordnerId, parentId } })`. Hierarchie depth-first, Parent zuerst.
4. **Verschobene Ordner:** Map vorhanden, aber `parentId` weicht vom letzten bekannten Drive-Pfad ab → `enqueue("ordner_move")`.
5. **Dokumente:** `listDokumente({limit: 5000})` → für jedes Dokument ohne `drive.fileId` oder mit `drive.error` → `backfillOne("dokument", id)`; wenn `ordnerId` sich gegenüber Drive-Lage geändert hat → `enqueue("dokument_move")`.
6. Rückgabe: `{ ok: true, ordnerNeu, ordnerVerschoben, dokumenteNeu, dokumenteVerschoben, fehler }`.
7. Am Ende `tickDriveQueue(20)` anstoßen.

**Sicherheit (Memory-Regel „nichts löschen"):**
- Drift-Check enqueued **nur** `*_create` / `*_move` / Upload-Ops. Niemals `*_delete`.
- Keine DB-Mutation außerhalb der bestehenden Repo-Funktionen.
- Vorher: kein Backup nötig (read-only auf Daten-Verzeichnis), aber Test im `backend/test/`-Set abdecken.

---

## 2) Frontend — Retry-Button in der Dokumente-Liste

`src/components/dokumente/DriveSyncBadge.tsx` um optionalen `onRetry`-Hook erweitern; bei `state === "error"` einen kleinen Icon-Button (RefreshCw) neben dem Badge anzeigen.

Neuer Hook `useDriveRetry()` in `src/hooks/useApi.ts` (oder neu `src/hooks/useDriveSync.ts`):
```
POST /drive/uploads/enqueue  { belegArt: "dokument", belegId }
```
(existiert bereits im Backend) → bei Erfolg Query `dokumente` invalidieren.

Einbindung:
- `src/routes/dokumente.tsx` — beide Stellen (Listen-Item Zeile 378 und 517): `<DriveSyncBadge dokument={d} onRetry={() => retry(d.id)} />`.
- Toast bei Erfolg/Fehler.

**Bewusst nicht** in Rechnungen-/Angebote-Liste einbauen (separater Strang — der Drive-Status für Belege wird derzeit nur im Detail/Editor angezeigt; bleibt unverändert, um Scope klein zu halten).

---

## 3) Frontend — Ordner-Status-Punkt im `OrdnerBaum`

Neue API: Backend-Endpoint `GET /drive/ordner/status` liefert pro Ordner-Id Status aus `dokument_ordner_drive_map`:
```
{ ordnerId: { status: "synced"|"pending"|"error"|"none", error?: string, syncedAt?: string } }
```
Implementierung in `backend/src/routes/drive.ts` mit `listAll()` aus `ordner-drive-map-repo.ts`.

Frontend:
- Neuer Hook `useOrdnerDriveStatus()` (TanStack Query, refetch alle 5s solange `pending` vorkommt, sonst alle 30s).
- `OrdnerBaum.tsx`: `Props` um `driveStatus?: Record<string, "synced"|"pending"|"error"|"none">` erweitern. In `BaumKnoten` rechts neben dem Folder-Icon einen 6×6-Punkt rendern (`bg-success` / `bg-muted-foreground animate-pulse` / `bg-warning`); `synced` ohne Punkt oder dezent grün; Tooltip mit Status-Text. Style folgt Memory (kein Sparkle, dezent).
- Aufrufer (`src/routes/dokumente.tsx`) übergibt die Map.

---

## Geänderte/neue Dateien
**Neu**
- `backend/src/drive/drift-check.ts`
- `src/hooks/useDriveSync.ts` (oder Funktionen in `useApi.ts`)
- `backend/test/drive-drift-check.spec.ts`

**Bearbeitet**
- `backend/src/routes/drive.ts` (Routen `POST /drive/sync/dokumente-full`, `GET /drive/ordner/status`)
- `backend/src/drive/upload-worker.ts` (falls Worker-Hooks für neue Op-Felder fehlen — wahrscheinlich nicht, da 036 schon alles abdeckt)
- `src/components/dokumente/DriveSyncBadge.tsx` (onRetry)
- `src/components/dokumente/OrdnerBaum.tsx` (driveStatus-Punkt)
- `src/routes/dokumente.tsx` (Retry-Wiring + Status-Map)

## Out of scope
- Drift-Check für Belege (Rechnungen/Angebote) — separater Punkt, falls gewünscht.
- Drive-Restore aus Papierkorb.
- Visuelle Überarbeitung des `GlobalDriveSyncBadge`.

## Risiko / Edge-Cases
- Drift-Check darf bei vielen Dokumenten nicht blockieren: harte Obergrenze 1000 Items pro Lauf, Cursor-Marker später (Ticket vermerken, nicht jetzt bauen).
- Bei nicht-verbundenem Drive 409 + verständliche Fehlermeldung; FE-Button sollte das tolerieren.
- Polling-Intervall im Baum: nur bei sichtbarem Tab aktiv (`document.visibilityState === "visible"`).
