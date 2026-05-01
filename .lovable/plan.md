## Ziel
Die in der letzten Iteration offen gebliebenen Mobile-Polishings umsetzen.

---

## 1. PDF-Viewer als Mobil-Vollbild — `src/components/pdf/PdfViewerDialog.tsx`
- `DialogContent`-Klassen ändern auf:
  `flex h-[100dvh] max-h-[100dvh] w-screen max-w-none flex-col gap-0 overflow-hidden rounded-none border-0 bg-background p-0 sm:h-[90vh] sm:max-h-[90vh] sm:w-[95vw] sm:max-w-5xl sm:rounded-lg sm:border`
- Header: Padding mobil auf `px-3 py-2`, Title `text-sm` auf Mobil; Download-Button als Icon-Only mobil (`<Button size="icon">`) und als Label-Variante ab `sm:`.
- Sticky-Top für Seitenanzeige bleibt durch den DialogHeader (er hat bereits `border-b` und ist oben fix durch Flex-Layout).
- Page-Container: `px-1 py-3 sm:px-6 sm:py-4`. `Page width` so anpassen, dass auf Mobil `containerWidth - 8` genutzt wird.

## 2. Detail-Seiten — Mobile-Polish
Betrifft: `src/routes/kunden.$id.tsx`, `angebote.$id.tsx`, `rechnungen.$id.tsx`, `objekte.$id.tsx`, `dauerauftraege.$id.tsx`.

- **Meta-Grids einspaltig auf Mobil**: alle Vorkommen `grid-cols-2`/`grid-cols-3` für Info-Karten ersetzen durch `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` (je nach aktueller Anzahl).
- **PageHeader-Actions** (Bearbeiten/Versenden/PDF anzeigen/Stornieren etc.): Auf Mobil nur die 1–2 wichtigsten Buttons direkt sichtbar lassen, Rest in `DropdownMenu` (3-Punkte-Menü) auslagern. Konkret in jeder Detail-Route:
  - Sichtbar: PDF-View-Button + nächster Status-Action-Button (z. B. „Versenden", „Zahlung erfassen").
  - In Overflow: alles andere.
- Alternative leichter umzusetzen: bestehende Action-Buttons in einen Wrapper `flex flex-wrap gap-2` packen und die Buttons mobil als `size="sm"` mit Icon-Only-Variante (`<span className="hidden sm:inline">…</span>`) ausführen — vermeidet das Dropdown-Refactor.
- **Sticky Bottom-Action-Bar** (optional, wenn das Overflow-Menü zu komplex ist): Auf Detail-Seiten unten ein Bar `sticky bottom-0 -mx-4 px-4 py-3 bg-background border-t md:hidden` mit dem Primary-Action-Button rendern.

Pragmatischer Plan: Variante mit Icon-Only auf Mobil + `flex-wrap` (kein Dropdown-Refactor).

## 3. Formulare — Mobile-Polish
Betrifft: `src/components/forms/KundeForm.tsx`, `ObjektForm.tsx`, `AngebotForm.tsx`, `RechnungForm.tsx`, `DauerauftragForm.tsx`, `BelegForm.tsx`, sowie `src/routes/kunden.neu.tsx`, `objekte.neu.tsx`, `angebote.neu.tsx`, `rechnungen.neu.tsx`.

- **Grid-Spalten einspaltig auf Mobil**: Alle Vorkommen `grid grid-cols-2` (für Form-Feld-Reihen) durch `grid grid-cols-1 sm:grid-cols-2` ersetzen. `grid-cols-3` analog.
- **Sticky Submit-Footer**: In jeder Form-Komponente den Footer mit den Buttons in:
  `<div className="sticky bottom-0 -mx-4 sm:-mx-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-border bg-background px-4 sm:px-6 py-3">…</div>` umbauen.
- **PositionenEditor** (`src/components/forms/PositionenEditor.tsx`): Aktuelle Tabellen-Darstellung pro Position auf Mobil als Karte rendern (eine Card pro Position mit gestapelten Feldern: Bezeichnung, Menge × Einzelpreis, Rabatt, Summe + Lösch-Button). `hidden md:table` für Tabelle, `md:hidden space-y-3` für Cards.

## 4. Posteingang-Liste — Card-View — `src/routes/dauerauftraege.posteingang.tsx`
Aktuell vermutlich Tabelle/Liste; den gleichen Mobile-Card-Pattern anwenden wie bei den anderen Listen (mit `MobileListCard`).

## 5. Akzeptanzcheck
Nach jedem Schritt visuelle Prüfung auf 390×844:
- Alle Buttons ≥ 44 px Tap-Target.
- Kein horizontales Scrollen außer in expliziten Tabellen-Wrappern.
- Sticky-Footer überdeckt keine Inhalte (letztes Form-Element hat genug Bottom-Padding).
- PDF-Viewer füllt mobil den Screen, Pinch-to-Zoom über Browser möglich.

---

## Reihenfolge
1. PDF-Viewer Vollbild (klein, hoher Impact)
2. PositionenEditor mobile Cards (Kernfunktion bei Angebot/Rechnung)
3. Formulare einspaltig + Sticky-Submit
4. Detail-Seiten Meta-Grid + Action-Bar (Icon-Only-Variante)
5. Posteingang-Card-View
