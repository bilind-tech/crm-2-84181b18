## Ziel

Eine vollwertige **Datenbank-Seite** unter `Einstellungen → Datenbank`, die alle jemals gespeicherten Datensätze (auch gelöschte) anzeigt, filtern, ansehen, bearbeiten, wiederherstellen und endgültig löschen lässt — inkl. PDF-Vorschau mit Drucken/Neuer Tab/Download.

Begleitende Backend-Umstellung auf einheitliches **Soft-Delete** für alle Hauptobjekte. „Löschen" im normalen CRM markiert nur noch — die Daten und ihre PDFs/Dateien bleiben physisch erhalten.

---

## Phase 1 — Backend: Einheitliches Soft-Delete

### 1.1 Schema-Migration `024_soft_delete_alles.sql`

Spalte `geloescht_am TEXT` (ISO-Datum, NULL = aktiv) hinzufügen auf:
- `kunde`, `objekt`, `ansprechpartner`, `notiz`
- `angebot`, `rechnung`
- `protokolle`
- `steuer_manueller_posten`
- `dokumente` (existiert bereits — Skip)

Für jede Tabelle: Index `(geloescht_am)` für schnelles Filtern.

Bestehende `archiviert`-Flags auf Kunde/Angebot/Rechnung **bleiben** (sind logisch was anderes — „archiv" als Workflow-Endpunkt, nicht „gelöscht"). Bei Hart-Delete-Pfaden werden sie weiter beachtet.

### 1.2 Repo-Layer umstellen

- Alle `deleteX(id)` werden zu **soft** als Default: `UPDATE … SET geloescht_am = datetime('now') WHERE id = ?`.
- Neue Funktion `hardDeleteX(id, opts)` für endgültiges Löschen (nur aus Datenbank-Seite mit Passwort).
- Neue Funktion `restoreX(id)`: `UPDATE … SET geloescht_am = NULL`.
- Alle existierenden Listen-/Detail-Queries (`SELECT … FROM kunde …`, `… FROM rechnung …`, etc.) bekommen `WHERE geloescht_am IS NULL` — damit das normale CRM gelöschte Datensätze **nicht** mehr sieht.
- Spezialfall Beleg-Nummern-Zähler: bleiben unangetastet, damit Nummern eindeutig bleiben.

### 1.3 Neue Backend-Routen unter `/datenbank`

- `GET /datenbank/tabellen` → Liste aller Tabellen mit Zähler (`total`, `aktiv`, `geloescht`).
- `GET /datenbank/:tabelle?status=alle|aktiv|geloescht&q=&kundeId=&from=&to=&page=&limit=` → paginierte Liste, inkl. gelöschten.
- `GET /datenbank/:tabelle/:id` → vollständiger Datensatz mit allen verknüpften Daten (für Slide-Over).
- `PATCH /datenbank/:tabelle/:id` → Feld-Update (whitelistete Felder pro Tabelle, validiert via Zod).
- `POST /datenbank/:tabelle/:id/restore` → `geloescht_am = NULL`.
- `POST /datenbank/:tabelle/:id/hart-loeschen` → erwartet `{ passwort }`, validiert gegen `app_user`, dann physischer DELETE inkl. Dateien (PDFs, Dokument-Blobs).

Alle Routen hinter `requireAuth`. Rate-Limit auf Hart-Löschen (max. 5/min).

### 1.4 PDF-Auslieferung

`GET /datenbank/:tabelle/:id/pdf` liefert die archivierte PDF (Angebot/Rechnung/Protokoll/Dokument) als `application/pdf` mit `Content-Disposition: inline` und Dateinamen — direkt für `<a target="_blank">` und Drucken nutzbar.

---

## Phase 2 — Frontend: Datenbank-Seite

### 2.1 Seitenstruktur (`src/routes/einstellungen.datenbank.tsx`)

