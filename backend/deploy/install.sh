#!/usr/bin/env bash
# MyCleanCenter — Pi-Installations-Skript.
# Idempotent: kann beliebig oft erneut ausgeführt werden.
# Erwartet: Raspberry Pi OS Lite (Bookworm oder neuer), root-Rechte.
#
#   sudo ./install.sh                 — Erstinstallation oder Reparatur
#   sudo ./install.sh --check         — nur prüfen, nichts ändern
#
set -euo pipefail

readonly APP_USER="mycleancenter"
readonly APP_GROUP="mycleancenter"
readonly APP_DIR="/opt/mycleancenter"
readonly DATA_DIR="/var/lib/mycleancenter"
readonly SERVICE_NAME="mycleancenter"
readonly STATIC_HOSTNAME="mycleancenter-pi"
readonly PRETTY_HOSTNAME="My Clean Center Pi"

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SYSTEMD_UNIT="$SCRIPT_DIR/systemd/mycleancenter.service"
readonly MDNS_ALIASES_UNIT="$SCRIPT_DIR/systemd/mycleancenter-mdns-aliases.service"
readonly MDNS_ALIAS_UNIT="$SCRIPT_DIR/systemd/mycleancenter-mdns-alias.service"
readonly SUDOERS_FILE="$SCRIPT_DIR/sudoers.d/mycleancenter"
readonly LOGROTATE_FILE="$SCRIPT_DIR/logrotate.conf"

CHECK_ONLY=0
BOOTSTRAP_ZIP=""
DOCTOR=0
USE_SSD=""
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --doctor) DOCTOR=1 ;;
    --use-ssd=*) USE_SSD="${arg#--use-ssd=}" ;;
    --bootstrap=*) BOOTSTRAP_ZIP="${arg#--bootstrap=}" ;;
    -h|--help)
      cat <<EOF
Usage: sudo $0 [--check] [--doctor] [--use-ssd=<mountpoint>] [--bootstrap=<release.zip>]
  --check                   prüft Setup, ohne etwas zu ändern
  --doctor                  führt nur die Diagnose aus (System, mDNS, SSD,
                            Healthcheck, Ports, Backup) — ohne Änderungen
  --use-ssd=<mountpoint>    legt /var/lib/mycleancenter als Symlink auf
                            <mountpoint>/mycleancenter an (USB-SSD-Modus).
                            Existierende Daten werden nach <mountpoint>
                            verschoben (atomar via rsync + Symlink-Swap).
  --bootstrap=<release.zip> entpackt das Release-ZIP nach releases/<stamp>/
                            und setzt den 'current'-Symlink
EOF
      exit 0 ;;
  esac
done

log() { printf "\033[1;36m[install]\033[0m %s\n" "$*"; }
ok()  { printf "\033[1;32m  ✓\033[0m %s\n" "$*"; }
warn(){ printf "\033[1;33m  ⚠\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m  ✗\033[0m %s\n" "$*" >&2; }

require_root() {
  if [[ $EUID -ne 0 ]]; then
    err "Bitte mit sudo ausführen: sudo $0"
    exit 1
  fi
}

