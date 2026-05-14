#!/usr/bin/env bash
# ============================================================================
# MyCleanCenter + Stundenzettel — One-Shot Pi-Setup
# ----------------------------------------------------------------------------
# Frisch geflashter Raspberry Pi 5 (Pi-OS-Lite Bookworm 64-bit) → komplett
# eingerichtet inkl.:
#   • USB-SSD als Datenpfad (/var/lib/mycleancenter → /mnt/data/mycleancenter)
#   • CRM-Backend von GitHub gepullt, gebaut, als systemd-Service auf Port 8787
#   • Stundenzettel-Frontend von GitHub gepullt, gebaut, als systemd-Service
#     auf Port 8787
#   • mDNS-Aliase mycleancenter.local + stundenzettel.local
#   • Reboot-fest (alle Dienste enabled)
#
# Aufruf auf dem Pi (als User `pi` mit sudo):
#
#   curl -fsSL https://raw.githubusercontent.com/<DEIN_USER>/<DEIN_REPO>/main/backend/deploy/setup-pi.sh \
#     | sudo bash -s -- --ssd=/dev/sda1
#
# ODER lokal nach `git clone`:
#   sudo bash backend/deploy/setup-pi.sh --ssd=/dev/sda1
#
# Optionen:
#   --ssd=/dev/sdaX        USB-SSD-Partition, die unter /mnt/data gemountet wird
#                          (weglassen, wenn bereits gemountet oder ohne SSD)
#   --ssd-mount=/mnt/data  Mountpunkt (Default: /mnt/data)
#   --crm-repo=<URL>       Git-URL des CRM-Repos
#                          (Default: aktuell hartkodiert — bitte unten anpassen)
#   --zettel-repo=<URL>    Git-URL des Stundenzettel-Repos
#                          (Default: https://github.com/bilind-tech/timekeeper-hub.git)
#   --branch=main          Branch (Default: main)
#   --skip-crm             Nur Stundenzettel installieren
#   --skip-zettel          Nur CRM installieren
# ============================================================================
set -euo pipefail

# ---- Defaults ---------------------------------------------------------------
CRM_REPO="${CRM_REPO:-https://github.com/bilind-tech/crm-2.git}"
ZETTEL_REPO="https://github.com/bilind-tech/timekeeper-hub.git"
BRANCH="main"
SSD_DEV=""
SSD_MOUNT="/mnt/data"
SKIP_CRM=0
SKIP_ZETTEL=0

for arg in "$@"; do
  case "$arg" in
    --ssd=*)         SSD_DEV="${arg#--ssd=}" ;;
    --ssd-mount=*)   SSD_MOUNT="${arg#--ssd-mount=}" ;;
    --crm-repo=*)    CRM_REPO="${arg#--crm-repo=}" ;;
    --zettel-repo=*) ZETTEL_REPO="${arg#--zettel-repo=}" ;;
    --branch=*)      BRANCH="${arg#--branch=}" ;;
    --skip-crm)      SKIP_CRM=1 ;;
    --skip-zettel)   SKIP_ZETTEL=1 ;;
    -h|--help) sed -n '2,40p' "$0"; exit 0 ;;
  esac
done

