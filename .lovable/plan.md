Der neue Fehler ist kein Build-Fehler im Code mehr: Frontend und native ARM64-Bindings laufen jetzt durch. Das Backend scheitert beim Paket-Download, weil der persistente npm-Cache unter `/var/tmp/mcc-npm-cache` beschädigte/halb geschriebene Cache-Dateien enthält (`_cacache ... ENOENT`, viele „tarball data seems to be corrupted“).

Do I know what the issue is? Ja: Das Update-Skript verwendet einen wiederverwendeten npm-Cache. Wenn der einmal kaputt ist oder ein Download abbricht, kann jedes spätere `mcc-update` an zufälligen Paketen scheitern.

Plan:

1. `backend/deploy/update.sh` anpassen
   - Den persistenten Cache `/var/tmp/mcc-npm-cache` nicht mehr als Standard verwenden.
   - Stattdessen pro Update einen frischen Cache unter dem Build-Ordner verwenden, z. B. `/var/tmp/mcc-build-<pid>/.npm-cache`.
   - Der Cache liegt weiterhin auf der SSD, nicht im RAM-`/tmp`, und wird mit dem Build-Verzeichnis automatisch gelöscht.

2. npm-Install robuster machen
   - Für Frontend- und Backend-Install dieselben sicheren npm-Optionen verwenden.
   - Retry-/Timeout-Werte setzen, damit kurze Netzwerkprobleme auf dem Pi weniger schnell abbrechen.
   - Optional `--prefer-online` nutzen, damit npm nicht versucht, kaputte lokale Cache-Einträge wiederzuverwenden.

3. Alte redundante LightningCSS-Speziallogik im Update-Skript entfernen
   - Die ARM64-Native-Bindings werden jetzt bereits sauber über `scripts/ensure-lightningcss-native.mjs` installiert.
   - Dadurch vermeiden wir doppelte/alte Logik.

4. Daten-Sicherheitsregel bleibt unverändert
   - Es wird nur das Update-Skript geändert.
   - `/var/lib/mycleancenter/` wird nicht angefasst.

Nach dem Fix sollte der nächste `mcc-update` mit frischem npm-Cache laufen. Falls auf dem Pi bereits ein kaputter Cache liegt, kann er danach zusätzlich einmalig entfernt werden, aber das Skript soll künftig nicht mehr davon abhängig sein.