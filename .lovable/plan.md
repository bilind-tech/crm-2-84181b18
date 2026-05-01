## Ziel

Überall, wo es ein PDF gibt (Rechnungen, Angebote, Mahnungen, später Dauerauftrag-Läufe), erscheint ein **Auge-Icon-Button**. Klick → modal-artiges Fenster auf derselben Seite mit:

- vollständiger PDF-Vorschau (alle Seiten, scrollbar)
- Seitenanzahl-Info („Seite 1 von 2")
- Download-Button im Fenster
- Google-Drive-Sync-Status („Lokal" / „Auf Drive synchronisiert ✓" / „Sync ausstehend")

Kein neuer Tab. Nichts wird zur Laufzeit installiert — nur das, was beim nächsten Build mitkommt (`bun add`).

---

## Technik

### Bibliothek
**`react-pdf`** (basiert auf pdf.js, läuft 100 % im Browser, keine Server-Komponente, keine Native-Bindings — Pi-kompatibel).

```bash
bun add react-pdf
```

`react-pdf` rendert jede Seite als `<canvas>`, gibt uns die Seitenanzahl direkt aus dem Dokument und funktioniert mit dem bestehenden Blob-URL-Mechanismus aus `useBelegPdf.ts` ohne Änderungen.

PDF.js-Worker wird über Vite-Asset-Import eingebunden:
```ts
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
pdfjs.GlobalWorkerOptions.workerSrc = pdfjsWorker;
```

### Neue Komponenten

**1. `src/components/pdf/PdfViewerDialog.tsx`** — der wiederverwendbare Viewer.

Props:
```ts
{
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;            // z. B. "Rechnung RE-2026-05-001"
  pdfUrl: string | null;    // Blob-URL aus useBelegPdf
  status: "idle" | "loading" | "ready" | "error";
  fileName: string;         // z. B. "RE-2026-05-001.pdf"
  driveStatus?: DriveStatus; // optional, Default = "lokal"
}
```

Layout (Radix `Dialog`, max. `90vw × 90vh`, im App-Stil — kein Gradient, `bg-background`):
```text
┌─────────────────────────────────────────────────────┐
│  Rechnung RE-2026-05-001        [⤓ Download] [✕]    │
│  Seite 1 von 2 · 📄 Lokal (wird synchronisiert)     │
├─────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────┐ │
│ │              [PDF-Seite 1]                      │ │
│ └─────────────────────────────────────────────────┘ │
│ ┌─────────────────────────────────────────────────┐ │
│ │              [PDF-Seite 2]                      │ │
│ └─────────────────────────────────────────────────┘ │
│ (scrollbar)                                         │
└─────────────────────────────────────────────────────┘
```

Verhalten:
- Lade-Skeleton während `status === "loading"`
- Fehler-Zustand mit Retry-Hinweis
- Bei Erfolg: alle Seiten untereinander, automatisch breiten-skaliert (ResizeObserver auf den Container, `width={containerWidth}`)
- Download-Button = `<a href={pdfUrl} download={fileName}>` mit Icon
- ESC schließt, Backdrop-Klick schließt, kein Auto-Focus-Trap-Drama

**2. `src/components/pdf/PdfViewButton.tsx`** — kompakter Trigger.

Wickelt den Eye-Icon-Button + Dialog in einer einzigen Komponente. Lazy: erzeugt das PDF erst beim ersten Öffnen, nicht beim Listen-Render.

```tsx
<PdfViewButton kind="rechnung" beleg={r} />
<PdfViewButton kind="angebot" beleg={a} />
```

Intern entscheidet sie zwischen `useAngebotPdf`/`useRechnungPdf` und füllt Titel + Dateiname automatisch aus der Belegnummer.

**3. `src/components/pdf/DriveStatusBadge.tsx`** — kleiner dezenter Status-Chip.

Drei Zustände:
- `lokal` → grau, „📄 Lokal"
- `pending` → gelb-pulsierend, „🔄 Wird hochgeladen …"
- `synced` → grün, „☁ Auf Google Drive · MM/YYYY-Ordner"

Quelle: optionale Felder `driveFileId?`, `driveSyncedAt?`, `driveSyncError?` auf `Rechnung`/`Angebot`. Diese existieren noch nicht im Datenmodell — ich ergänze sie als optionale Felder in `types.ts`. Solange das Pi-Backend sie nicht setzt, ist der Status immer `lokal` — Frontend ist trotzdem schon fertig verdrahtet.

### Datenmodell — minimal-invasive Erweiterung

`src/lib/api/types.ts`:
```ts
interface DriveSyncInfo {
  fileId?: string;
  syncedAt?: ISODateTime;
  error?: string;
}
// auf Angebot, Rechnung jeweils:
drive?: DriveSyncInfo;
```

Backend setzt das später ohne Migration — alle Felder sind optional.

---

## Einsatzorte für `<PdfViewButton>`

| Ort | Datei | Wie |
|---|---|---|
| Rechnungs-Detail (statt der bestehenden Inline-iframe) | `src/routes/rechnungen.$id.tsx` | Iframe entfernen, durch Auge-Button + Dialog ersetzen — Detailseite wird leichter |
| Angebots-Detail (analog) | `src/routes/angebote.$id.tsx` | dito |
| Rechnungs-Liste — Spalte „Aktionen" | `src/routes/rechnungen.tsx` | Eye-Icon-Button neben Status |
| Angebots-Liste | `src/routes/angebote.tsx` | dito |
| Mahnungen-Liste | `src/routes/mahnungen.tsx` | bereits `useRechnungPdf` da — Auge-Button hinzufügen |
| Dauerauftrag-Läufe (zukünftige erzeugte Rechnungen) | `src/routes/dauerauftraege.$id.tsx` | wenn Lauf-Rechnung existiert, Auge zeigen |
| Kunden-Detail → Tab Rechnungen/Angebote | `src/routes/kunden.$id.tsx` | dito |

In den Detailseiten wird die bestehende fest verbaute iframe-Vorschau durch den schlankeren Eye-Button + Dialog ersetzt — die Detailseite wird kürzer und mobil viel angenehmer.

---

## Geänderte / neue Dateien

**Neu**
- `src/components/pdf/PdfViewerDialog.tsx`
- `src/components/pdf/PdfViewButton.tsx`
- `src/components/pdf/DriveStatusBadge.tsx`
- `src/lib/pdf/pdfjsWorker.ts` (Worker-Setup, einmaliger Import)

**Bearbeitet**
- `src/lib/api/types.ts` — `DriveSyncInfo`, `Angebot.drive?`, `Rechnung.drive?`
- `src/routes/rechnungen.$id.tsx` — Inline-iframe → PdfViewButton
- `src/routes/angebote.$id.tsx` — dito
- `src/routes/rechnungen.tsx` — Eye-Spalte
- `src/routes/angebote.tsx` — Eye-Spalte
- `src/routes/mahnungen.tsx` — Eye-Button
- `src/routes/dauerauftraege.$id.tsx` — Eye-Button bei Läufen
- `src/routes/kunden.$id.tsx` — Eye-Buttons in den Listen-Tabs
- `package.json` — `react-pdf` + `pdfjs-dist`

---

## Was es NICHT ändert

- E-Mail-Versand-Dialog hat bereits eine eigene iframe-Vorschau für den Anhang — bleibt unangetastet.
- Keine echte Drive-Synchronisation (Backend-Pi-Phase). Status-Badge zeigt bis dahin nur „Lokal" — sobald das Backend `drive.fileId` setzt, wird der Badge automatisch grün.
- Kein neues Theme, kein neues Icon-Set, kein Sparkles-Glitter. 

---

Sag „los" und ich baue.