with open("userbot/install.sh", "r") as f:
    content = f.read()

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

content = content.replace('echo "[INFO] Step 4/6: Preparing Python Virtual Environment..."', proxy_block + 'echo "[INFO] Step 4/6: Preparing Python Virtual Environment..."')

with open("userbot/install.sh", "w") as f:
    f.write(content)
