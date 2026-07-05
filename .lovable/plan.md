## Problem

Der Build bricht in Schritt 2/6 ab. Ursache: `scripts/ensure-lightningcss-native.mjs` liest die lightningcss-Version mit `require("lightningcss/package.json")`. Neuere `lightningcss`-Versionen erlauben diesen Subpath nicht mehr über das `exports`-Feld → Node wirft `ERR_PACKAGE_PATH_NOT_EXPORTED`. Dadurch wird das ARM64-Native-Binary auf dem Pi nie nachinstalliert und der Frontend-Build schlägt fehl.

## Fix

`scripts/ensure-lightningcss-native.mjs` so anpassen, dass die Version ohne `exports`-Restriktion gelesen wird:

- statt `require("lightningcss/package.json")` den Pfad via `require.resolve("lightningcss")` auflösen, das nächstgelegene `package.json` mit `node:fs` lesen und `version` daraus parsen.
- Fallback: wenn die Version nicht ermittelbar ist, `lightningcss-linux-arm64-gnu` ohne Version-Pin (`@latest` bzw. ohne Suffix) installieren, damit der Build trotzdem durchläuft.
- Rest des Scripts (ARM64-Check, `require.resolve` des Native-Pakets, `npm install --no-save`) bleibt unverändert.

## Nach dem Merge auf dem Pi

Der User führt einfach nochmal `mcc-update` aus — der neue Clone enthält das gefixte Script, und Schritt 2/6 läuft durch.

Keine weiteren Änderungen an Deploy-Scripts, Repo-URL oder Daten notwendig.