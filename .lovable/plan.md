# Fix: `npm ci` schlägt im Backend mit „esbuild 0.27.7 vs 0.25.12" fehl

## Was wirklich passiert (Ursache zu 100 % geklärt)

Auf dem Pi läuft `update.sh` so ab:

```
/tmp/mcc-build-XXX/                     ← Root-Repo
├── node_modules/                       ← Schritt 2: npm ci im Root (Frontend-Build)
│   └── @esbuild/linux-arm64 0.25.12    ← kommt von Vite/Rollup-Kette im Frontend
└── backend/
    ├── package.json                    ← will esbuild 0.27.7 (über tsx)
    ├── package-lock.json               ← korrekt mit 0.27.7 + allen @esbuild/* 0.27.7
    └── node_modules/                   ← Schritt 3: npm ci hier
        └── esbuild/install.js          ← läuft als postinstall
```

`esbuild/install.js` macht intern `require.resolve('@esbuild/linux-arm64/package.json')`. Node-Resolution **läuft die Verzeichnisse hoch**: zuerst `backend/node_modules/@esbuild/linux-arm64` — aber dieses Paket wird von npm wegen eines bekannten Bugs mit *optionalen* Plattform-Deps in Mono-Repo-ähnlichen Layouts oft NICHT in den nested Ordner geschrieben, sondern hochgehoben oder gar nicht installiert. Dann findet die Resolution die Datei aus dem **Root** `node_modules/@esbuild/linux-arm64` mit Version **0.25.12** — und exakt diese Binary ruft `install.js` auf. Vergleich mit `package.json` des esbuild-0.27.7 → Mismatch → Abbruch.

Belegt:
- `grep '"@esbuild/linux-arm64"' package-lock.json` → Zeile 6489: `"0.25.12"` (Root)
- `grep '"@esbuild/linux-arm64"' backend/package-lock.json` → `"0.27.7"` (Backend)
- Die Reihenfolge in `update.sh` (Frontend-`npm ci` *vor* Backend-`npm ci` im selben Build-Dir) macht den Konflikt unausweichlich.

Es ist **kein** Fehler im neuen Lockfile. Der gleiche Fehler wäre auch ohne `imapflow` aufgetreten, sobald die Root- und Backend-esbuild-Versionen auseinanderlaufen.

## Fix — eine winzige, chirurgische Änderung in `backend/deploy/update.sh`

Zwischen Schritt 2 (Frontend) und Schritt 3 (Backend) das Root-`node_modules` entfernen. Es wird nach dem Frontend-Build nicht mehr gebraucht (gebaut wird nach `dist-spa/`, das überlebt). Dadurch kann Node-Resolution beim Backend-Postinstall nicht mehr in das Root-Verzeichnis hochlaufen.

Konkret in `backend/deploy/update.sh` direkt vor `==> 3/6  Backend bauen`:

```bash
echo "==> 2b/6  Frontend-node_modules entfernen (verhindert esbuild-Versions-Kollision)"
rm -rf "$BUILD_DIR/node_modules"
```

Das war's. Kein Code-Touch, keine Dep-Änderung, keine Lockfile-Änderung, keine Datenberührung.

### Warum das die ABSOLUT sichere Wahl ist
- `dist-spa/` (Frontend-Output) wurde in Schritt 2 schon erzeugt und liegt parallel — wird in Schritt 5 kopiert.
- `backend/node_modules` wird gleich frisch von `npm ci` aufgebaut — ist von Root unabhängig.
- `/var/lib/mycleancenter/` (Daten) wird in keinem Schritt berührt — die Regel bleibt unberührt.
- Spart zusätzlich Disk im Build-Dir (~300–500 MB), was auf dem Pi nett ist.

## Verifikation vor Auslieferung

1. `bash -n backend/deploy/update.sh` → Syntax ok.
2. Lokal in Sandbox simulieren:
   ```bash
   mkdir -p /tmp/repro/{node_modules/@esbuild/linux-arm64,backend}
   echo '{"version":"0.25.12"}' > /tmp/repro/node_modules/@esbuild/linux-arm64/package.json
   ```
   Nach `rm -rf /tmp/repro/node_modules` ist das Verzeichnis weg → Resolution kann nicht mehr leaken.
3. Auf dem Pi: `sudo /opt/mycleancenter/update.sh` läuft sauber durch Schritt 3 hindurch, postinstall validiert Binary 0.27.7 gegen 0.27.7.

## Was bewusst NICHT angefasst wird

- **`backend/package-lock.json`** — bereits korrekt nach dem letzten Fix.
- **`backend/package.json`** — kein `overrides`-Hack nötig; das Problem ist Layout, nicht Versionsauflösung.
- **Root-`package-lock.json`** — Frontend-esbuild bleibt 0.25.12. Wir wollen das Frontend-Verhalten nicht für ein reines Build-Dir-Aufräumen umstellen.
- **Code, Migrationen, IMAP-Feature, Daten** — alles bleibt wie es ist. IMAP-Append in den Strato-Sent-Ordner geht nach dem nächsten Update wie geplant live.

## Lehre für künftige Pi-Updates

Wenn `update.sh` mehrere `npm ci` in geschachtelten Ordnern desselben Build-Trees laufen lässt, muss zwischen den Schritten das jeweils nicht mehr benötigte `node_modules` entfernt werden — sonst können Postinstall-Skripte (besonders bei Plattform-Binaries wie esbuild, sharp, swc) die falsche Version aus dem Parent-Tree resolven. Wir behalten diese Regel für jeden zukünftigen `update.sh`-Eingriff im Kopf.
