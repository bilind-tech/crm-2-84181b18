## Zwei Probleme

### 1. PDF-Editor (Angebot / Rechnung) flackert beim Bearbeiten

Aktuell baut `LivePdfPreview` bei jeder kleinen Änderung am Draft automatisch eine neue PDF (debounce 450 ms), tauscht Blob-URLs und mountet `<Document>` neu. Trotz „Pending-Swap" entsteht in der Praxis das gleiche schnelle An/Aus-Flackern wie beim Protokoll-Editor, weil:

- Jeder Tastendruck verändert `draftKey` → neuer Build startet sofort.
- Mehrere parallele Builds erzeugen ständig neue Blobs/URLs.
- Autosave-Echo + `loadAttempt`-Retry können `pdfBuffer` neu setzen → `<Document>` mountet neu → kurzer Reset des Viewers.

Genau dafür haben wir beim Protokoll-Editor erfolgreich auf einen Snapshot-Modus umgestellt. Das machen wir hier exakt genauso — auch wenn die Vorschau dann nicht mehr live mit jeder Eingabe mitatmet. Die PDF bleibt stabil, fühlt sich „fest" an und ist nie kaputt.

**Was sich konkret ändert (`src/components/pdf-editor/LivePdfPreview.tsx`):**

1. **Keine Auto-Rebuilds mehr beim Tippen.** Der Effekt, der auf `draftKey` / `ctxKey` reagiert, wird entfernt. Stattdessen merkt sich die Komponente den zuletzt gebauten Key (`builtKeyRef`) und vergleicht ihn mit dem aktuellen Key → daraus ergibt sich nur ein dezenter Status („Vorschau aktuell" / „Vorschau nicht aktuell").
2. **Manueller Refresh-Button „Aktualisieren"** oben rechts in der Vorschau (klein, ruhig, kein Spinner-Geflacker). Erscheint nur wenn der Draft semantisch von der gerenderten PDF abweicht.
3. **Optionaler Auto-Refresh nur nach echter Ruhe** (z. B. 3000 ms keine Änderung **und** kein Input/Textarea/Hotspot fokussiert) — wenn das in der Praxis ebenfalls flackert, lassen wir es ganz weg und der Button bleibt der einzige Trigger.
4. **Stabiles `<Document>`-Mount.** `fileSource` bleibt referenzgleich, bis ein Rebuild wirklich abgeschlossen ist. `numPages` wird beim Wechsel **nicht** mehr auf 0 gerissen — die alte PDF bleibt sichtbar, bis die neue komplett geladen ist (atomarer Swap, ohne `key={loadAttempt}`-Reset).
5. **Genau ein Build gleichzeitig.** Wenn während eines laufenden Builds neue Änderungen reinkommen, wird nur die *letzte* Anfrage am Ende neu gebaut — nie eine Kette paralleler Blobs.
6. **Build-Fehler überschreibt nie die letzte funktionierende PDF.** Bei Fehler bleibt die alte Ansicht stehen, Banner „Vorschau veraltet" mit „Erneut versuchen".
7. **Volatile Server-Felder** (`aktualisiertAm`, `updatedAt`, `erstelltAm`, `createdAt`) bleiben aus dem Vergleich raus, sodass Autosave-Echos die Vorschau nie als „nicht aktuell" markieren.

Ergebnis: Beim Tippen passiert in der Vorschau **gar nichts** — kein Mount, kein Flackern. Erst auf Klick (oder nach echter Pause) wird einmal sauber neu gerendert.

### 2. Datenbank → Dokumente liefert „Internal Server Error"

Ursache: In `backend/src/datenbank/registry.ts` referenziert der Eintrag `dokument` die Spalte `erstellt_am`, die es in der Tabelle `dokumente` gar nicht gibt. Das Schema verwendet `hochgeladen_am` (siehe `backend/src/db/migrations/013_dokumente.sql`). Die Listen-Query baut daraus `ORDER BY erstellt_am DESC, id DESC` → SQLite wirft „no such column: erstellt_am" → 500.

**Fix (`backend/src/datenbank/registry.ts`, nur der `dokument`-Eintrag):**
- `dateColumn: "hochgeladen_am"`
- In `listColumns` den letzten Eintrag von `erstellt_am` auf `hochgeladen_am` (Label „Hochgeladen") umstellen.

Damit funktioniert die Liste, Sortierung, Datumsfilter und Detail-Sheet konsistent mit dem tatsächlichen Schema. Keine Migration nötig.

## Geänderte Dateien

- `src/components/pdf-editor/LivePdfPreview.tsx` (Snapshot-Strategie, manueller Refresh-Button, stabiles Mount)
- `backend/src/datenbank/registry.ts` (Spalten-Fix für `dokument`)