log()  { printf "\n\033[1;36m▶ %s\033[0m\n" "$*"; }
ok()   { printf "  \033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "  \033[1;33m⚠\033[0m %s\n" "$*"; }
err()  { printf "  \033[1;31m✗\033[0m %s\n" "$*" >&2; }

[[ $EUID -eq 0 ]] || { err "Bitte mit sudo ausführen."; exit 1; }

# ============================================================================
# 0) Vorab: kaputte npm-Caches im Daten-Verzeichnis säubern (NUR Cache!).
#    Das Daten-Verzeichnis selbst (/mnt/ssd/mycleancenter/db, keys, uploads,
#    backups) wird NIEMALS angefasst.
# ============================================================================
for cache in /var/lib/mycleancenter/.npm /mnt/ssd/mycleancenter/.npm /root/.npm/_cacache/tmp; do
  if [[ -e "$cache" ]]; then
    rm -rf "$cache" 2>/dev/null || true
  fi
done

# ============================================================================
# 1) Systempakete
# ============================================================================
log "Systempakete installieren"
apt-get update -qq
apt-get install -y -qq \
  curl ca-certificates git unzip rsync \
  python3 make g++ build-essential libsqlite3-dev \
  avahi-daemon avahi-utils libnss-mdns
ok "Systempakete OK"

# Node.js 22 LTS (TanStack Start verlangt >=22.12)
if ! command -v node >/dev/null || ! node --version | grep -qE '^v(22|24)\.'; then
  log "Node.js 22 LTS via NodeSource"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs
fi
ok "Node $(node --version), npm $(npm --version)"

# Helper: bevorzugt `npm ci`, fällt bei Lockfile-Drift automatisch auf
# `npm install` zurück, damit das Setup nicht an einem leicht veralteten
# package-lock.json scheitert.
npm_install_safe() {
  if ! npm ci --no-audit --no-fund 2>/dev/null; then
    warn "npm ci fehlgeschlagen (Lockfile-Drift) → npm install"
    npm install --no-audit --no-fund
  fi
}
export -f npm_install_safe warn ok 2>/dev/null || true

# ============================================================================
# 2) USB-SSD mounten + fstab-Eintrag (reboot-fest)
# ============================================================================
if [[ -n "$SSD_DEV" ]]; then
  log "USB-SSD einrichten: $SSD_DEV → $SSD_MOUNT"
  [[ -b "$SSD_DEV" ]] || { err "Block-Device $SSD_DEV existiert nicht. Prüfe mit: lsblk"; exit 2; }

  mkdir -p "$SSD_MOUNT"

  # UUID auslesen → fstab-Eintrag (überlebt Reboots, auch wenn /dev/sdaX wechselt)
  UUID="$(blkid -s UUID -o value "$SSD_DEV" || true)"
  FSTYPE="$(blkid -s TYPE -o value "$SSD_DEV" || true)"
  [[ -n "$UUID" && -n "$FSTYPE" ]] || { err "Konnte UUID/Dateisystem von $SSD_DEV nicht lesen."; exit 2; }

  if ! grep -q "UUID=$UUID" /etc/fstab; then
    printf "UUID=%s  %s  %s  defaults,nofail,noatime  0  2\n" \
      "$UUID" "$SSD_MOUNT" "$FSTYPE" >> /etc/fstab
    ok "fstab-Eintrag ergänzt (UUID=$UUID, $FSTYPE)"
  else
    ok "fstab-Eintrag existiert bereits"
  fi

  systemctl daemon-reload
  mountpoint -q "$SSD_MOUNT" || mount "$SSD_MOUNT"
  ok "SSD gemountet auf $SSD_MOUNT"

  # Sanity: SSD darf NICHT auf SD-Karte zeigen
  ROOT_DEV="$(findmnt -no SOURCE /)"
  MP_DEV="$(findmnt -no SOURCE "$SSD_MOUNT")"
  if [[ "$ROOT_DEV" == "$MP_DEV" ]]; then
    err "$SSD_MOUNT liegt auf demselben Gerät wie / ($ROOT_DEV) — keine echte SSD!"
    exit 2
  fi
fi

# ============================================================================
# 3) Hostname + mDNS
# ============================================================================
log "Hostname auf 'mycleancenter-pi' setzen"
hostnamectl set-hostname mycleancenter-pi
hostnamectl set-hostname --pretty "My Clean Center Pi" || true
grep -qE "127\.0\.1\.1\s+mycleancenter-pi\b" /etc/hosts || \
  printf "127.0.1.1\tmycleancenter-pi\n" >> /etc/hosts
systemctl enable --now avahi-daemon >/dev/null
ok "mDNS aktiv (mycleancenter-pi.local)"

# ============================================================================
# 4) CRM installieren (clone → build → install.sh)
# ============================================================================
if [[ $SKIP_CRM -eq 0 ]]; then
  log "CRM (MyCleanCenter) installieren"
  CRM_SRC="/opt/_src/mycleancenter"
  mkdir -p /opt/_src
  if [[ -d "$CRM_SRC/.git" ]]; then
    git -C "$CRM_SRC" fetch --quiet origin
    git -C "$CRM_SRC" reset --hard "origin/$BRANCH"
  else
    git clone --quiet --depth=1 --branch "$BRANCH" "$CRM_REPO" "$CRM_SRC"
  fi
  ok "CRM-Sourcen aus $CRM_REPO ($BRANCH)"

  log "Frontend bauen (Vite)"
  # WICHTIG: Auf dem Pi liefert Fastify die App als statisches SPA aus
  # (FRONTEND_DIR=/opt/mycleancenter/current/dist). Daher MÜSSEN wir den
  # SPA-Build (vite.spa.config.ts → dist-spa/) verwenden, NICHT den
  # TanStack-Start-SSR-Build (dist/client + dist/server).
  ( cd "$CRM_SRC" && { npm ci --no-audit --no-fund || { echo "↪ npm ci failed, falling back to npm install"; npm install --no-audit --no-fund; }; } && npm run build:spa )
  if [[ ! -f "$CRM_SRC/dist-spa/index.html" ]]; then
    err "SPA-Build fehlgeschlagen — dist-spa/index.html fehlt"
    exit 3
  fi
  ok "Frontend dist-spa/ gebaut"

  log "Backend bauen (TypeScript)"
  ( cd "$CRM_SRC/backend" && { npm ci --no-audit --no-fund || { echo "↪ npm ci failed, falling back to npm install"; npm install --no-audit --no-fund; }; } && npm run build )
  ok "Backend dist/ gebaut"

  # Release-Ordner anlegen + current-Symlink atomar
  STAMP="$(date +%Y%m%d-%H%M%S)"
  REL_DIR="/opt/mycleancenter/releases/$STAMP"
  mkdir -p "$REL_DIR"
  rsync -a --delete \
    --exclude node_modules --exclude .git --exclude dist-spa --exclude dist \
    "$CRM_SRC/" "$REL_DIR/"
  # SPA-Bundle als dist/ in den Release einhängen — das ist FRONTEND_DIR.
  rm -rf "$REL_DIR/dist"
  cp -a "$CRM_SRC/dist-spa" "$REL_DIR/dist"
  # Backend-dist mit übernehmen (wurde von npm run build erzeugt).
  if [[ -d "$CRM_SRC/backend/dist" ]]; then
    rm -rf "$REL_DIR/backend/dist"
    cp -a "$CRM_SRC/backend/dist" "$REL_DIR/backend/dist"
  fi
  # Backend-node_modules werden gleich von install.sh per `npm ci --omit=dev` neu installiert
  ln -sfn "$REL_DIR" /opt/mycleancenter/current.new
  mv -Tf /opt/mycleancenter/current.new /opt/mycleancenter/current
  ok "Release: /opt/mycleancenter/current → $REL_DIR"

  # install.sh übernimmt: User, Dirs, SSD-Symlink, systemd, Healthcheck
  INSTALL_ARGS=()
  [[ -n "$SSD_DEV" ]] && INSTALL_ARGS+=("--use-ssd=$SSD_MOUNT")
  bash /opt/mycleancenter/current/backend/deploy/install.sh "${INSTALL_ARGS[@]}"
fi

# ============================================================================
# 5) Stundenzettel installieren (clone → build → systemd)
# ============================================================================
if [[ $SKIP_ZETTEL -eq 0 ]]; then
  log "Stundenzettel installieren"
  ZETTEL_SRC="/opt/_src/stundenzettel"
  mkdir -p /opt/_src
  if [[ -d "$ZETTEL_SRC/.git" ]]; then
    git -C "$ZETTEL_SRC" fetch --quiet origin
    git -C "$ZETTEL_SRC" reset --hard "origin/$BRANCH"
  else
    git clone --quiet --depth=1 --branch "$BRANCH" "$ZETTEL_REPO" "$ZETTEL_SRC"
  fi
  ok "Stundenzettel-Sourcen aus $ZETTEL_REPO ($BRANCH)"

  log "Stundenzettel bauen (Vite)"
  ( cd "$ZETTEL_SRC" && { npm ci --no-audit --no-fund || { echo "↪ npm ci failed, falling back to npm install"; npm install --no-audit --no-fund; }; } && npm run build )
  ok "Stundenzettel dist/ gebaut"

  # `serve` global installieren (ohne npx-Cache-Probleme unter systemd-Hardening).
  if ! command -v serve >/dev/null 2>&1; then
    npm install -g serve --no-audit --no-fund >/dev/null
  fi
  ok "serve global verfügbar: $(command -v serve)"

  STAMP="$(date +%Y%m%d-%H%M%S)"
  REL_DIR="/opt/stundenzettel/releases/$STAMP"
  mkdir -p "$REL_DIR"
  rsync -a --delete --exclude node_modules --exclude .git "$ZETTEL_SRC/" "$REL_DIR/"
  ln -sfn "$REL_DIR" /opt/stundenzettel/current.new
  mv -Tf /opt/stundenzettel/current.new /opt/stundenzettel/current
  chown -R mycleancenter:mycleancenter /opt/stundenzettel
  ok "Release: /opt/stundenzettel/current → $REL_DIR"

  # systemd-Unit installieren
  UNIT_SRC="/opt/mycleancenter/current/backend/deploy/systemd/stundenzettel.service"
  install -m 0644 "$UNIT_SRC" /etc/systemd/system/stundenzettel.service
  install -m 0644 \
    /opt/mycleancenter/current/backend/deploy/systemd/stundenzettel-mdns-alias.service \
    /etc/systemd/system/stundenzettel-mdns-alias.service
  systemctl daemon-reload
  systemctl enable --now stundenzettel.service
  systemctl enable --now stundenzettel-mdns-alias.service

  log "Healthcheck Stundenzettel (max. 30s)"
  for i in $(seq 1 15); do
    if curl -fsS http://localhost:8787/ >/dev/null 2>&1; then
      ok "Stundenzettel läuft → http://stundenzettel.local:8787"
      break
    fi
    sleep 2
  done
fi

# ============================================================================
# 6) Zusammenfassung
# ============================================================================
IP="$(hostname -I | awk '{print $1}')"
cat <<EOF

════════════════════════════════════════════════════════════════════════════
 FERTIG — Setup abgeschlossen
════════════════════════════════════════════════════════════════════════════

 CRM (MyCleanCenter):
   http://mycleancenter.local:8787
   http://mycleancenter-pi.local:8787
   http://${IP}:8787

 Stundenzettel:
   http://stundenzettel.local:8787
   http://mycleancenter-pi.local:8787
   http://${IP}:8787

 Datenpfad:  $(readlink -f /var/lib/mycleancenter 2>/dev/null || echo /var/lib/mycleancenter)
 Services:   systemctl status mycleancenter stundenzettel
 Logs:       journalctl -u mycleancenter -f
             journalctl -u stundenzettel -f

 Update später (beide Projekte):
   sudo bash /opt/mycleancenter/current/backend/deploy/setup-pi.sh

════════════════════════════════════════════════════════════════════════════
EOF