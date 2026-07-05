## Plan

Der Fehler kommt daher, dass `lightningcss` auf dem Raspberry Pi ein natives ARM64-Paket braucht (`lightningcss-linux-arm64-gnu`), dieses aber im aktuellen `package-lock.json` nicht als installierbarer Eintrag vorhanden ist. Dadurch installiert `npm ci` auf dem Pi zwar die normalen Pakete, aber beim Build fehlt die native `.node`-Datei.

## Umsetzung

1. `package-lock.json` so aktualisieren, dass die optionalen LightningCSS-Nativpakete für Linux ARM64 enthalten sind.
2. Sicherstellen, dass `package.json` unverändert bleibt, weil dort die Abhängigkeit bereits indirekt korrekt über Tailwind/Vite kommt.
3. Danach prüfen, dass der Lockfile-Eintrag für `lightningcss-linux-arm64-gnu` vorhanden ist.

## Danach auf dem Raspberry Pi ausführen

```bash
rm -rf /var/tmp/mcc-npm-cache
mcc-update
```

Falls der Pi weiterhin alte Installationsreste nutzt:

```bash
rm -rf /var/tmp/mcc-npm-cache /var/tmp/mcc-build-*
mcc-update
```

## Erwartetes Ergebnis

`npm ci` installiert dann auf dem Pi automatisch das passende ARM64-Paket, und `vite build --config vite.spa.config.ts` kann `lightningcss` laden.