with open("userbot/config.py", "r") as f:
    conf = f.read()

conf = conf.replace(
    'MTPROTO_SECRET: str = os.getenv("MTPROTO_SECRET", "dd54defaad7b9d6abf694539af11efe10b")',
    'MTPROTO_SECRET: str = os.getenv("MTPROTO_SECRET", "dd705ef901017a8caa3ed04d10cdb7b2e8")'
)

with open("userbot/config.py", "w") as f:
    f.write(conf)

with open("userbot/.env.example", "r") as f:
    env_ex = f.read()

env_ex = env_ex.replace(
    'MTPROTO_SECRET=dd54defaad7b9d6abf694539af11efe10b',
    'MTPROTO_SECRET=dd705ef901017a8caa3ed04d10cdb7b2e8'
)

with open("userbot/.env.example", "w") as f:
    f.write(env_ex)

with open("userbot/requirements.txt", "r") as f:
    reqs = f.read()

if "python-socks" not in reqs:
    reqs = reqs.replace("PySocks>=1.7.1", "PySocks>=1.7.1\npython-socks[asyncio]>=2.4.0")
    with open("userbot/requirements.txt", "w") as f:
        f.write(reqs)

# Now update install.sh
with open("userbot/install.sh", "r") as f:
    install_sh = f.read()

old_step_35 = """echo "[INFO] Step 3.5/6: Setting up local tg-ws-proxy (Flowseal/tg-ws-proxy)..."
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
cd "$INSTALL_DIR" """

new_step_35 = """echo "[INFO] Step 3.5/6: Setting up local tg-ws-proxy (Flowseal/tg-ws-proxy)..."
cd /opt
if [ ! -d "tg-ws-proxy" ]; then
    git clone https://github.com/Flowseal/tg-ws-proxy.git
fi
cd tg-ws-proxy
python3 -m venv venv
./venv/bin/pip install --upgrade pip -q
./venv/bin/pip install -q certifi psutil cryptography aiohttp websockets pillow customtkinter

# Pre-defined 32-hex secret (in Telegram mtproto URI it gets prefixed with dd)
PROXY_RAW_SECRET="705ef901017a8caa3ed04d10cdb7b2e8"
PROXY_DD_SECRET="dd${PROXY_RAW_SECRET}"

cat << PROXY_SERVICE > /etc/systemd/system/tg-ws-proxy.service
[Unit]
Description=Telegram WebSocket Proxy Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tg-ws-proxy
ExecStart=/opt/tg-ws-proxy/venv/bin/python -m proxy.tg_ws_proxy --port 1443 --host 127.0.0.1 --secret ${PROXY_RAW_SECRET}
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
PROXY_SERVICE

systemctl daemon-reload
systemctl enable --now tg-ws-proxy.service
systemctl restart tg-ws-proxy.service
sleep 2

if systemctl is-active --quiet tg-ws-proxy.service; then
    echo "[INFO] tg-ws-proxy is active and listening on port 1443."
else
    echo "[WARNING] tg-ws-proxy service failed to start:"
    systemctl status tg-ws-proxy.service --no-pager || true
fi

cd "$INSTALL_DIR" """

# normalize whitespaces before matching
if old_step_35.strip() in install_sh:
    install_sh = install_sh.replace(old_step_35.strip(), new_step_35.strip())
else:
    print("Warning: old_step_35 not matched exactly, trying regex or block replacement")
    import re
    install_sh = re.sub(
        r'echo "\[INFO\] Step 3\.5/6: Setting up local tg-ws-proxy[\s\S]*?cd "\$INSTALL_DIR"',
        new_step_35.strip(),
        install_sh
    )

install_sh = install_sh.replace(
    'pip install -q telethon python-dotenv PySocks cryptography',
    'pip install -q telethon python-dotenv PySocks cryptography "python-socks[asyncio]"'
)

install_sh = install_sh.replace(
    'MTPROTO_SECRET=dd54defaad7b9d6abf694539af11efe10b',
    'MTPROTO_SECRET=dd705ef901017a8caa3ed04d10cdb7b2e8'
)

with open("userbot/install.sh", "w") as f:
    f.write(install_sh)

print("Files updated successfully")
