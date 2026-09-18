#!/usr/bin/env bash
# Uninstaller for Telegram Voice Transcriber Userbot

if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] This script must be run as root (use: sudo bash uninstall.sh)."
   exit 1
fi

echo "Stopping and disabling services..."
systemctl stop tg-voice-userbot.service 2>/dev/null || true
systemctl disable tg-voice-userbot.service 2>/dev/null || true
systemctl stop tg-ws-proxy.service 2>/dev/null || true
systemctl disable tg-ws-proxy.service 2>/dev/null || true

echo "Removing systemd services..."
rm -f /etc/systemd/system/tg-voice-userbot.service
rm -f /etc/systemd/system/tg-ws-proxy.service
systemctl daemon-reload

echo "Removing bot files..."
rm -rf /opt/tg_voice_userbot
rm -rf /opt/tg-ws-proxy

echo "Uninstallation complete."
