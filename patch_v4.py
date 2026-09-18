import re

new_proxy_block = """
echo "[INFO] Step 3.5/6: Setting up local tg-ws-proxy (Flowseal/tg-ws-proxy)..."
cd /opt
if [ ! -d "tg-ws-proxy" ]; then
    git clone https://github.com/Flowseal/tg-ws-proxy.git
fi
cd tg-ws-proxy
python3 -m venv venv
./venv/bin/pip install cryptography aiohttp websockets pillow customtkinter

cat << PROXY_CONFIG > /opt/tg-ws-proxy/config.json
{
  "port": 1443,
  "secret": "dd54defaad7b9d6abf694539af11efe10b",
  "cf_proxy": "auto"
}
PROXY_CONFIG

cat << PROXY_SERVICE > /etc/systemd/system/tg-ws-proxy.service
[Unit]
Description=Telegram WebSocket Proxy Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tg-ws-proxy
ExecStart=/opt/tg-ws-proxy/venv/bin/python -m proxy.tg_ws_proxy
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
PROXY_SERVICE

systemctl daemon-reload
systemctl enable --now tg-ws-proxy.service
systemctl start tg-ws-proxy.service
sleep 3
cd "$INSTALL_DIR"
"""

with open("src/data/codeTemplates.ts", "r") as f:
    content = f.read()

# Make it completely resilient to whitespace
content = re.sub(r'(cd "\$INSTALL_DIR"\s*)python3 -m venv venv', r'\1' + new_proxy_block + r'python3 -m venv venv', content)

content = content.replace("python3-venv curl", "python3-venv python3-tk curl")
content = content.replace("python3-pip curl", "python3-pip python3-tkinter curl")
content = content.replace("python-pip curl", "python-pip tk curl")

with open("src/data/codeTemplates.ts", "w") as f:
    f.write(content)

