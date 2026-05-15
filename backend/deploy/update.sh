#!/usr/bin/env bash
# MyCleanCenter — One-Shot-Update vom GitHub-Repo.
# Nutzung auf dem Pi:   sudo /opt/mycleancenter/update.sh
#
# WICHTIG: Fasst NIEMALS /var/lib/mycleancenter (Daten) an.
# Ersetzt nur Code in /opt/mycleancenter/current.

set -euo pipefail

REPO="https://github.com/bilind-tech/crm-2.git"
BRANCH="main"
APP_DIR="/opt/mycleancenter/current"
BUILD_DIR="/tmp/mcc-build-$$"
SERVICE="mycleancenter"

echo "==> 1/6  Klone $REPO ($BRANCH) nach $BUILD_DIR"
rm -rf "$BUILD_DIR"
git clone --depth 1 --branch "$BRANCH" "$REPO" "$BUILD_DIR"

echo "==> 2/6  Frontend bauen (SPA)"
cd "$BUILD_DIR"
npm ci --no-audit --no-fund
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
