## Ziel

Beim Klick auf „Drucken":
- Neuer Tab öffnet sich (wie bisher, nötig für sauberen PDF-Druck in Safari)
- Druckdialog erscheint **automatisch**, ohne dass der User Cmd+P drücken muss
- Nach „Drucken" oder „Abbrechen" schließt sich der Tab **automatisch**
- Funktioniert auf macOS-Safari **und** auf iPhone/iPad-Safari (dort AirPrint-Dialog)
- Falls etwas schiefgeht: sauberer Fallback auf den jetzigen Zustand (User drückt Cmd+P selbst)

## Umsetzung

### 1. Druck-Tab-Inhalt umbauen (`src/lib/pdf/printBlob.ts`)
Statt im neuen Tab direkt die PDF-Blob-URL zu setzen, wird eine winzige selbst gebaute HTML-Hülle geladen. Diese Hülle:

- bettet das PDF bildschirmfüllend ein (eigener PDF-Viewer-Tab-Look bleibt)
- wartet bis das PDF wirklich gerendert ist
- ruft dann automatisch den nativen Druckdialog auf
- horcht auf den Abschluss des Druckdialogs und schließt den Tab

Die HTML-Hülle wird per `document.write` in das schon im User-Klick geöffnete Fenster geschrieben — so bleibt der Tab dem User-Klick zugeordnet (Safari erlaubt Auto-Print nur dann).

### 2. Timing für „PDF ist wirklich da"
Damit der Druckdialog nicht erscheint, bevor Safari die PDF-Seiten gerendert hat (sonst druckt Safari ein leeres Blatt), warte ich auf eine Kombination aus:

- `load`-Event des PDF-Einbettungselements
- kurze zusätzliche Sicherheitsverzögerung
- Sichtbarkeitsprüfung des Tabs (Auto-Print nur im aktiven Tab)

Erst danach wird der Druck angestoßen.

### 3. Auto-Close nach Druck
Sobald der Druckdialog geschlossen wird (egal ob „Drucken" oder „Abbrechen"), schließt sich der Tab. Mechanik:

- bevorzugt `afterprint`-Event
- Backup über Fokus-Wechsel-Erkennung (für Browser, die `afterprint` nicht zuverlässig feuern)
- harter Sicherheits-Timeout, der den Tab nach längerer Inaktivität schließt

Wenn der Browser das Schließen verweigert (sehr selten), bleibt der Tab einfach offen — kein Crash, kein Fehler.

### 4. iPhone / iPad
Auf iOS funktioniert derselbe Mechanismus:
- Tab öffnet sich
- automatischer Druckaufruf → iOS zeigt den AirPrint-/Share-Dialog
- nach Abschluss schließt sich der Tab

Da iOS-Safari beim automatischen Druck strenger ist, baue ich den Pfad robust: Klappt das Auto-Print nicht, bleibt das PDF im Tab sichtbar und der User kann manuell über das Teilen-Menü drucken — genau wie heute.

### 5. Chrome/Firefox bleiben unberührt
Diese drucken weiterhin im aktuellen Tab über das bestehende Iframe-Verfahren. Kein neuer Tab, keine Änderung.

### 6. Saubere Fehler- und Abbruch-Pfade
- Druck schlägt fehl → Tab bleibt offen mit sichtbarem PDF + Hinweis „Bitte manuell drucken"
- User schließt den Tab selbst, bevor der Druckdialog kommt → keine Folgefehler
- Popup-Blocker greift trotz User-Geste → Toast mit Erklärung, kein stiller Fail

## Technische Details

**Geänderte Dateien:**
- `src/lib/pdf/printBlob.ts` — Safari-Pfad: HTML-Hülle mit eingebettetem PDF + Auto-`print()` + Auto-`close()` statt direkter Blob-URL

**Nicht geändert:**
- `src/components/pdf/PrintButton.tsx` (nutzt die Funktion unverändert, der Tab wird weiterhin synchron im Klick geöffnet)
- Chromium/Firefox-Druckpfad (HTML-Iframe im aktuellen Tab)
- PDF-Erzeugung, Routen, UI

**Warum dieser Ansatz funktioniert:**
- Das Fenster wird **synchron im User-Klick** geöffnet → Safari erlaubt darin `window.print()` ohne Geste
- Die HTML-Hülle gehört uns → wir können auf das PDF-Ladeevent warten und das Timing kontrollieren
- Das PDF bleibt das **original gerenderte PDF** → keine Beschnitt-/Phantomseiten-Probleme

**Bekannte Grenzen (ehrlich):**
- Der Tab ist beim Öffnen für ~0,5–1 Sekunde sichtbar — das lässt sich von Browsern aus nicht verstecken
- In sehr seltenen Safari-Konstellationen wird Auto-`print()` verweigert → dann zeigt der Tab das PDF und der User druckt manuell
- Auf iOS hängt das Verhalten leicht von der iOS-Version ab; der Fallback ist immer ein normaler PDF-Tab