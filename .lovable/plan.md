## Step 11 — Stundenzettel-Persistenz + Pi-Deployment-Feinschliff

Letzter Frontend-Store, der noch in `localStorage` lebt (Stundenzettel-URL), wandert ans Backend — analog zu Step 10. Danach: Alles, was nötig ist, damit das CRM **als systemd-Dienst auf dem Pi** sauber startet, sich selbst aktualisiert, Logs schreibt und nach einem Stromausfall garantiert wieder hochkommt.

---

### Teil A — Stundenzettel-URL aufs Backend (klein, abgeschlossen)

Backend-Schema `stundenzettel.externeUrl` existiert bereits in `backend/src/settings/schemas.ts` und ist via `/einstellungen/bereich/stundenzettel` les-/schreibbar. Frontend nutzt aktuell aber `localStorage` (`src/lib/stundenzettel/config.ts`).

**Änderungen:**

1. **`src/lib/stundenzettel/config.ts`** wird zum dünnen Adapter:
   - `useStundenzettelUrl()` Hook → React Query auf `/einstellungen/bereich/stundenzettel`.
   - `useSetStundenzettelUrl()` Mutation → PATCH gleicher Endpoint, invalidiert Query.
   - Idempotente Migration: wenn `localStorage["mcc.stundenzettel.url"]` gesetzt UND Backend-Wert leer → einmalig pushen, dann `localStorage.removeItem` + Marker `mcc_stundenzettel_migrated_v1`.
   - Alte synchronen Funktionen `getStundenzettelUrl/setStundenzettelUrl` bleiben als Deprecated-Wrapper für SSR/Lazy-Reads — geben Cache-Wert zurück.
2. **`src/routes/stundenzettel.tsx`** + **`src/components/einstellungen/StundenzettelTab.tsx`** auf neue Hooks umstellen. Custom-Event `"stundenzettel-url-changed"` entfällt — React Query macht das automatisch via SSE-Invalidation (`einstellungen:geaendert` triggert bereits `["einstellungen"]`).
3. **Mock-Backend** (`src/lib/mock/backend.ts`): Stundenzettel-Bereich in Settings-Mock-Map ergänzen (falls noch nicht drin).

Damit ist **kein** projektrelevanter Wert mehr in `localStorage` — alle Geräte im LAN sehen denselben Stand.

---

### Teil B — Pi-Deployment-Härtung

Damit das Backend produktiv auf dem Pi läuft, kommen jetzt Deployment-Artefakte ins Repo. Sie liegen unter `backend/deploy/` und werden per System-Update-ZIP (Step 8) mit ausgerollt.

**1. systemd-Unit `backend/deploy/systemd/mycleancenter.service`**

```ini
[Unit]
Description=MyCleanCenter CRM Backend
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=mycleancenter
Group=mycleancenter
WorkingDirectory=/opt/mycleancenter/current/backend
Environment=NODE_ENV=production
Environment=DATA_DIR=/var/lib/mycleancenter
Environment=PORT=8787
Environment=HOST=0.0.0.0
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
RestartSec=3
# Hardening
ProtectSystem=strict
ReadWritePaths=/var/lib/mycleancenter
PrivateTmp=true
NoNewPrivileges=true
ProtectHome=true

[Install]
WantedBy=multi-user.target
```

Wichtig: `/opt/mycleancenter/current` ist **Symlink** auf den aktiven Release-Ordner — System-Update (Step 8) tauscht atomar.

**2. Install-Skript `backend/deploy/install.sh`** (idempotent, einmalig auf einem nackten Pi-OS-Lite ausgeführt):

