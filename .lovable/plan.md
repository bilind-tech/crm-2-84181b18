## Ziel

Du scannst den QR. Auf dem Handy:
- Foto aufnehmen oder Datei wählen → **erscheint sofort als Vorschau-Kachel**.
- **Upload startet automatisch** (kein extra „Senden"-Knopf nötig). Pro Kachel siehst du einen Mini-Status: Hochladen → Fertig (grüner Haken) bzw. Fehler (mit „Erneut versuchen").
- Du kannst direkt das nächste Foto knipsen, ohne zu warten.

Am Laptop im Dialog „Vom Handy scannen":
- Jede Datei ploppt **sofort** auf, sobald sie hochgeladen ist (kürzeres Polling + sanfte Animation).
- Zähler + Live-Punkt („verbunden / wartet") bleiben.

## Was vermutlich aktuell hakt

Reproduktion im Mobile-Viewport ergibt zwei Probleme an derselben Datei `src/routes/m.upload.$session.tsx`:

1. **`FileButton` ist innerhalb der Parent-Funktion definiert.** Bei jedem `setDateien` wird die Komponente als neuer Komponententyp behandelt → das echte `<input type="file">` wird unmounted/neu gemountet, was auf iOS Safari die `change`-Verarbeitung instabil macht (sichtbar: Datei „verschwindet" nach Auswahl, keine Vorschau, kein Upload-Button erscheint).
2. **Zwei-Stufen-Flow** („erst sammeln, dann Senden-Knopf") fühlt sich nicht magisch an und ist eine zusätzliche Tap-Hürde, die der User explizit nicht will.

Begleitend: Backend-Ratelimit auf `POST /upload-sessions/:token/dokumente` ist `10/min` — beim schnellen Foto-Stapel kommt 429. Laptop-Polling bei `1.5s` ist okay, aber Live-Push wäre hübscher; Polling auf `1s` reicht aber für „magisch".

## Lösung — Schritt für Schritt

### 1) Mobile-Seite umbauen (`src/routes/m.upload.$session.tsx`)

- `FileButton` **aus** der Render-Funktion herausziehen (Top-Level-Komponente in derselben Datei). Stabiler Komponententyp → iOS verarbeitet `change` zuverlässig.
- Datei-Eintrag um Status erweitern:
  ```ts
  type Status = "wartet" | "laeuft" | "fertig" | "fehler";
  interface DateiEntry {
    id: string; file: File; previewUrl: string; istBild: boolean;
    status: Status; progress: number; fehler?: string;
  }
  ```
- `verarbeite(files)` legt Einträge mit `status: "wartet"` an **und triggert sofort** `starteUpload(entry)` für jeden neuen Eintrag (parallel begrenzt auf max. 2 gleichzeitig — Queue, damit das Ratelimit nicht reißt).
- `starteUpload`:
  - setzt `status: "laeuft"`, ruft `uploadDokumentToSession(token, file, meta)`,
  - bei Erfolg → `status: "fertig"`, kleines Häkchen-Overlay auf der Kachel,
  - bei Fehler → `status: "fehler"`, kleiner „Erneut"-Button auf der Kachel; bei `429` automatisch nach 2s erneut versuchen (max. 3 Versuche).
- Den großen Sticky-„Alle senden"-Button **entfernen**. Stattdessen ein dezenter Footer:
  - `„X von Y gesendet"` + animierter Fortschrittsbalken über alle laufenden Uploads,
  - bei `alle fertig`: grüner Streifen „Fertig — am PC sichtbar. Du kannst weitere Fotos machen.".
- Zwei Primär-Buttons bleiben oben groß (Foto / Galerie). Tap-Größe 56 px, Safe-Area-Padding behalten.
- Kachel-Overlay-Icons:
  - `wartet` → kleines Uhrzeigersymbol,
  - `laeuft` → Spinner + Prozent (sofern verfügbar — sonst indeterminate),
  - `fertig` → grüner Haken,
  - `fehler` → rotes Dreieck + Tap = Retry.
- Object-URLs werden weiterhin sauber `revokeObjectURL`'t (nach erfolgreichem Upload).

### 2) Per-Datei-Progress mitnehmen

`uploadDokumentToSession` (in `src/lib/dokument/upload.ts`) gibt es schon, nutzt aber `piApi.post` ohne Progress. Variante mit Progress hinzufügen, die intern `postWithProgress` (existiert bereits für `/dokumente`) verwendet:

```ts
export async function uploadDokumentToSessionMitProgress(
  token, file, meta, onProgress, signal,
): Promise<Dokument> { … postWithProgress(`/upload-sessions/${token}/dokumente`, fd, onProgress, signal) }
```

Nur diese neue Funktion auf der Handy-Seite verwenden.

### 3) Backend: Ratelimit etwas lockern

`backend/src/routes/dokumente.ts`, Route `POST /upload-sessions/:token/dokumente`:
- `rateLimit: { max: 60, timeWindow: "1 minute" }` (60 Uploads/min reicht für realistische Foto-Sessions, ohne Tor für Missbrauch zu öffnen — Token läuft ohnehin ab und ist Einmal-Sitzung).

Alles andere (Token-Validierung, MIME-Whitelist, Größe, `isSessionUploadable`) bleibt unverändert.

### 4) Laptop-Dialog (`src/components/dokumente/HandyScanDialog.tsx`)

- Polling-Intervall in `useUploadSessionLive` von `1500ms` auf `1000ms` senken — fühlt sich „live" an, ohne den Pi zu stressen.
- Sanfte Einblend-Animation (`animate-in fade-in zoom-in-95`) auf neuen Thumbnails: vergleicht vorherige `dateien.length` mit aktueller, neue Items bekommen Animation einmalig.
- Statuszeile bleibt; Zähler aktualisiert sich live.

### 5) Verifikation

- Im Browser Mobile-Viewport (iPhone) `/m/upload/<token>` öffnen, Foto aus Galerie wählen → Kachel erscheint sofort, Spinner → grüner Haken in <2s.
- Am Laptop parallel den Dialog offen halten → Thumbnail erscheint binnen 1s nach „fertig".
- Mehrfach-Auswahl (3–5 Bilder) → alle queuen sich, max. 2 parallel, alle landen ohne 429.
- Flugmodus an während Upload → Kachel zeigt „Erneut versuchen", Tap funktioniert.

## Was *nicht* angefasst wird

- Datenmodell `dokumente` / `upload_sessions` (Schema bleibt identisch).
- Auth, Lockscreen, Daten in `/var/lib/mycleancenter`.
- Andere Upload-Pfade (Drag-Drop am Laptop, normale `/dokumente`-Route).

## Technische Details (für später beim Bauen)

- Parallel-Limit: einfache `runningCount` State + `useEffect`, der wartende Einträge startet, sobald `runningCount < 2`.
- Retry bei 429: `error.status === 429` → `setTimeout(() => starteUpload(entry), 2000)`, Versuchszähler im Entry.
- `previewUrl` für PDFs leer → Fallback-Kachel mit `FileText` bleibt wie heute.
- Komprimierung (`compressImage`) bleibt in `prepareUpload`, läuft jetzt automatisch beim Auto-Start.
- Keine neuen Dependencies.

## Dateien, die geändert werden

- `src/routes/m.upload.$session.tsx` — Hauptumbau (Auto-Upload, Per-Kachel-Status, FileButton extrahiert).
- `src/lib/dokument/upload.ts` — neue Funktion `uploadDokumentToSessionMitProgress`.
- `src/components/dokumente/HandyScanDialog.tsx` — Polling 1s + Einblend-Animation.
- `backend/src/routes/dokumente.ts` — Ratelimit `10 → 60` für Token-Upload.
