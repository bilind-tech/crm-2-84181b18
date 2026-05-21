## Problemanalyse

Die zwei Bugs in der PDF-Vorschau im Beleg-Editor (Live-Preview) kommen beide aus `src/lib/pdf/belegPdf.ts`. Der frühere Fix wurde nur in `backend/src/pdf/layout.ts` ausgeliefert — der Editor nutzt aber den Frontend-Generator, dort steht der alte Code noch.

### Bug 1 — Tabelle springt komplett auf Seite 2
In `leistungstabelle()` (Frontend) ist alles in *einer* Tabelle gebündelt mit:
- `dontBreakRows: true` → eine Zeile mit sehr langer Pauschal-Beschreibung passt nicht mehr auf den Rest von Seite 1 und wird komplett auf Seite 2 verschoben
- `keepWithHeaderRows: 1` → Header wandert mit, also bleibt Seite 1 ohne Tabelle
- Die Summenzeilen (MwSt + Gesamt) liegen im selben Body, hängen also an derselben unteren Kante

Zusätzlich hat der Intro-Block (Anrede + Einleitungstext) `unbreakable: true`, was die Verschiebung noch verschärft.

### Bug 2 — Empfänger-Adresse leer trotz Objekt
`generateRechnungPdf(rechnung, kunde, firma, ansprechpartner, objekt?)` akzeptiert zwar ein `objekt`, aber:
- `PdfEditorLayout` nimmt das `objekt` gar nicht als Prop entgegen
- `LivePdfPreview` ruft die Generator-Funktion ohne `objekt` auf

Dadurch greift der bereits vorhandene Fallback in `kundeAdresse()` (Kunden-Adresse → Objekt-Adresse) in der Live-Preview nie. Im Backend-PDF (Versand, Download) funktioniert es bereits.

## Änderungen

### 1. `src/lib/pdf/belegPdf.ts` — Tabelle korrekt umbrechen
- `leistungstabelle()` in zwei Tabellen splitten: `positionsTabelle` (Header + Positionen, `dontBreakRows: false`, kein `keepWithHeaderRows`) und `summenTabelle` (MwSt + Gesamtbetrag, `dontBreakRows: true`). Rückgabe als `{ stack: [positionsTabelle, summenTabelle], id: "tabelle" }` (Hotspot-ID bleibt erhalten).
- Den Intro-Stack (Anrede + Intro) `unbreakable: true` entfernen, damit die Tabelle bei knappem Platz direkt auf Seite 1 anfängt. Outro behält `unbreakable: true`.

### 2. Objekt in die Live-Preview durchreichen
- `src/routes/rechnungen.$id.bearbeiten.tsx` und `src/routes/angebote.$id.bearbeiten.tsx`: bei vorhandener `objektId` das Objekt aus dem bestehenden Kunden-Detail-Datenstrom (bzw. `useApi`) laden und an `PdfEditorLayout` weiterreichen. Wenn die Daten dort schon im Scope liegen, einfach durchreichen — sonst minimaler Ladeaufruf analog zum Ansprechpartner.
- `src/components/pdf-editor/PdfEditorLayout.tsx`: `objekt?: Objekt | null` zu beiden Props-Varianten hinzufügen, an `LivePdfPreview` durchreichen.
- `src/components/pdf-editor/LivePdfPreview.tsx`: `objekt` zu `CommonProps` aufnehmen, in `latestPropsRef` aufnehmen, im Build-Aufruf an `generateAngebotPdf` / `generateRechnungPdf` weitergeben, und in `semanticKey` einbeziehen (sonst rebuildet die Vorschau nicht, wenn das Objekt sich ändert).

### Aus dem Scope ausgeschlossen
- Backend-PDF (`backend/src/pdf/layout.ts`) — bereits korrekt.
- Kein Wechsel der Adress-Policy (Kunde bleibt primär, Objekt nur als Fallback).
- Keine Änderungen an Listen-Summen, Editor-Logik, Drive-Sync.

## Verifikation
Nach den Änderungen im Editor eine Rechnung mit sehr langem Pauschal-Text öffnen: Tabellenkopf + erste Zeile starten auf Seite 1 und brechen in die Folgeseite um; Summenblock bleibt zusammen. Eine Rechnung mit leerer Kunden-Adresse aber ausgefülltem Objekt: Empfängerblock zeigt Straße/PLZ/Ort aus dem Objekt.