- Legt User `mycleancenter` an (Systemuser, kein Login-Shell).
- Erstellt `/opt/mycleancenter/`, `/var/lib/mycleancenter/{db,keys,uploads,backups/{daily,weekly,monthly,safety,tmp},logs}` mit korrekten Rechten (`mycleancenter:mycleancenter`, `keys/` als `0700`).
- Installiert Node 20 LTS via NodeSource falls fehlt.
- Kopiert systemd-Unit nach `/etc/systemd/system/`, `daemon-reload`, `enable --now`.
- Setzt logrotate-Config nach `/etc/logrotate.d/mycleancenter` (rotiert `/var/lib/mycleancenter/logs/*.log` daily, keep 14, compress).
- Erkennt erneuten Aufruf (Idempotenz) und überspringt vorhandene Schritte.

**3. Update-Skript `backend/deploy/update-symlink.sh`** wird vom System-Update-Runner (Step 8) aufgerufen statt direkter `fs.rename`-Logik:

- Argumente: `<release-dir>` (frisch entpackter Ordner unter `/opt/mycleancenter/releases/<timestamp>`).
- Validiert Release: `dist/server.js` vorhanden, `package.json` vorhanden, smoke-test `node -e "require('./dist/server.js')"` mit Timeout.
- Speichert vorherigen Symlink-Ziel in `/opt/mycleancenter/previous` (Rollback-Pfad).
- Atomar `ln -sfn <release-dir> /opt/mycleancenter/current` + `systemctl restart mycleancenter`.
- Healthcheck: pollt `http://127.0.0.1:8787/system/health` (siehe Punkt 5) bis 200 oder 30s Timeout. Bei Fehler → Symlink zurück auf `previous`, Restart, Exit-Code ≠ 0.

`backend/src/system/runner.ts` (Step 8) wird so angepasst, dass es im `production`-Modus dieses Skript aufruft (via `child_process.spawn` mit `sudo -n`), im Dev/Test weiterhin in-process bleibt.

**4. Dev-Mode bleibt unverändert.** Im Dev startet `bun run dev` aus dem Repo direkt — keine Symlink-Logik, keine systemd-Calls. Erkennung via `process.env.NODE_ENV === "production"` bzw. `config.nodeEnv`.

**5. Health-Endpoint `GET /system/health`** (neu, ohne Auth):

- Antwortet 200 mit `{ status: "ok", version, uptimeSec, dbReachable: true, maintenanceMode: false }` wenn alles läuft.
- Antwortet 503 wenn `maintenance.flag` existiert (Step 2 — Restore läuft) oder DB-Ping (`SELECT 1`) fehlschlägt.
- Genutzt von: Update-Skript-Healthcheck (Punkt 3), externes Monitoring, Frontend-Statusbalken (siehe Punkt 7).

**6. Strukturiertes Logging**

- `backend/src/logging.ts` neu: dünner Wrapper um `console`, schreibt JSON-Lines parallel nach `${DATA_DIR}/logs/app-YYYY-MM-DD.log` (rolling per Tag, älter als 14 Tage löscht der Logrotate aus Punkt 2).
- Schreibt: `ts`, `level`, `msg`, optionale Felder (`requestId`, `userId`, `route`, `durationMs`).
- Fastify-Hook (`onRequest`/`onResponse`) loggt jeden Request strukturiert. Bestehende `console.log`-Aufrufe in Backend-Modulen werden auf den Wrapper umgestellt (in größerem Sweep, aber inkrementell — keine Verhaltensänderung).
- **Geheimnisse niemals loggen** — Auth-Header, Cookies und Bodies von `/auth/*`, `/einstellungen/*` werden im Hook explizit redacted.

**7. Frontend „Pi-Status"-Indikator**

Kleine, dezente Komponente im AppSidebar-Footer (oder in Einstellungen → System):

- `useSystemHealth()` pollt alle 30s `/system/health`.
- Zeigt grüner Punkt + „Online · v0.2.0" / oranger Punkt + „Wartung läuft" / roter Punkt + „Pi nicht erreichbar".
- Click öffnet Tooltip mit `uptimeSec` (formatiert) und Pi-IP/Hostname.

**8. Doku `backend/deploy/README.md`**