```text
┌─ Sidebar (links, ~240 px) ─────────────┬─ Inhaltsbereich ──────────────────┐
│  Tabellen-Liste mit Zähler-Badges      │  Filterleiste (oben)              │
│  • Kunden (124 / 3 gelöscht)           │   ─ Suche                          │
│  • Objekte (87)                        │   ─ Status: alle/aktiv/gelöscht   │
│  • Angebote (203 / 12 gelöscht)        │   ─ Datumsbereich                  │
│  • Rechnungen (…)                      │   ─ Kunden-Filter                  │
│  • Protokolle (…)                      │   ─ Ansicht: Tabelle | Karten     │
│  • Dokumente (…)                       │                                    │
│  • Notizen, Ansprechpartner,           │  Datensatz-Bereich                 │
│    Zahlungen, Steuer-Posten            │   (Tabelle ODER Karten-Grid)       │
│                                        │   Klick auf Zeile/Karte →          │
│                                        │   öffnet Slide-Over rechts         │
└────────────────────────────────────────┴────────────────────────────────────┘
```

URL-State (TanStack Router `validateSearch`): `tabelle`, `status`, `q`, `kundeId`, `from`, `to`, `ansicht`, `page`.

### 2.2 Tabellen-Ansicht

- Kompakte Daten-Tabelle, pro Tabelle relevante Spalten (Nummer, Name, Datum, Betrag, Status, Gelöscht-Badge).
- Gelöschte Zeilen: dezent dimmt + roter „gelöscht am dd.mm.yyyy"-Badge.
- Spalten sortierbar, Header-Hover.

### 2.3 Karten-Ansicht

- Responsive Grid, eine Karte pro Datensatz mit den wichtigsten Feldern + Status-Pill + Quick-Actions (Ansehen / Bearbeiten / Wiederherstellen).
- Toggle „Tabelle | Karten" oben rechts.

### 2.4 Slide-Over (Detail + Bearbeiten + PDF)

Rechts einfahrendes Panel, breit (~720 px) oder full-screen auf Mobile.

Inhalt:
1. **Kopf**: Nummer/Name, Status-Pill, Quick-Actions (Drucken, Neuer Tab, Download, Wiederherstellen / Hart löschen).
2. **PDF-Vorschau** (wenn vorhanden): `PdfPreviewCard` (ArrayBuffer-Pfad, gleicher Fix wie bei Protokollen).
   - Button „In neuem Tab öffnen" → echtes `target="_blank"` auf `/datenbank/.../pdf`.
   - Button „Drucken" → öffnet PDF in neuem Tab und triggert dort `window.print()` (Native-Browser-Druckdialog).
   - Button „Herunterladen" → `download`-Attribut.
3. **Felder** in gruppierten Sektionen (z. B. Stammdaten / Adresse / Verknüpfungen / Meta).
   - Pro Feld: Label + Input/Select/Date/Textarea passend zum Typ.
   - „Speichern"-Button unten, deaktiviert wenn unverändert.
   - Validation via Zod, gleiche Schemas wie im normalen CRM-Formular wo möglich.
4. **Verknüpfungen** (read-only Links): „gehört zu Kunde X", „3 Positionen", „2 Zahlungen" — Klick navigiert in der Datenbank-Seite zur Ziel-Tabelle, vorgefiltert.
5. **Audit-Footer**: erstellt am, aktualisiert am, ggf. gelöscht am.

### 2.5 Hart-Löschen-Dialog

- Eigene `AlertDialog`-Komponente, mittig.
- Klartext-Warnung: „Dieser Vorgang ist endgültig. Datei und PDF werden von der Festplatte gelöscht."
- Eingabefeld **Passwort** (das App-Passwort).
- Erst nach korrekter Eingabe ist „Endgültig löschen" aktiv.
- Bei Erfolg: Slide-Over schließt, Toast „Endgültig gelöscht", Liste invalidiert.

### 2.6 Wiederherstellen

- Einfacher Button im Slide-Over und in Zeilen-Aktionen.
- Kein Passwort. Toast + Invalidate.

---

## Phase 3 — Konsistenz im restlichen CRM