# --- USB-SSD-Setup ---------------------------------------------------------
# Wir verschieben /var/lib/mycleancenter NICHT, sondern legen es als Symlink
# auf <mp>/mycleancenter an. Existierende Daten werden vorher per rsync
# kopiert. Der bisherige Ordner wird in /var/lib/mycleancenter.sd-backup
# umbenannt (nicht gelöscht — strikte Daten-Garantie).
ensure_ssd() {
  [[ -z "$USE_SSD" ]] && return 0
  local mp="$USE_SSD"
  if ! mountpoint -q "$mp"; then
    err "USB-SSD-Mount nicht aktiv: $mp ist kein Mountpunkt."
    err "Bitte zuerst mounten, z. B.: sudo mount /dev/sda1 $mp"
    exit 1
  fi
  # Stelle sicher, dass mp NICHT auf der SD-Karte liegt (Root-Device).
  local root_dev mp_dev
  root_dev="$(findmnt -no SOURCE / 2>/dev/null || true)"
  mp_dev="$(findmnt -no SOURCE "$mp" 2>/dev/null || true)"
  if [[ -n "$root_dev" && "$root_dev" == "$mp_dev" ]]; then
    err "USB-SSD-Mount $mp liegt auf demselben Gerät wie / ($root_dev)."
    err "Bitte echte USB-SSD verwenden, sonst landen Daten auf der SD-Karte."
    exit 1
  fi
  local target="$mp/mycleancenter"
  log "USB-SSD aktiv: $mp ($mp_dev) → Datenziel $target"
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "[--check] SSD-Symlink würde gesetzt"
    return 0
  fi
  mkdir -p "$target"
  # Wenn DATA_DIR existiert und KEIN Symlink ist und Inhalte hat → migrieren.
  if [[ -e "$DATA_DIR" && ! -L "$DATA_DIR" ]]; then
    if [[ -n "$(ls -A "$DATA_DIR" 2>/dev/null)" ]]; then
      log "Migriere bestehende Daten von $DATA_DIR nach $target (rsync, NICHT löschen)"
      command -v rsync >/dev/null || apt-get install -y rsync
      rsync -aHAX --info=stats1 "$DATA_DIR/" "$target/"
    fi
    mv "$DATA_DIR" "${DATA_DIR}.sd-backup-$(date +%Y%m%d-%H%M%S)"
    ok "Original /var/lib/mycleancenter gesichert (NICHT gelöscht)"
  fi
  if [[ -L "$DATA_DIR" ]]; then
    local cur
    cur="$(readlink -f "$DATA_DIR")"
    if [[ "$cur" != "$target" ]]; then
      rm -f "$DATA_DIR"
      ln -s "$target" "$DATA_DIR"
    fi
  else
    ln -s "$target" "$DATA_DIR"
  fi
  chown -h "$APP_USER:$APP_GROUP" "$DATA_DIR" 2>/dev/null || true
  ok "/var/lib/mycleancenter → $target (USB-SSD)"
}

ensure_user() {
  if id "$APP_USER" &>/dev/null; then
    ok "User $APP_USER existiert"
  else
    log "Lege System-User $APP_USER an"
    [[ $CHECK_ONLY -eq 1 ]] || useradd --system --shell /usr/sbin/nologin --home "$DATA_DIR" "$APP_USER"
    ok "User $APP_USER erstellt"
  fi
}

ensure_dirs() {
  local dirs=(
    "$APP_DIR"
    "$APP_DIR/releases"
    "$DATA_DIR"
    "$DATA_DIR/db"
    "$DATA_DIR/keys"
    "$DATA_DIR/uploads"
    "$DATA_DIR/logs"
    "$DATA_DIR/backups"
    "$DATA_DIR/backups/daily"
    "$DATA_DIR/backups/weekly"
    "$DATA_DIR/backups/monthly"
    "$DATA_DIR/backups/safety"
    "$DATA_DIR/backups/tmp"
  )
  for d in "${dirs[@]}"; do
    if [[ -d "$d" ]]; then
      ok "Verzeichnis $d vorhanden"
    else
      log "Erstelle $d"
      [[ $CHECK_ONLY -eq 1 ]] || mkdir -p "$d"
    fi
  done
  if [[ $CHECK_ONLY -eq 0 ]]; then
    chown -R "$APP_USER:$APP_GROUP" "$APP_DIR" "$DATA_DIR"
    chmod 0700 "$DATA_DIR/keys"
    chmod 0750 "$DATA_DIR"
    ok "Rechte gesetzt (keys/=0700, data/=0750)"
  fi
}

ensure_node() {
  if command -v node &>/dev/null; then
    local v
    v="$(node --version)"
    ok "Node vorhanden: $v"
    if [[ ! "$v" =~ ^v(20|22|24) ]]; then
      warn "Node-Version ist $v — installiere Node.js 20 LTS."
      if [[ $CHECK_ONLY -eq 1 ]]; then
        return
      fi
      curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
      apt-get install -y nodejs
      ok "Node.js aktualisiert: $(node --version)"
    fi
  else
    log "Installiere Node.js 20 LTS via NodeSource"
    if [[ $CHECK_ONLY -eq 1 ]]; then
      warn "[--check] Node fehlt"
      return
    fi
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
    ok "Node.js installiert: $(node --version)"
  fi
}

