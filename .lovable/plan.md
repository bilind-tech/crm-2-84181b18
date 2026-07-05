## Do I know what the issue is?

Ja.

## Was das Problem wirklich ist

Der Raspberry Pi läuft beim Befehl `mcc-update` sehr wahrscheinlich noch mit dem lokal installierten alten Update-Script. Deshalb wurde mein letzter Fix in `backend/deploy/update.sh` nicht ausgeführt.

Das sieht man am Log: Nach `rebuilt dependencies successfully` müsste bei meinem Fix noch ein `npm install ... lightningcss-linux-arm64-gnu` passieren. Das passiert nicht, danach startet direkt `vite build`.

Zusätzlich ist der ursprüngliche Fehler ein bekanntes npm/optional-dependency-Problem: `lightningcss` braucht auf ARM64 ein natives Paket (`lightningcss-linux-arm64-gnu`). Wenn der Lockfile auf einer anderen Architektur erzeugt wurde oder npm optionale native Pakete nicht korrekt nachzieht, fehlt genau diese `.node`-Datei.

## Plan

1. Nicht mehr nur das externe Pi-Update-Script fixen, weil das alte `mcc-update` dieses Script vor dem Build gar nicht aktualisiert.
2. Stattdessen einen `prebuild:spa`-Hook in `package.json` ergänzen.
   - `npm run build:spa` führt automatisch vorher `prebuild:spa` aus.
   - Damit greift der Fix auch dann, wenn auf dem Pi noch der alte `mcc-update`-Wrapper läuft.
3. Ein kleines Node-Script hinzufügen, das vor dem SPA-Build prüft:
   - Läuft das System auf Linux ARM64?
   - Ist `lightningcss-linux-arm64-gnu` vorhanden?
   - Falls nein: installiere exakt die passende Version zu `lightningcss` per `npm install --no-save --no-audit --no-fund`.
4. Das bestehende `backend/deploy/update.sh` zusätzlich robuster lassen/erweitern, damit künftige frisch installierte Updater ebenfalls korrekt sind.
5. Prüfen, dass `package.json` den Hook enthält und das Script syntax-valid ist.

## Warum das funktionieren soll

Der Build-Befehl auf dem Pi ist bereits:

```bash
npm run build:spa
```

Npm führt davor automatisch aus:

```bash
npm run prebuild:spa
```

Dieser Hook liegt im neu geklonten Repo und wird daher auch vom alten `mcc-update` geladen.

## Danach auf dem Pi

Nach dem nächsten GitHub-Sync genügt wieder:

```bash
rm -rf /var/tmp/mcc-npm-cache /var/tmp/mcc-build-*
mcc-update
```

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>

<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>