with open("src/data/codeTemplates.ts", "r") as f:
    content = f.read()

# 1. Fix userbot.py quote header
content = content.replace('header = f"{config.QUOTE_HEADER}\\\\n" if config.QUOTE_HEADER else ""', 'header = ""')

# 2. Add uninstall.sh to templates (let's append it at the end)
uninstall_template = """    {
      name: 'uninstall.sh',
      path: 'uninstall.sh',
      language: 'bash',
      description: 'Полный деинсталлятор для удаления юзербота и прокси с сервера.',
      content: `#!/usr/bin/env bash
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

echo "Uninstallation complete."`,
    },
"""

# We'll inject uninstall.sh before the last `  ];`
content = content.replace("  ];\n}", uninstall_template + "  ];\n}")

# 3. Add proxy block to install.sh template
proxy_block = """echo "[INFO] Step 3.5/6: Setting up local tg-ws-proxy (alexbers/mtprotoproxy)..."
cd /opt
if [ ! -d "tg-ws-proxy" ]; then
    git clone https://github.com/alexbers/mtprotoproxy.git tg-ws-proxy
fi
cd tg-ws-proxy
cat << PROXY_SERVICE > /etc/systemd/system/tg-ws-proxy.service
[Unit]
Description=Telegram MTProto Proxy
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tg-ws-proxy
ExecStart=/usr/bin/python3 mtprotoproxy.py
Restart=always
RestartSec=3
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
PROXY_SERVICE

systemctl daemon-reload
systemctl enable --now tg-ws-proxy.service
sleep 3
cd "$INSTALL_DIR"

"""

content = content.replace('cd "$INSTALL_DIR"\npython3 -m venv venv', proxy_block + 'python3 -m venv venv')

with open("src/data/codeTemplates.ts", "w") as f:
    f.write(content)