ensure_build_tools() {
  log "Installiere Systempakete für Build/Native-Module"
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "[--check] apt-Pakete würden geprüft/installiert"
    return
  fi
  apt-get update
  apt-get install -y git curl ca-certificates unzip python3 make g++ build-essential libsqlite3-dev avahi-daemon avahi-utils libnss-mdns
  ok "Systempakete vorhanden"
}

ensure_mdns() {
  local current
  current="$(hostnamectl --static 2>/dev/null || hostname)"

  if [[ "$current" != "$STATIC_HOSTNAME" ]]; then
    log "Setze Gerätenamen: $PRETTY_HOSTNAME ($STATIC_HOSTNAME.local)"
    if [[ $CHECK_ONLY -eq 0 ]]; then
      hostnamectl set-hostname "$STATIC_HOSTNAME"
      hostnamectl set-hostname --pretty "$PRETTY_HOSTNAME" || true
      if [[ -f /etc/hosts ]]; then
        sed -i -E "s/\b${current}\b/${STATIC_HOSTNAME}/g" /etc/hosts || true
        grep -qE "127\.0\.1\.1\s+${STATIC_HOSTNAME}\b" /etc/hosts || printf "127.0.1.1\t%s\n" "$STATIC_HOSTNAME" >> /etc/hosts
      fi
    fi
  else
    ok "Gerätename aktuell: $STATIC_HOSTNAME.local"
  fi

  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "[--check] Avahi/mDNS würde aktiviert und Alias-Service geprüft"
    return
  fi

  systemctl enable --now avahi-daemon
  ok "mDNS aktiv: http://${STATIC_HOSTNAME}.local:8787"

  # Der zusätzliche Alias-Dienst war fehleranfällig und konnte in eine
  # systemd-Restart-Schleife geraten. Er ist nicht nötig, weil der Pi über
  # IP und den echten Hostnamen erreichbar bleibt. Bestehende Installationen
  # werden hier bereinigt, ohne CRM/Stundenzettel neu zu starten.
  if systemctl list-unit-files mycleancenter-mdns-aliases.service &>/dev/null \
     || [[ -f /etc/systemd/system/mycleancenter-mdns-aliases.service ]]; then
    log "Deaktiviere fehleranfälligen mDNS-Alias-Dienst"
    systemctl disable --now mycleancenter-mdns-aliases.service 2>/dev/null || true
    rm -f /etc/systemd/system/mycleancenter-mdns-aliases.service
    systemctl daemon-reload
    systemctl reset-failed mycleancenter-mdns-aliases.service 2>/dev/null || true
    ok "mDNS-Alias-Dienst deaktiviert; kein Restart-Loop mehr"
  else
    ok "mDNS-Alias-Dienst ist nicht installiert"
  fi

  # Stabiler Alias `mycleancenter.local` via gehärtetem Single-Name-Service.
  # StartLimitBurst=3 / RestartSec=60 → niemals wieder Hot-Loop.
  if [[ -f "$MDNS_ALIAS_UNIT" ]]; then
    install -m 0644 "$MDNS_ALIAS_UNIT" /etc/systemd/system/mycleancenter-mdns-alias.service
    systemctl daemon-reload
    systemctl enable mycleancenter-mdns-alias.service >/dev/null 2>&1 || true
    systemctl restart mycleancenter-mdns-alias.service || warn "mDNS-Alias konnte nicht gestartet werden — IP-Zugriff bleibt möglich"
    ok "mDNS-Alias mycleancenter.local aktiviert (gehärtet, kein Loop)"
  fi
}

install_systemd_unit() {
  if [[ ! -f "$SYSTEMD_UNIT" ]]; then
    err "systemd-Unit fehlt: $SYSTEMD_UNIT"
    exit 2
  fi
  if [[ -f "/etc/systemd/system/${SERVICE_NAME}.service" ]] \
     && cmp -s "$SYSTEMD_UNIT" "/etc/systemd/system/${SERVICE_NAME}.service"; then
    ok "systemd-Unit aktuell"
    return
  fi
  log "Installiere systemd-Unit nach /etc/systemd/system/${SERVICE_NAME}.service"
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "[--check] Unit würde geschrieben"
    return
  fi
  install -m 0644 "$SYSTEMD_UNIT" "/etc/systemd/system/${SERVICE_NAME}.service"
  systemctl daemon-reload
  systemctl enable "$SERVICE_NAME"
  ok "systemd-Unit installiert + enabled"
}

