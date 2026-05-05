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

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly SYSTEMD_UNIT="$SCRIPT_DIR/systemd/mycleancenter.service"
readonly SUDOERS_FILE="$SCRIPT_DIR/sudoers.d/mycleancenter"
readonly LOGROTATE_FILE="$SCRIPT_DIR/logrotate.conf"

CHECK_ONLY=0
BOOTSTRAP_ZIP=""
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --bootstrap=*) BOOTSTRAP_ZIP="${arg#--bootstrap=}" ;;
    -h|--help)
      cat <<EOF
Usage: sudo $0 [--check] [--bootstrap=<release.zip>]
  --check                  prüft Setup, ohne etwas zu ändern
  --bootstrap=<release.zip> entpackt das Release-ZIP nach releases/initial/
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
  apt-get install -y git curl ca-certificates unzip python3 make g++ build-essential libsqlite3-dev
  ok "Systempakete vorhanden"
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

main() {
  require_root
  log "MyCleanCenter Setup startet (CHECK_ONLY=$CHECK_ONLY${BOOTSTRAP_ZIP:+, BOOTSTRAP=$BOOTSTRAP_ZIP})"
  ensure_user
  ensure_dirs
  ensure_build_tools
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
