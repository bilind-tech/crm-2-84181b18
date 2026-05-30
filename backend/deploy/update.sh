#!/usr/bin/env bash
# MyCleanCenter — One-Shot-Update vom GitHub-Repo.
# Nutzung auf dem Pi:   sudo /opt/mycleancenter/update.sh
#
# WICHTIG: Fasst NIEMALS /var/lib/mycleancenter (Daten) an.
# Ersetzt nur Code in /opt/mycleancenter/current.

set -euo pipefail

REPO="https://github.com/bilind-tech/crm-2-5f8fb3a9.git"
BRANCH="main"
APP_DIR="/opt/mycleancenter/current"
# WICHTIG: NICHT /tmp benutzen — auf dem Pi ist /tmp meist tmpfs (RAM-begrenzt).
# npm ci zieht u. a. workerd-linux-arm64 (>100 MB entpackt) + Vite-Toolchain,
# das sprengt tmpfs schnell ("ENOSPC: no space left on device").
# /var/tmp liegt auf der SSD und hat den vollen Plattenplatz.
BUILD_ROOT="${MCC_BUILD_ROOT:-/var/tmp}"
BUILD_DIR="$BUILD_ROOT/mcc-build-$$"
NPM_CACHE_DIR="$BUILD_ROOT/mcc-npm-cache"
SERVICE="mycleancenter"

cleanup() {
  rm -rf "$BUILD_DIR"
}
trap cleanup EXIT

cleanup_stale_build_dirs() {
  for d in /tmp/mcc-build-* "$BUILD_ROOT"/mcc-build-*; do
    [[ -d "$d" ]] || continue
    pid="${d##*/mcc-build-}"
    if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
      continue
    fi
    rm -rf -- "$d"
  done
}

require_build_space() {
  local min_kb=2097152 # 2 GiB
  local avail_kb
  mkdir -p "$BUILD_ROOT"
  avail_kb="$(df -Pk "$BUILD_ROOT" | awk 'NR==2 {print $4}')"
  if [[ -n "$avail_kb" && "$avail_kb" -lt "$min_kb" ]]; then
    echo "FEHLER: Zu wenig freier Speicher in $BUILD_ROOT."
    echo "Frei: $((avail_kb / 1024)) MB, benötigt: mindestens $((min_kb / 1024)) MB."
    echo "Tipp: sudo rm -rf /tmp/mcc-build-* $BUILD_ROOT/mcc-build-* && sudo npm cache clean --force && sudo apt clean"
    exit 1
  fi
}

cleanup_stale_build_dirs
require_build_space

# Persistente npm-Cache auf SSD — beschleunigt Re-Installs und entlastet RAM/tmpfs.
mkdir -p "$NPM_CACHE_DIR"
export npm_config_cache="$NPM_CACHE_DIR"
# workerd ist eine Build-/SSR-Dev-Dependency, die wir für `build:spa` nicht brauchen.
# Sein Postinstall lädt eine plattform­spezifische Binary (~100 MB) und schlägt
# auf ARM oft fehl. Wir lassen npm den Postinstall überspringen.
export npm_config_ignore_scripts=false

echo "==> 1/6  Klone $REPO ($BRANCH) nach $BUILD_DIR"
rm -rf "$BUILD_DIR"
git clone --depth 1 --branch "$BRANCH" "$REPO" "$BUILD_DIR"

echo "==> 2/6  Frontend bauen (SPA)"
cd "$BUILD_DIR"
# workerd-Postinstall überspringen (Binary nicht nötig für SPA-Build, frisst Platz/Zeit).
WORKERD_SKIP_INSTALL=1 npm ci --no-audit --no-fund --ignore-scripts
# Native Module für die Tools, die wir wirklich brauchen, nachträglich bauen (esbuild).
npm rebuild esbuild --no-audit --no-fund || true
npm run build:spa

echo "==> 2b/6  Frontend-node_modules entfernen (verhindert esbuild-Versions-Kollision beim Backend-Postinstall)"
rm -rf "$BUILD_DIR/node_modules"

echo "==> 3/6  Backend bauen"
cd "$BUILD_DIR/backend"
npm ci --no-audit --no-fund
npm run build

echo "==> 4/6  Service stoppen"
sudo systemctl stop "$SERVICE" || true

echo "==> 5/6  Code austauschen (Daten bleiben unangetastet)"
sudo rm -rf "$APP_DIR/dist" "$APP_DIR/backend/dist" "$APP_DIR/backend/node_modules"
sudo mkdir -p "$APP_DIR/backend"
sudo cp -a "$BUILD_DIR/dist-spa"             "$APP_DIR/dist"
sudo cp -a "$BUILD_DIR/backend/dist"         "$APP_DIR/backend/dist"
sudo cp -a "$BUILD_DIR/backend/package.json" "$APP_DIR/backend/package.json"
sudo cp -a "$BUILD_DIR/backend/package-lock.json" "$APP_DIR/backend/package-lock.json" 2>/dev/null || true
sudo cp -a "$BUILD_DIR/backend/node_modules" "$APP_DIR/backend/node_modules"
sudo chown -R mycleancenter:mycleancenter "$APP_DIR" 2>/dev/null || true

echo "==> 6/6  Service starten"
sudo systemctl start "$SERVICE"
sleep 2
sudo systemctl status "$SERVICE" --no-pager -l | head -15

rm -rf "$BUILD_DIR"
echo
echo "✓ Update fertig. CRM läuft auf http://mycleancenter-pi.local:8787"