install_sudoers() {
  if [[ ! -f "$SUDOERS_FILE" ]]; then
    warn "sudoers-Datei fehlt: $SUDOERS_FILE"
    return
  fi
  local target="/etc/sudoers.d/mycleancenter"
  if [[ -f "$target" ]] && cmp -s "$SUDOERS_FILE" "$target"; then
    ok "sudoers-Eintrag aktuell"
    return
  fi
  log "Installiere sudoers-Eintrag"
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "[--check] sudoers würde geschrieben"
    return
  fi
  install -m 0440 -o root -g root "$SUDOERS_FILE" "$target"
  visudo -cf "$target" >/dev/null
  ok "sudoers installiert + validiert"
}

install_logrotate() {
  if [[ ! -f "$LOGROTATE_FILE" ]]; then
    warn "logrotate-Datei fehlt: $LOGROTATE_FILE"
    return
  fi
  local target="/etc/logrotate.d/mycleancenter"
  if [[ -f "$target" ]] && cmp -s "$LOGROTATE_FILE" "$target"; then
    ok "logrotate-Config aktuell"
    return
  fi
  log "Installiere logrotate-Config"
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "[--check] logrotate würde geschrieben"
    return
  fi
  install -m 0644 "$LOGROTATE_FILE" "$target"
  ok "logrotate installiert"
}

