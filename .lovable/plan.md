## Ziel

Die Detail-Bearbeitung von **Übergabe-/Abnahmeprotokoll** und **Schlüsselübergabe** soll sich exakt so anfühlen wie der PDF-Editor von Angebot/Rechnung: links Live-PDF, **mit der Maus direkt auf ein Feld klicken → Inline-Editor öffnet sich**, rechts Tab-Editor mit allen Optionen. Plus drei Verbesserungen, die der Beleg-Editor heute nicht hat. Plus der Flacker-Bug wird behoben.

## Bestandsaufnahme

- Beleg-Editor (`src/components/pdf-editor/*`): PDF-Tracker (`hotspotTracker.ts`) erkennt pdfmake-Nodes mit `id`, `PdfFieldOverlay` legt klickbare Hotspots darüber, `HotspotInlineEditor` schreibt in den Draft.
- Protokoll-Editor (`src/components/protokoll-editor/*`): Split-Layout existiert, aber `werkzeugePdf.ts` setzt **keine** `id`s und übergibt keinen Tracker → keine Hotspots → man muss alles im rechten Panel suchen.
- `ProtokollLivePreview` macht atomaren Buffer-Swap wie `LivePdfPreview` — Flacker kommt also nicht vom Swap, sondern davon, dass `renderWidth` bei jedem Scrollbar-Sprung neu berechnet wird und `<Page width=…>` jeden Subpixel-Schritt neu rasterisiert.

## Umsetzung

### 1. Hotspots in `src/lib/pdf/werkzeugePdf.ts`

Beide PDF-Generatoren auf das Beleg-Muster umstellen:

