## Problem

Beim Öffnen von `/einstellungen` auf dem Pi (localhost:8787 über SSH-Tunnel) crasht die Seite mit:

```
TypeError: undefined is not an object (evaluating 't.unterordnerSchema.rechnungen')
```

## Ursache

`GoogleDriveTab.tsx` greift direkt auf `form.unterordnerSchema.rechnungen`, `form.dateinameSchema.rechnung` usw. zu. Liefert das Backend (z. B. ältere Pi-Release-Version oder ein noch nie gespeicherter Settings-State) eines dieser Objekte als `undefined`, knallt der ganze Tab — und damit die komplette Settings-Seite — weg. Genau das passiert gerade: der bundle-Hash im Stack (`einstellungen-CpFwLczC.js`) gehört zu einer älteren Pi-Version, deren `/einstellungen/google-drive`-Response diese Felder noch nicht enthält.

Das hat nichts mit dem OAuth-Tunnel-Setup zu tun. Dein Tunnel auf `localhost:8787` ist genau der richtige Weg, weil Google nur `localhost` oder eine öffentliche Domain als Redirect-URI akzeptiert. Sobald die Seite nicht mehr crasht, kannst du normal verbinden.

## Lösung (rein Frontend, eine Datei)

### `src/components/einstellungen/GoogleDriveTab.tsx`

1. Konstanten `DEFAULT_FOLDERS` und `DEFAULT_FILES` einführen (identisch zum Backend in `backend/src/routes/drive.ts`):
   - `rechnungen: "Rechnungen/{YYYY}/{MM}"`, `angebote: "Angebote/{YYYY}/{MM}"`, `dokumente: "Dokumente/{YYYY}/{MM}"`, `protokollUebergabe`, `protokollSchluessel`
   - `rechnung`, `angebot`, `protokoll`
2. Kleine Helper-Funktion `normalize(data)`, die das eingehende `GoogleDriveEinstellungen`-Objekt unkaputtbar macht:
   - `rootOrdnerName ??= "mycleancenter.cm"`
   - `unterordnerSchema = { ...DEFAULT_FOLDERS, ...(data.unterordnerSchema ?? {}) }`
   - `dateinameSchema = { ...DEFAULT_FILES, ...(data.dateinameSchema ?? {}) }`
   - `autoUpload ??= true`
3. Im `useEffect`, der `form` aus `data` setzt, durch `normalize(data)` ersetzen.
4. `dirty`-Vergleich gegen die normalisierte Variante laufen lassen, damit kein Phantom-Dirty entsteht.
5. Optional: alle JSX-Zugriffe zusätzlich mit `?.` absichern (`form.unterordnerSchema?.rechnungen ?? ""`), als zweiter Sicherheitsnetz für künftige Backend-Änderungen.

### Keine Backend-Änderungen

`backend/src/routes/drive.ts` liefert bereits sauber gemergte Defaults. Der Crash kommt von alten Pi-Builds — der Frontend-Fix verhindert ihn dauerhaft, egal welche Backend-Version läuft.

## Was du danach tust

1. Neuen Release-Build aufs Pi spielen (damit dieser Frontend-Fix wirkt).
2. Tunnel zu `localhost:8787` aufmachen.
3. Einstellungen → Google Drive → „Mit Google verbinden" — sollte jetzt ohne Crash durchlaufen.
4. Redirect-URI in der Google Cloud Console: `http://localhost:8787/einstellungen/google-drive/callback` (kein zusätzlicher Port nötig — `8080` kannst du wieder rausnehmen, weil das Backend auf `8787` läuft und den Callback dort empfängt).

## Scope-Grenzen

- Nur `src/components/einstellungen/GoogleDriveTab.tsx` wird geändert.
- Kein Daten-Verzeichnis, kein Backup-/Restore-/Update-Flow, kein E-Mail-Code wird berührt.