bootstrap_release() {
  [[ -z "$BOOTSTRAP_ZIP" ]] && return
  if [[ ! -f "$BOOTSTRAP_ZIP" ]]; then
    err "Bootstrap-ZIP nicht gefunden: $BOOTSTRAP_ZIP"
    exit 3
  fi
  # SICHERHEITS-BACKUP der Daten BEVOR irgendetwas am Code passiert.
  # Niemals an /var/lib/mycleancenter anfassen außer in diesem kontrollierten
  # Pfad — das ist die oberste Regel.
  if [[ -d "$DATA_DIR/db" ]] && compgen -G "$DATA_DIR/db/*.db" >/dev/null 2>&1; then
    local safety_dir="$DATA_DIR/backups/safety"
    local ts="$(date +%Y%m%d-%H%M%S)"
    local safety_file="$safety_dir/pre-install-$ts.tgz"
    log "Erzeuge Sicherheits-Backup vor Code-Wechsel: $safety_file"
    if [[ $CHECK_ONLY -eq 0 ]]; then
      mkdir -p "$safety_dir"
      # NUR lesen aus DATA_DIR, NUR schreiben in safety_dir.
      tar --warning=no-file-changed -czf "$safety_file" -C "$DATA_DIR" db keys 2>/dev/null || \
        warn "Sicherheits-Backup nicht vollständig (DB evtl. in Benutzung) — fortfahren auf eigene Gefahr"
      chown "$APP_USER:$APP_GROUP" "$safety_file" 2>/dev/null || true
      chmod 0600 "$safety_file" 2>/dev/null || true
    fi
  fi

  # Atomarer Release-Wechsel via Timestamp-Ordner + Symlink-Switch.
  local ts="$(date +%Y%m%d-%H%M%S)"
  local target="$APP_DIR/releases/$ts"
  log "Entpacke $BOOTSTRAP_ZIP nach $target"
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "[--check] Bootstrap würde entpackt"
    return
  fi
  command -v unzip >/dev/null || apt-get install -y unzip
  mkdir -p "$target"
  unzip -q "$BOOTSTRAP_ZIP" -d "$target"
  chown -R "$APP_USER:$APP_GROUP" "$target"
  ok "Release entpackt"

  # Vorgänger merken (für Rollback), ältere Releases entfernen.
  if [[ -L "$APP_DIR/current" ]]; then
    local prev
    prev="$(readlink -f "$APP_DIR/current")"
    if [[ -d "$prev" && "$prev" != "$target" ]]; then
      ln -sfn "$prev" "$APP_DIR/previous"
      ok "Rollback-Pfad: $APP_DIR/previous → $prev"
    fi
  fi
  ln -sfn "$target" "$APP_DIR/current.new"
  mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"
  ok "Symlink current → $target (atomar)"

  # Alte Releases aufräumen — nur current und previous bleiben.
  local keep1 keep2
  keep1="$(readlink -f "$APP_DIR/current" 2>/dev/null || true)"
  keep2="$(readlink -f "$APP_DIR/previous" 2>/dev/null || true)"
  for r in "$APP_DIR/releases"/*/; do
    r="${r%/}"
    [[ "$r" == "$keep1" || "$r" == "$keep2" ]] && continue
    log "Entferne alten Release: $r"
    rm -rf "$r"
  done
}

install_backend_deps() {
  local be_dir="$APP_DIR/current/backend"
  [[ ! -f "$be_dir/package.json" ]] && return
  log "Installiere Backend-Dependencies (npm ci --omit=dev)"
  if [[ $CHECK_ONLY -eq 1 ]]; then
    warn "[--check] npm ci würde laufen"
    return
  fi
  if [[ -f "$be_dir/package-lock.json" ]]; then
    sudo -u "$APP_USER" bash -c "cd '$be_dir' && npm ci --omit=dev"
  else
    sudo -u "$APP_USER" bash -c "cd '$be_dir' && npm install --omit=dev --no-audit --no-fund"
  fi
  # Native Module für ARM64 sicherstellen (Pi 5 = aarch64).
  # Wenn Prebuilt fehlt oder beschädigt ist, wird from-source gebaut.
  log "Native Module prüfen (better-sqlite3, @node-rs/argon2)"
  sudo -u "$APP_USER" bash -c "cd '$be_dir' && node -e 'require(\"better-sqlite3\")' 2>/dev/null" || {
    warn "better-sqlite3 nicht ladbar — rebuild from source"
    sudo -u "$APP_USER" bash -c "cd '$be_dir' && npm rebuild better-sqlite3 --build-from-source"
  }
  sudo -u "$APP_USER" bash -c "cd '$be_dir' && node -e 'require(\"@node-rs/argon2\")' 2>/dev/null" || \
    warn "@node-rs/argon2 nicht ladbar — bitte Pi-Architektur prüfen (aarch64 erwartet)"
  ok "Backend-Dependencies installiert"
}

start_service() {
  if [[ $CHECK_ONLY -eq 1 ]]; then
    return
  fi
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    log "Service $SERVICE_NAME läuft bereits — Restart"
    systemctl restart "$SERVICE_NAME"
  else
    log "Starte Service $SERVICE_NAME"
    systemctl start "$SERVICE_NAME" || true
  fi
  log "Healthcheck (max. 30s)"
  local i
  for i in $(seq 1 15); do
    if curl -fsS "http://localhost:8787/health" >/dev/null 2>&1; then
      local hostn="$(hostname).local"
      ok "Service läuft — http://${hostn}:8787"
      # Setup-URL ausgeben, falls Setup-Token noch existiert (Erstinstallation)
      local token_file="$DATA_DIR/keys/setup.token"
      if [[ -f "$token_file" ]]; then
        local token
        token="$(cat "$token_file" 2>/dev/null || true)"
        if [[ -n "$token" ]]; then
          echo ""
          echo "  ════════════════════════════════════════════════════════════"
          echo "  ERSTEINRICHTUNG — diesen Link im Browser öffnen:"
          echo ""
          echo "    http://${hostn}:8787/setup?token=${token}"
          echo ""
          echo "  Token-Datei: $token_file"
          echo "  ════════════════════════════════════════════════════════════"
          echo ""
        fi
      fi
      return
    fi
    sleep 2
  done
  warn "Service antwortet nicht auf /health — prüfe: journalctl -u $SERVICE_NAME -n 80"
}

# --- Doctor: rein lesende Diagnose -----------------------------------------
run_doctor() {
  log "MyCleanCenter Doctor — Diagnose (keine Änderungen)"

  # 1) USB-SSD / Datenpfad
  if [[ -L "$DATA_DIR" ]]; then
    local target dev
    target="$(readlink -f "$DATA_DIR")"
    dev="$(findmnt -no SOURCE "$target" 2>/dev/null || true)"
    ok "Datenpfad: $DATA_DIR → $target  (Gerät: ${dev:-?})"
  elif [[ -d "$DATA_DIR" ]]; then
    local dev root_dev
    dev="$(findmnt -no SOURCE "$DATA_DIR" 2>/dev/null || true)"
    root_dev="$(findmnt -no SOURCE / 2>/dev/null || true)"
    if [[ -n "$dev" && "$dev" == "$root_dev" ]]; then
      warn "Datenpfad liegt auf der SD-Karte ($dev). Empfehlung: --use-ssd=/mnt/data"
    else
      ok "Datenpfad: $DATA_DIR (Gerät: ${dev:-?})"
    fi
  else
    warn "Datenpfad fehlt: $DATA_DIR"
  fi

  # 2) Service-Status
  if systemctl is-active --quiet "$SERVICE_NAME"; then
    ok "Service $SERVICE_NAME läuft"
  else
    err "Service $SERVICE_NAME läuft NICHT (sudo journalctl -u $SERVICE_NAME -n 50)"
  fi

  # 3) Healthcheck
  if curl -fsS "http://localhost:8787/health" >/dev/null 2>&1; then
    ok "Healthcheck localhost:8787 ok"
  else
    err "Healthcheck localhost:8787 fehlgeschlagen"
  fi

  # 4) mDNS
  if systemctl is-active --quiet avahi-daemon; then
    ok "avahi-daemon läuft"
  else
    warn "avahi-daemon läuft nicht — .local-Auflösung deaktiviert"
  fi
  if systemctl is-active --quiet mycleancenter-mdns-alias.service 2>/dev/null; then
    ok "mDNS-Alias mycleancenter.local aktiv"
  else
    warn "mDNS-Alias mycleancenter.local nicht aktiv (IP-Zugriff bleibt möglich)"
  fi
  # Restart-Loop-Check
  local restarts
  restarts="$(systemctl show mycleancenter-mdns-alias.service -p NRestarts --value 2>/dev/null || echo 0)"
  if [[ "${restarts:-0}" =~ ^[0-9]+$ && "${restarts:-0}" -gt 5 ]]; then
    err "mDNS-Alias-Restart-Counter: $restarts — vermutlich Loop. Bitte 'systemctl status mycleancenter-mdns-alias' prüfen"
  fi

  # 5) Ports
  if ss -ltn 2>/dev/null | grep -q ':8787 '; then
    ok "Port 8787 belegt (CRM)"
  else
    warn "Port 8787 ist frei — CRM antwortet nicht"
  fi
  if ss -ltn 2>/dev/null | grep -q ':8080 '; then
    ok "Port 8080 belegt (vermutlich Stundenzettel)"
  else
    warn "Port 8080 ist frei — Stundenzettel-App noch nicht gestartet"
  fi

  # 6) System-Last
  log "System-Last (uptime): $(uptime)"

  # 7) IP / Hostname
  local ip
  ip="$(hostname -I 2>/dev/null | awk '{print $1}')"
  log "Erreichbar voraussichtlich unter:"
  [[ -n "$ip" ]] && log "  http://${ip}:8787"
  log "  http://${STATIC_HOSTNAME}.local:8787"
  log "  http://mycleancenter.local:8787"

  # 8) Backup-Verzeichnis schreibbar?
  if [[ -d "$DATA_DIR/backups/safety" ]]; then
    if sudo -u "$APP_USER" test -w "$DATA_DIR/backups/safety" 2>/dev/null; then
      ok "Backup-Verzeichnis ist beschreibbar"
    else
      err "Backup-Verzeichnis NICHT beschreibbar für $APP_USER"
    fi
  fi

  log "Doctor fertig."
}

main() {
  require_root
  log "MyCleanCenter Setup startet (CHECK_ONLY=$CHECK_ONLY${BOOTSTRAP_ZIP:+, BOOTSTRAP=$BOOTSTRAP_ZIP})"
  if [[ $DOCTOR -eq 1 ]]; then
    run_doctor
    exit 0
  fi
  ensure_user
  ensure_ssd
  ensure_dirs
  ensure_build_tools
  ensure_mdns
  ensure_node
  install_systemd_unit
  install_sudoers
  install_logrotate
  bootstrap_release
  install_backend_deps
  if [[ -d "$APP_DIR/current" || -L "$APP_DIR/current" ]]; then
    start_service
  else
    warn "Kein Code unter $APP_DIR/current — Setup-Wizard kommt nach erstem Code-Deploy."
    warn "Lade die erste CRM-Version per Web-UI hoch, per scp, oder nutze --bootstrap=<release.zip>."
  fi
  log "Fertig."
}

main "$@"
