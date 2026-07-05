## Ziel

Wenn beim Erstellen/Bearbeiten eines Angebots oder einer Rechnung ein Objekt des Kunden ausgewählt ist, soll dessen Name im Empfänger-Block links oben **direkt unter dem Kunden-/Firmennamen** und **über der Adresse** als eigene Zeile erscheinen.

Beispielansicht:

```text
Muster GmbH                ← Firmenname / Kundenname
Max Mustermann             ← Ansprechpartner (falls vorhanden)
Objekt Bahnhofsplatz 12    ← NEU: Objektname (nur wenn Objekt ausgewählt)
Bahnhofsplatz 12
53757 Sankt Augustin
```

## Was geändert wird

1. **Frontend-PDF** (`src/lib/pdf/belegPdf.ts`)
   - Funktion `kundeAdresse(k, ap, o)` liefert die Empfänger-Zeilen. Die Zeile `if (o?.name) lines.push(o.name);` wird geprüft und – falls nötig – so eingesetzt, dass sie **genau zwischen Person/Firmenname und Straße** steht. Reihenfolge final: Firmenname → Ansprechpartner/Kundenperson → **Objektname** → Straße → PLZ Ort → Land.

2. **Backend-PDF** (`backend/src/pdf/layout.ts`)
   - Gleiche Funktion `kundeAdresse(k, ap, o)` – identische Reihenfolge sicherstellen, damit die vom Pi gerenderten PDFs (die auch nach Google Drive hochgeladen werden) exakt dasselbe Layout haben wie die Browser-Vorschau.

3. **Editor-Vorschau** (`src/components/pdf-editor/panels/StammdatenPanel.tsx`)
   - Der Empfänger-Kasten im rechten Editor-Panel zeigt derzeit nur Kundenname + Adresse. Wenn im Beleg ein `objektId` gesetzt ist, wird der Objektname als kleine Zusatzzeile zwischen Name und Adresse eingeblendet (nur Anzeige, kein neues Eingabefeld). Der Text „Zum Ändern: Kundenstammdaten bearbeiten." bleibt.

4. **Keine anderen Änderungen**
   - Keine neuen Abhängigkeiten (kein `bun add`, kein `npm install`).
   - Keine Änderungen an `package.json`, `package-lock.json`, `bun.lock` oder an `scripts/ensure-lightningcss-native.mjs` bzw. `backend/deploy/update.sh`.
   - Keine Datenbank-Migration, keine API-Änderung – `objektId` ist bereits Teil von Angebot/Rechnung, `getObjekt` liefert bereits `name`.
   - Keine Änderung an Empfänger-Adressen-Logik (Objekt-Adresse überschreibt weiterhin die Kundenadresse, wenn gepflegt) – nur die zusätzliche Namenszeile.

## Warum das für `mcc-update` sicher ist

- Es werden ausschließlich TypeScript-Dateien im Quellcode berührt. Der Build-Prozess (`npm ci` + Vite-Build + Backend-Build) läuft unverändert.
- Keine neuen Pakete, kein Lockfile-Diff, keine nativen Bindings – der zuletzt reparierte Update-Pfad (frischer npm-Cache pro Build, `--prefer-online`, `ensure-lightningcss-native.mjs`) bleibt unangetastet.
- Keine Schema-Migration, keine neuen Env-Variablen – `/var/lib/mycleancenter/` bleibt unberührt.

## Verifikation vor Abgabe

- `bun run build` (Frontend) und Backend-Build laufen fehlerfrei.
- Angebots-PDF (Vorschau) mit ausgewähltem Objekt zeigt den Objektnamen in der neuen Zeile; ohne Objekt bleibt der Block unverändert.
- Rechnungs-PDF verhält sich identisch.
- Editor-Panel „Empfänger" zeigt den Objektnamen live, wenn ein Objekt ausgewählt ist.
