## Problem

Nach dem lightningcss-Fix bricht der Build jetzt an derselben Stelle für `@tailwindcss/oxide` ab: `Cannot find native binding`. Ursache identisch — `npm ci --ignore-scripts` in `update.sh` überspringt Postinstall-Skripte, wodurch das ARM64-Native-Binary `@tailwindcss/oxide-linux-arm64-gnu` fehlt. Für `lightningcss` haben wir das über das prebuild-Script gelöst; für Tailwind Oxide fehlt der gleiche Mechanismus.

## Fix

`scripts/ensure-lightningcss-native.mjs` zu einem generischen Script umbauen, das mehrere ARM64-Natives sicherstellt:

- Liste der Pakete im Script: `lightningcss` → `lightningcss-linux-arm64-gnu`, `@tailwindcss/oxide` → `@tailwindcss/oxide-linux-arm64-gnu`.
- Für jedes Paar: prüfen ob Native-Binding bereits auflösbar (`require.resolve`), sonst Version aus dem Parent-Paket via `fs`+`package.json`-Walk auslesen (wie beim lightningcss-Fix) und mit `npm install --no-save` nachziehen. Ohne Version-Pin als Fallback.
- Nicht-ARM64 Plattformen: sofort exit 0.
- Datei bleibt unter demselben Pfad, `prebuild:spa` in `package.json` bleibt unverändert.

Optional Aufräumen (kein Muss, aber saubere Sache): den redundanten lightningcss-Block in `backend/deploy/update.sh` entfernen, weil das prebuild-Script das jetzt vollständig übernimmt.

## Nach dem Merge auf dem Pi

`mcc-update` erneut ausführen — Schritt 2/6 installiert dann sowohl das lightningcss- als auch das @tailwindcss/oxide-ARM64-Binary automatisch und der Vite-Build läuft durch.