- Tracker erzeugen: `const tracker = createHotspotTracker(A4)`, an `pm.createPdf(doc, …, …, tracker.pageBreakBefore)` übergeben.
- Stabile `id`s an die relevanten pdfmake-Nodes setzen. **Übergabe-/Abnahmeprotokoll:**

  | Feld-ID | Bereich |
  |---|---|
  | `kunde` | Empfänger-Adresse |
  | `meta` | Meta-Box (Nr./Datum/Uhrzeit) |
  | `titel` | Hauptüberschrift („Übergabeprotokoll" …) |
  | `leistungsumfang` | Leistungs-Block |
  | `bemerkungen` | Mängel-/Bemerkungen-Block |
  | `ergebnis` | „Ohne Vorbehalt"-Zeile |
  | `unterschriften` | Unterschriften-Block |
  | `art` | (versteckter Hotspot auf dem Titel, öffnet Radio Übergabe/Abnahme/Beides) |

  **Schlüsselübergabe:** `kunde`, `meta`, `titel`, `richtung` (Hotspot auf Titel), `schluessel.tabelle`, `pfand`, `bestaetigung`, `unterschriften`.

- Rückgabe ändern: `Promise<{ blob: Blob; hotspots: RuntimeHotspot[] }>`.
- `generateProtokollPdf(...)` (Adapter) gibt ebenfalls `{ blob, hotspots }` zurück. Die zwei Aufrufstellen, die heute nur den Blob benötigen (Abschließen-Flow, Download-Button), greifen auf `.blob` zu — kurze Anpassung in `ProtokollEditorLayout.onAbschliessen` und in `src/components/pdf/PrintButton.tsx` (`grep`-Ergebnisse zeigen ~2 Stellen).

### 2. `src/lib/pdf/fieldMap.ts` erweitern

Zweite Lookup-Map für Protokoll-Felder + Helper `protokollMetaForId(id)`. Tabs: `stammdaten` | `inhalt` | `unterschriften` | `optionen`.

### 3. Neue Komponente `src/components/protokoll-editor/ProtokollHotspotEditor.tsx`

Analog zu `HotspotInlineEditor`, aber für Protokolle. Pro Feld-ID rendert sie ein Mini-Form-Stück (Input/Textarea/RadioGroup, für `schluessel.tabelle` eine kompakte Zeilen-Editor-Liste mit „Zeile +"). Schreibt via `editor.set(key, value)`. Footer: „Erweitert" → öffnet zugehörigen Tab im rechten Panel.

### 4. `ProtokollLivePreview.tsx` um Overlay erweitern

- Generator-Aufruf liefert jetzt `{ blob, hotspots }`. Hotspots in State halten und beim atomaren Swap mit-übernehmen.
- Pro Seite (`<div>` um `<Page>`) zusätzlich `<PdfFieldOverlay hotspots={…} scale={…} openId/onOpenChange renderEditor={…}>` rendern — Komponente wird 1:1 wiederverwendet.
- Fallback-Hotspots für Seite 1 ergänzen (eine zweite Konstante `FALLBACK_HOTSPOTS_PROTOKOLL`) für den Fall, dass der Tracker leer bleibt.

### 5. Flacker-Fix in `ProtokollLivePreview.tsx` (und gleicher Patch in `LivePdfPreview.tsx`)

- `renderWidth` auf das nächste Vielfache von 20 runden:
  ```ts
  const renderWidth = useMemo(() => {
    const raw = Math.min(Math.max(containerWidth - 16, 280), 900);
    return Math.round(raw / 20) * 20;
  }, [containerWidth]);
  ```
  → Scrollbar-Wackler ändern `renderWidth` nicht mehr → kein Re-Render der Seiten.
- `<Page width={useDeferredValue(renderWidth)} …>` damit das erneute Rastern zudem entkoppelt von Eingaben passiert.
- `key` der visiblen Seiten zusätzlich an `renderWidth` binden, damit nicht halb-skalierte Reste sichtbar bleiben.

### 6. Rechtes Panel: Tabs statt Single-Form

`ProtokollEditorLayout` bekommt die Tab-Architektur des Beleg-Editors (`EditorPanel`-Muster). Vier Tabs, Active-Tab steuerbar von außen, damit die „Erweitert"-Buttons der Inline-Editoren direkt darauf springen können:

| Tab | Inhalt |
|---|---|
| **Stammdaten** | Kunde/Objekt-Picker, Datum, Uhrzeit, Art bzw. Richtung |
| **Inhalt** | Übergabe: Leistungsumfang, Bemerkungen · Schlüssel: Zeilen-Editor + Pfand |
| **Unterschriften** | Vertreter AG/AN, „Ohne Vorbehalt" bzw. „Bestätigt" |
| **Optionen** *(neu — geht über Beleg-Editor hinaus)* | • Eigener Titel-Override · • Untertitel-Zeile · • Zusatzklausel-Freitext (eigener Absatz im PDF) · • Logo im PDF ein/aus · • Footer-Firmendaten ein/aus · • Sektions-Titel umbenennen (Leistungsumfang/Mängel/Ergebnis bzw. Übergebene Schlüssel/Bestätigung) · • „Druckfreundlich" (Tabellen-Linien dünner) |

`Protokoll`-Type bekommt dafür ein optionales Feld `optionen?: { titelOverride?: string; untertitel?: string; zusatzKlausel?: string; logoSichtbar?: boolean; footerSichtbar?: boolean; sektionsTitel?: Partial<Record<"leistung"|"bemerkungen"|"ergebnis"|"schluessel"|"bestaetigung", string>>; druckfreundlich?: boolean }`. PDF-Generator wertet diese aus (defaultet auf heutige Werte → keine Migration nötig).

### 7. Abschluss-Button & Header

Bleibt wie heute, der Detail-Button „PDF bearbeiten" (Pencil-Icon) führt weiterhin auf `/protokolle/$id/bearbeiten`. Header verliert nichts.

## Out of Scope

- E-Mail-Versand des PDFs aus dem Editor (Mails nur per User-Klick aus dem bestehenden Versand-Dialog).
- Skalierung des PDFs auf eine andere Seitengröße als A4.
- Neue Protokoll-Typen.

## Verifikation

1. `/protokolle/$id/bearbeiten` öffnen — Felder im PDF zeigen beim Hover dünne, gestrichelte Outline + Pencil-Pille.
2. Klick auf „Leistungsumfang" → Popover mit Textarea, Eingabe ändert das PDF debounced ohne Layout-Sprung.
3. Klick auf den Titel → Inline-RadioGroup Übergabe/Abnahme/Beides; Wechsel ändert Überschrift im PDF.
4. Schlüssel-Protokoll: Klick auf Tabelle → Mini-Zeilen-Editor mit Hinzufügen/Entfernen; Klick auf Pfand → kleines Eurofeld.
5. Tab „Optionen" → eigene Klausel eintippen → erscheint im PDF als neuer Absatz unter „Ergebnis".
6. Fenster schmaler/breiter ziehen, Scrollbar erscheinen/verschwinden → kein Aufblitzen mehr; die Seitenbreite springt nur in 20-px-Stufen.
7. „Abschließen" → PDF wird gespeichert und in Dokumenten erzeugt wie vorher.

## Hinweise

- Keine Sparkles/Glitzer-Deko (Core-Regel) und keine Gradient-Backgrounds im Popover.
- Keine automatischen E-Mails irgendwo in dem Flow.
- `Protokoll.optionen`-Felder sind alle optional → bestehende Protokolle bleiben unverändert kompatibel.