Schritt-für-Schritt für den User (nicht-technisch wo möglich):

1. Pi-OS-Lite flashen (Verweis auf `mem://reference/hardware`).
2. SSH rein, `curl -fsSL <projekt-url>/install.sh | sudo bash` (oder ZIP runterladen + entpacken + `sudo ./install.sh`).
3. Browser auf `http://mycleancenter.local:8787` → Setup-Wizard (existiert seit Step 1) → fertig.
4. Updates: ZIP in der CRM-UI hochladen → Rest läuft automatisch.
5. Backup-Strategie kurz erklärt + Verweis auf Backup-Tab.
6. Troubleshooting: `journalctl -u mycleancenter -f`, `systemctl status mycleancenter`, Logs unter `/var/lib/mycleancenter/logs/`.

---

### Tests

- **`backend/test/health.spec.ts`** — `/system/health` ohne Auth erreichbar, antwortet im Maintenance-Modus 503, im Normalbetrieb 200 mit korrekten Feldern.
- **`backend/test/logging.spec.ts`** — Logger schreibt JSON-Lines, Sensitive-Header werden redacted, Datei-Rotation per Tag.
- **`backend/test/deploy-scripts.spec.ts`** — Shell-Skripte werden mit `bash -n` syntax-geprüft + Smoke-Test gegen Mock-Pfade in `/tmp` (Idempotenz: zweimal install → kein Fehler, keine Doppel-User).
- Bestehende Tests bleiben grün; insbesondere System-Update-Tests (Step 8) brauchen einen Mock für das neue Update-Skript.

---

### Akzeptanzkriterien

1. Stundenzettel-URL ist nach Login aus jedem Browser im LAN identisch sichtbar.
2. Frisch geflashter Pi → `install.sh` einmal → Backend läuft unter `http://mycleancenter.local:8787`, überlebt `sudo reboot`.
3. ZIP-Update via CRM-UI → Symlink wechselt atomar, bei Healthcheck-Fail automatischer Rollback ohne User-Eingriff, vorhandene Daten unangetastet.
4. `/system/health` antwortet ohne Auth, eignet sich für externes Uptime-Monitoring.
5. Logs liegen rotierend unter `/var/lib/mycleancenter/logs/`, enthalten **keine** Passwörter/Tokens.
6. Sidebar zeigt grünen Status-Indikator wenn alles läuft, ändert sich live bei Wartungsmodus.

---

### Dateien

**Neu:**
- `backend/deploy/systemd/mycleancenter.service`
- `backend/deploy/install.sh`
- `backend/deploy/update-symlink.sh`
- `backend/deploy/logrotate.conf`
- `backend/deploy/README.md`
- `backend/src/logging.ts`
- `backend/src/routes/health.ts`
- `backend/test/health.spec.ts`
- `backend/test/logging.spec.ts`
- `backend/test/deploy-scripts.spec.ts`
- `mem/features/pi-deployment.md`

**Geändert:**
- `src/lib/stundenzettel/config.ts` — Adapter auf React Query + localStorage-Migration
- `src/routes/stundenzettel.tsx` — Hooks statt Custom-Event
- `src/components/einstellungen/StundenzettelTab.tsx` — Hooks statt direkter Calls
- `src/lib/mock/backend.ts` — stundenzettel-Bereich falls fehlt + `/system/health`-Mock
- `src/components/layout/AppSidebar.tsx` — kleiner Status-Indikator im Footer
- `src/hooks/useApi.ts` — `useSystemHealth()`, `useStundenzettelUrl()`, `useSetStundenzettelUrl()`
- `backend/src/server.ts` — Health-Route registrieren, Logging-Hook
- `backend/src/system/runner.ts` — Production-Branch ruft `update-symlink.sh` statt In-Process-Switch
- `mem/index.md` — neuer Eintrag „Pi-Deployment"

Sag „weiter", dann setze ich Step 11 um.
