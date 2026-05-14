## Diagnose

Der Fehler kommt nicht vom Backup oder vom Symlink, sondern vom Schritt **Frontend-Dependencies**:

`npm ci` bricht ab, weil `package.json` und `package-lock.json` nicht synchron sind. Konkret fehlen neue Abhängigkeiten im Lockfile und `@lovable.dev/vite-tanstack-config` steht im Lockfile noch auf einer älteren Version.

Zusätzlich sieht man: Der GitHub-Update-Pfad lädt offenbar den Repository-Quellstand und baut auf dem Pi. Dadurch ist der Pi auf ein korrektes Root-`package-lock.json` angewiesen.

## Plan

1. **Root-Lockfile synchronisieren**
   - `package-lock.json` passend zu `package.json` aktualisieren.
   - Damit sind neue Pakete wie `pdfmake`, `react-pdf`, `pdfjs-dist`, `qrcode.react`, `jszip` und die Lovable/Vite-Pakete sauber im Lockfile enthalten.

2. **Update-Runner robuster machen**
   - Die bestehende Fallback-Logik (`npm ci` → bei Lockfile-Drift `npm install`) prüfen und so anpassen, dass genau dieser EUSAGE-Fall zuverlässig abgefangen wird.
   - Ziel: Ein leicht veraltetes Lockfile darf künftig nicht mehr den ganzen Update-Lauf abbrechen.

3. **Release-/GitHub-Paket härten**
   - Sicherstellen, dass bei GitHub-Updates die benötigten Root-Dateien (`package.json`, `package-lock.json`) konsistent mitkommen.
   - Wenn ein fertiger Frontend-Build im Paket liegt, soll der Pi nicht unnötig das Frontend neu bauen.

4. **Kurzvalidierung**
   - Keine App-Daten anfassen.
   - Nur Code/Lockfile ändern.
   - Danach kann der nächste Update-Versuch über den Button laufen; das bereits erstellte Sicherheits-Backup bleibt unverändert erhalten.

## Sofort-Hinweis für dein aktuelles System

Die Website läuft laut vorherigem Log wieder. Der aktuelle Fehler ist „nur“ der neue Update-Versuch. Bitte jetzt nicht manuell im Datenordner arbeiten und kein Restore starten — das Backup ist vorhanden und der Fix betrifft nur das Update-Paket bzw. die Installationslogik.