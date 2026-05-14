# Pi-Deployment

Anleitung, um das CRM-Backend auf einem frisch geflashten Raspberry Pi 5 in Betrieb zu nehmen.

## Voraussetzungen

- Raspberry Pi 5 mit USB-SSD (siehe `mem://reference/hardware`)
- Raspberry Pi OS Lite (64-bit, Bookworm oder neuer)
- SSH aktiv, Standard-User `pi` mit sudo-Rechten
- Pi ist im LAN erreichbar per IP; das Install-Skript richtet mDNS automatisch ein.

## Erstinstallation (1-Befehl-Variante)

```bash
# Release-ZIP auf den Pi kopieren
scp dist-release/mycleancenter-v0.2.0.zip pi@mycleancenter.local:~/

# Auf dem Pi: install.sh aus dem ZIP extrahieren und mit --bootstrap starten
ssh pi@mycleancenter.local '
  unzip -p mycleancenter-v0.2.0.zip backend/deploy/install.sh > /tmp/install.sh
  sudo bash /tmp/install.sh --bootstrap=$HOME/mycleancenter-v0.2.0.zip
'
```

## Erstinstallation (manuell, ohne Bootstrap)

```bash
ssh pi@mycleancenter.local
sudo mkdir -p /opt/mycleancenter/releases/initial
sudo unzip -q mycleancenter-v0.2.0.zip -d /opt/mycleancenter/releases/initial
sudo ln -sfn /opt/mycleancenter/releases/initial /opt/mycleancenter/current
sudo bash /opt/mycleancenter/current/backend/deploy/install.sh
```

Das Skript:

- legt System-User `mycleancenter` an
- setzt den Gerätenamen auf `My Clean Center Pi` / `mycleancenter-pi.local`
- aktiviert Avahi/mDNS und veröffentlicht zusätzlich den Alias `mycleancenter.local`
- erzeugt `/var/lib/mycleancenter/{db,keys,uploads,logs,backups/...}`
- installiert Node.js 20 LTS (falls fehlt)
- installiert Backend-Dependencies (`npm ci --omit=dev`) — Native-Module (better-sqlite3, @node-rs/argon2) werden für Pi-Architektur kompiliert
- kopiert die systemd-Unit nach `/etc/systemd/system/mycleancenter.service`
- erlaubt dem Service via `sudoers.d/mycleancenter` den eigenen Restart
- richtet `logrotate` für `/var/lib/mycleancenter/logs/` ein (14 Tage Vorhalt)
- startet den Service (`systemctl enable --now mycleancenter`) + Healthcheck

Nach Erfolg:

```bash
curl http://mycleancenter-pi.local:8787/health
# → {"status":"ok",...}
```

Im Browser dann `http://mycleancenter-pi.local:8787` oder `http://mycleancenter.local:8787` öffnen → Setup-Wizard. Die IP-Adresse bleibt weiterhin parallel erreichbar.

Der Stundenzettel/Timekeeper bekommt bewusst keinen `.local`-Alias durch dieses CRM-Setup. Er kann später separat auf dem Pi laufen und im CRM über seine normale Adresse hinterlegt werden.

## Updates

Updates laufen über die CRM-Web-UI: **Einstellungen → System → Update-Paket hochladen**.

Das Backend:

1. validiert das ZIP (Manifest, Schema-Version, SHA256)
2. erstellt automatisch ein Sicherheits-Backup
3. entpackt nach `/opt/mycleancenter/releases/<timestamp>/`
4. tauscht den `current`-Symlink atomar
5. ruft `sudo systemctl reload mycleancenter` auf
6. macht einen Healthcheck — bei Fehler automatischer Rollback

Die Daten unter `/var/lib/mycleancenter/` werden **nie** angefasst.

## Backups

Konfiguration in der Web-UI (Einstellungen → Backup). Defaults: tägliches SQLite-Snapshot, Rotation 7 daily / 4 weekly / 12 monthly. Speicherort `/var/lib/mycleancenter/backups/`.

Restore ebenfalls über die Web-UI — vor jedem Restore wird automatisch ein Sicherheits-Backup angelegt.

## Troubleshooting

```bash
# Service-Status
sudo systemctl status mycleancenter

# Live-Logs
sudo journalctl -u mycleancenter -f

# Persistente Logs (JSON-Lines)
ls /var/lib/mycleancenter/logs/

# Service neu starten
sudo systemctl restart mycleancenter

# Setup nochmal prüfen, ohne zu ändern
sudo bash /opt/mycleancenter/current/backend/deploy/install.sh --check
```

## Datei-Layout

```
/opt/mycleancenter/
├── current  →  releases/<timestamp>/      (Symlink, atomar getauscht)
├── previous →  releases/<vorgänger>/      (Symlink für Rollback)
└── releases/
    ├── 2026-05-02_103045/
    └── 2026-05-15_120012/

/var/lib/mycleancenter/        ← Daten, NIE durch Updates angefasst
├── db/mycleancenter.db
├── keys/master.key            (0600, root:mycleancenter)
├── uploads/
├── logs/app-YYYY-MM-DD.log
└── backups/
    ├── daily/  weekly/  monthly/
    ├── safety/                (Pre-Update + Pre-Restore)
    └── tmp/
```

## Sicherheit

- `master.key` (`/var/lib/mycleancenter/keys/`) wird beim ersten Start generiert. **Verschlüsselt alle Settings-Geheimnisse** (SMTP-Passwort, Google-Drive-Token). Geht der Key verloren, sind die Geheimnisse unbrauchbar — daher gehört er ins Backup.
- Der Service läuft als unprivilegierter User `mycleancenter` mit systemd-Hardening (`ProtectSystem=strict`, `ReadWritePaths=/var/lib/mycleancenter`, `NoNewPrivileges`).
- Web-UI ist via Cookie-Auth gesichert (Setup-Wizard beim ersten Aufruf).

## Build-Maschine einrichten (für `bun run release`)

Der Release-Builder (`scripts/build-release.ts`) signiert das Manifest mit dem
gleichen `master.key`, den der Pi beim ersten Start generiert hat. Damit das
Backend auf dem Pi das ZIP akzeptiert, muss die Build-Maschine denselben Key
besitzen.

Einmalig:

```bash
mkdir -p ~/.mycleancenter
scp pi@mycleancenter.local:/var/lib/mycleancenter/keys/master.key \
  ~/.mycleancenter/master.key
chmod 0600 ~/.mycleancenter/master.key
```

Anschließend lokal ein neues Release bauen:

```bash
bun run release
# → dist-release/mycleancenter-v0.2.0.zip + .sha256
```

CLI-Flags:
- `--out=<dir>` (default `dist-release/`)
- `--key=<path>` (default `~/.mycleancenter/master.key`)
- `--allow-same-version` (für Test-Builds)
- `--skip-frontend` / `--skip-backend` (Schnell-Iteration)
- `--min-backend=<x.y.z>` setzt minBackendVersion (default = appVersion)

`RELEASE_NOTES.md` (Repo-Root) wird, falls vorhanden, in `manifest.hinweise`
übernommen (max. 4000 Zeichen).

## CI (optional)

Der Builder läuft headless. Für CI:
1. `master.key` als Secret bereitstellen (z. B. `MCC_MASTER_KEY_B64`).
2. In der Pipeline dekodieren, `chmod 0600`, dann `bun run release --key=<pfad>`.
3. ZIP + SHA256 als Artefakt veröffentlichen.
