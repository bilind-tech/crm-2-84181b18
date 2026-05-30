# Plan: Safari-Druck-Tab reparieren

## Ziel
Der neue Druck-Tab darf nie mehr auf „PDF wird vorbereitet…“ hängen bleiben. Wenn Auto-Drucken klappt, soll der Dialog automatisch erscheinen. Wenn Safari das blockiert, soll wenigstens immer die PDF sichtbar sein und manuell druckbar bleiben.

## Ursache
Der aktuelle Ansatz koppelt zu viel Logik an die HTML-Hülle im neuen Tab:

- Das Tab wird per `document.write(...)` mit **inline Script** initialisiert.
- Dieses Script soll später den Blob übernehmen, auf `iframe.load` warten und dann `window.print()` starten.
- In Safari/WebKit ist genau dieser Handshake fragil: Script/Ladeereignis läuft offenbar nicht zuverlässig, dadurch bleibt nur der Ladezustand stehen.

Kurz: **Die Steuerung im Child-Tab ist der instabile Teil.**

## Umsetzung

### 1. Child-Tab stark vereinfachen
Datei: `src/lib/pdf/printBlob.ts`

Die neue Tab-Seite wird zu einer **dummen statischen Shell** ohne komplexe eigene Logik:

- Ladezustand
- optional sichtbarer PDF-Frame
- Hinweistext für manuellen Druck
- Fehlerzustand

Kein wesentlicher Ablauf mehr im Child-Script.

### 2. Gesamte Orchestrierung in den Haupttab ziehen
Dateien: `src/lib/pdf/printBlob.ts`, `src/components/pdf/PrintButton.tsx`

Der Haupttab steuert den gesamten Safari-Druckpfad:

- Tab synchron im Klick öffnen
- sofort statische Ladeansicht hineinschreiben
- nach Blob-Erzeugung PDF-URL in den Druck-Tab einsetzen
- den Tab fokussieren
- nach einem festen Sicherheitsdelay `winRef.print()` direkt vom Haupttab aus versuchen

Damit entfällt der bisher fehleranfällige „Child muss eigenes Script starten“-Pfad.

### 3. Robuste Fallback-Kette statt endlosem Laden
Datei: `src/lib/pdf/printBlob.ts`

Wenn Auto-Drucken nicht sauber anspringt:

- Ladezustand wird beendet
- PDF bleibt sichtbar
- klarer Hinweis: manuell drucken
- kein ewiger Spinner

Zusätzlich als letzte Absicherung:
- Falls selbst das Einbetten fehlschlägt, wird der Tab direkt auf die Blob-PDF umgestellt, damit wenigstens die funktionierende manuelle Druckansicht verfügbar ist.

### 4. Auto-Close vorsichtiger machen
Datei: `src/lib/pdf/printBlob.ts`

Aktuell soll sich der Tab nach dem Druck schließen. Das bleibt, aber nur **best effort**:

- Desktop Safari: per `afterprint` versuchen
- iPhone/iPad: deutlich defensiver, weil dort Print-/Share-Lifecycle unzuverlässig ist
- wenn unklar, Tab lieber offen lassen als kaputt schließen

## Verhalten danach

### Desktop Safari
- Klick auf „Drucken“
- neuer Tab öffnet sich mit kurzer Ladeansicht
- PDF erscheint sicher
- Auto-Druck wird versucht
- falls Safari blockiert: PDF bleibt offen und direkt manuell druckbar

### iPhone/iPad
- neuer Tab darf sich öffnen
- PDF soll sichtbar werden
- Auto-Druck/AirPrint wird versucht, aber mit sauberem Fallback
- kein hängender Loader

## Dateien
- `src/lib/pdf/printBlob.ts`
- `src/components/pdf/PrintButton.tsx`

## Technische Details
```text
Alt:
Click -> open tab -> child inline script -> iframe load -> child window.print()

Neu:
Click -> open tab -> static shell -> parent injects PDF -> parent tries winRef.print()
                                      -> if blocked: show PDF + manual print hint
```

## Erfolgskriterium
Der Druck-Tab darf nie dauerhaft nur „PDF wird vorbereitet…“ zeigen. Entweder:
1. der Druckdialog erscheint automatisch, oder
2. die PDF ist sichtbar und manuell druckbar.