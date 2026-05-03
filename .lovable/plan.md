# Plan 7 — Dokumente-Upload mobil reparieren + Drucken im Viewer

Zwei zusammenhängende Probleme im `/dokumente`-Bereich:

## Problem 1 — Upload auf dem Handy unsichtbar

Aktuell rendert die Seite **zweimal** das Upload-Panel:

1. `<DokumentUploadPanel compact />` in der **Header-Actions-Zeile** (rechts oben, neben „Vom Handy scannen").
2. `<DokumentUploadPanel />` (Vollform mit Drop-Zone) **unter den KPI-Kacheln**.

Das sind **zwei voneinander unabhängige Instanzen mit eigenem State**. Wenn der Nutzer auf dem Handy den kompakten „Dateien wählen"-Button im Header antippt, landen die ausgewählten Dateien im **State der Header-Instanz**. Diese rendert dann die Datei-Liste + „Alle hochladen"-Button innerhalb der Header-Actions-`flex-wrap`-Zeile — auf Mobile gequetscht zwischen den anderen Header-Buttons und vom Nutzer faktisch nicht auffindbar (er sieht weder die ausgewählte Datei noch den Hochladen-Button).

### Fix

- Den **kompakten Panel-Aufruf in `PageHeader.actions` entfernen**.
- Stattdessen ein **gemeinsames `useRef<DokumentUploadPanelHandle>`** in `dokumente.tsx` halten und einen schlichten **„Datei wählen"-Button** in den Header packen, der `inputRef.current.click()` der **einzigen** Vollform-Panel-Instanz auslöst. Dazu wird `DokumentUploadPanelHandle` um eine Methode `openPicker()` erweitert (`useImperativeHandle`).
- Beim Klick zusätzlich smooth zur Panel-Position scrollen, damit auf Mobile der Stapel + Hochladen-Button sofort im Viewport ist.
- Ergebnis: Genau **eine** State-Quelle. Datei-Liste, Status-Zeilen, „Alle hochladen"-Button erscheinen verlässlich im großen Panel unter den KPIs — sowohl mobil als auch Desktop. Das gleiche gilt automatisch für den Klick auf die Drop-Zone selbst (funktioniert auf Mobile als Tap).

Kein Verhalten der Kunden- und Objekt-Detail-Seiten ändert sich (die nutzen das Vollpanel ohnehin direkt).

## Problem 2 — Dokumente öffnen & drucken

Der `DokumentViewer` zeigt heute Bilder und PDFs an, hat aber **keinen Druck-Button**. Wir wollen Konsistenz mit dem Plan-6-„Drucken"-Verhalten.

### Fix

- In `src/components/dokumente/DokumentViewer.tsx` neben „Download" und „Bearbeiten" einen **„Drucken"**-Button.
- Bei **PDFs** und **Bildern** funktioniert der bestehende `printPdfBlobUrl`-Mechanismus aus `src/lib/pdf/printBlob.ts` direkt (versteckter `<iframe>`, Fallback neuer Tab) — das iframe-Print funktioniert für Bilder ebenso wie für PDFs, weil der Browser im iframe nur die Datei rendert.
- Für **andere MIME-Types** (z. B. heic, sonstige) wird der Drucken-Button ausgeblendet (genauso wie heute schon „Vorschau nicht verfügbar" greift).
- Re-Use: einfach den vorhandenen `<PrintButton url={dateiUrl} />` aus `src/components/pdf/PrintButton.tsx` einbinden — kein neuer Code, nur Verdrahtung.

### Pop-up-Blocker-Fix (kleiner Nebeneffekt aus Plan 6)

Der Console-Fehler „Pop-up blockiert" tauchte auf, weil der iframe-Pfad fehlschlug und unser Fallback `window.open` synchron, aber zu spät innerhalb eines async `onload`-Callbacks aufgerufen wird → Browser werten das nicht mehr als User-Gesture. Behebung in `printBlob.ts`:

- Fallback NICHT mehr werfen, sondern **soft erkennen**: wenn `window.open` `null` liefert → Toast „Pop-ups blockiert — PDF wird stattdessen heruntergeladen", parallel den Blob als Download anbieten (a-Tag mit `download`-Attribut, programmatischer Klick — funktioniert auch ohne Gesture).
- Damit gibt es nie mehr eine ungefangene Exception, und der Nutzer hat IMMER eine Aktion: entweder Druck-Dialog (Standardfall), neuer Tab (Fallback), oder Download (letzter Fallback).

## Geänderte / neue Dateien

| Datei | Änderung |
|---|---|
| `src/routes/dokumente.tsx` | kompakten Panel-Aufruf entfernen; einen schlichten „Datei wählen"-Button im Header, der ein Ref des einzigen Panels triggert; smoothScrollIntoView auf Klick |
| `src/components/dokumente/DokumentUploadPanel.tsx` | `DokumentUploadPanelHandle` um `openPicker()` erweitern |
| `src/components/dokumente/DokumentViewer.tsx` | `<PrintButton url={dateiUrl} />` neben Download (sichtbar nur wenn isImage oder isPdf) |
| `src/lib/pdf/printBlob.ts` | Pop-up-Fallback ohne Throw, mit Download-Toast als finale Eskalation |

Keine neuen Dependencies, keine Backend-Änderungen, keine Migration.

## Akzeptanzkriterien

1. **Mobil**: Klick auf „Datei wählen" im Header öffnet den Datei-Picker. Nach Auswahl ist die Datei sichtbar in einem Stapel mit Vorschau-Thumbnail, daneben sichtbar der Button **„Alle hochladen (n)"**. Der Stapel ist im Viewport.
2. Identisches Verhalten beim Tap auf die Drop-Zone selbst.
3. Nach erfolgreichem Upload erscheint das Dokument sofort in der Liste / Karten-Ansicht (bestehende `qc.invalidate` greift bereits).
4. Im Dokument-Viewer ist neben Download/Bearbeiten ein **„Drucken"**-Button. Klick öffnet bei Bildern und PDFs den nativen Druck-Dialog (gleiche Strategie wie Plan 6).
5. Pop-up-Blocker führt nicht mehr zu ungefangener Exception; statt dessen erfolgt ein Toast + automatischer Download.

Sag „Go", dann setze ich Plan 7 um.