- Alle bestehenden „Löschen"-Buttons (Kunden, Objekte, Angebote, Rechnungen, Protokolle, Dokumente, Steuer-Posten) zeigen weiter denselben Text, lösen aber Soft-Delete aus.
- Toast nach Löschen: „… gelöscht. Wiederherstellbar in Einstellungen → Datenbank."
- Hard-Delete-Pfad nur noch über Datenbank-Seite. Die alten `?force=true`-Query-Parameter werden aus dem Frontend entfernt; Backend akzeptiert sie nur noch mit Passwort-Header.
- Listen, Suchen, Belegnummern-Generierung etc. ignorieren gelöschte Datensätze.

---

## Technische Details

- **Soft-Delete-Spalte** einheitlich `geloescht_am TEXT NULL` (gleiche Konvention wie bei Dokumenten).
- **Beleg-Nummern** bleiben reserviert, auch wenn das Dokument soft-deleted ist (kein Re-Use → Audit-sicher).
- **Dateien auf der Festplatte**: bei Soft-Delete bleiben PDFs/Blobs **liegen**. Erst Hart-Delete entfernt Dateien (`fs.unlink` + Aufräumen von Verzeichnis-Strukturen) — innerhalb derselben Transaction wie der SQL-DELETE, bei Fehler Rollback.
- **PDF im Slide-Over**: Backend liefert echte HTTP-URL (`/datenbank/.../pdf`) → kein `blob:`-Problem mehr, kein Worker-Fetch-Fail.
- **„Drucken"**: kleine Helper-Seite `/print/pdf?src=…`, die das PDF in ein `<iframe>` lädt und nach `onload` `iframe.contentWindow.print()` aufruft. Funktioniert in allen modernen Browsern, öffnet Standard-Druckdialog.
- **Zustand**: Server-State via React Query (`useQuery` mit Schlüssel `["datenbank", tabelle, filters]`), UI-State (Slide-Over offen, ID, Ansicht) via URL-Search-Params.
- **Tabellen-Metadaten** (Spalten, editierbare Felder, Zod-Schema, Anzeige-Label) zentral in `src/lib/datenbank/registry.ts` definiert — eine Source of Truth statt 8x Code-Duplikation.

---

## Reihenfolge & Sichtbarkeit

1. Migration + Repo-Umstellung (Phase 1.1–1.2) → CRM funktioniert weiter, gelöschte Daten verschwinden nur noch optisch.
2. Backend-Routen (Phase 1.3–1.4).
3. Datenbank-Seite Skeleton + Sidebar + Tabellen-Ansicht (Phase 2.1–2.2).
4. Slide-Over mit Felder-Edit + PDF-Vorschau (Phase 2.4).
5. Hart-Löschen-Dialog + Wiederherstellen (Phase 2.5–2.6).
6. Karten-Ansicht (Phase 2.3) als optionaler Toggle.
7. Konsistenz-Pass (Phase 3).

---

## Dateien (Kurzliste)

**Backend (neu)**: `backend/src/db/migrations/024_soft_delete_alles.sql`, `backend/src/routes/datenbank.ts`, `backend/src/datenbank/registry.ts`, Erweiterungen in den bestehenden Repos (`kunden/repo.ts`, `belege/angebote-repo.ts`, `belege/rechnungen-repo.ts`, `protokolle/repo.ts`, `steuern/repo.ts`).

**Frontend (neu/refactor)**: `src/routes/einstellungen.datenbank.tsx` (komplett neu), `src/components/datenbank/{Sidebar,FilterBar,DataTable,DataCards,DetailSlideOver,HartLoeschenDialog,PrintFrame}.tsx`, `src/lib/datenbank/registry.ts`, `src/hooks/useDatenbank.ts`. Bestehende Delete-Aufrufe im CRM (Kunden/Objekte/Angebote/Rechnungen/Protokolle/Dokumente) bleiben semantisch gleich — kleine Toast-Texte anpassen.

---

## Bewusst NICHT enthalten

- Inline-Bearbeitung in der Tabelle (auf Wunsch entschieden: nur Slide-Over).
- Bulk-Aktionen (Mehrfach-Auswahl + Massen-Löschen) — kann später, wenn nötig.
- Audit-Log-UI (separate Funktion, existiert bereits unter `/aktivitaet`).