#!/usr/bin/env bash
# Universal Installer for Telegram Voice Transcriber Userbot
# Supports all Linux distributions and automatically detects CPU capabilities (including AMD Phenom II without AVX).

set -e

INSTALL_DIR="/opt/tg_voice_userbot"

echo "=========================================================="
echo "Telegram Voice Transcriber Userbot - Automatic Installer"
echo "=========================================================="

# 1. Check Root
if [[ $EUID -ne 0 ]]; then
   echo "[ERROR] This installer must be run as root (use: sudo bash install.sh)."
   exit 1
fi

# 2. Interactive Input
read -p "1. Enter TELEGRAM_API_ID (from my.telegram.org): " USER_API_ID
while [[ -z "$USER_API_ID" ]]; do
    read -p "   API_ID cannot be empty. Enter API_ID: " USER_API_ID
done

read -p "2. Enter TELEGRAM_API_HASH: " USER_API_HASH
while [[ -z "$USER_API_HASH" ]]; do
    read -p "   API_HASH cannot be empty. Enter API_HASH: " USER_API_HASH
done

read -p "3. Enter account phone number (e.g. +79991234567): " USER_PHONE
echo ""

echo "4. Choose Language Recognition Mode:"
echo "   1) ru+en (Russian with IT/tech anglicisms prompt - RECOMMENDED)"
echo "   2) ru    (Standard Russian)"
echo "   3) auto  (Automatic language detection)"
echo "   4) en    (English)"
read -p "   Choice [1/2/3/4, default 1]: " LANG_CHOICE
case "$LANG_CHOICE" in
    2) LANG_MODE="ru" ;;
    3) LANG_MODE="auto" ;;
    4) LANG_MODE="en" ;;
    *) LANG_MODE="ru+en" ;;
esac

echo ""
echo "5. Choose Whisper Model Size:"
echo "   1) base  (Recommended: fast on CPU, good quality for everyday Russian)"
echo "   2) tiny  (Lightest, fastest, low RAM)"
echo "   3) small (High accuracy, requires more CPU time)"
read -p "   Choice [1/2/3, default 1]: " MODEL_CHOICE
case "$MODEL_CHOICE" in
    2) WHISPER_MODEL="tiny" ;;
    3) WHISPER_MODEL="small" ;;
    *) WHISPER_MODEL="base" ;;
esac

echo ""
echo "[INFO] Step 1/6: Detecting Linux Distribution and Package Manager..."
if command -v apt-get >/dev/null 2>&1; then
    PKG_MGR="apt"
    apt-get update -qq
    apt-get install -y -qq build-essential cmake git ffmpeg python3 python3-pip python3-venv curl
elif command -v dnf >/dev/null 2>&1; then
    PKG_MGR="dnf"
    dnf install -y -q gcc gcc-c++ cmake git ffmpeg python3 python3-pip curl
elif command -v pacman >/dev/null 2>&1; then
    PKG_MGR="pacman"
    pacman -Sy --noconfirm base-devel cmake git ffmpeg python python-pip curl
else
    echo "[WARNING] Unknown package manager. Ensure cmake, gcc, git, ffmpeg and python3 are installed."
fi

echo "[INFO] Step 2/6: Detecting CPU Architecture and Instruction Sets..."
HAS_AVX2=$(grep -m1 -o 'avx2' /proc/cpuinfo || true)
HAS_AVX=$(grep -m1 -o 'avx' /proc/cpuinfo || true)
CPU_MODEL=$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs || echo "Generic CPU")
echo "[INFO] CPU detected: $CPU_MODEL"

CMAKE_FLAGS=""
if [[ -z "$HAS_AVX2" && -z "$HAS_AVX" ]]; then
    echo "[INFO] No AVX/AVX2 support found (e.g. AMD Phenom II or legacy hypervisor)."
    echo "[INFO] Building whisper.cpp in pure CPU compatibility mode (-DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_FMA=OFF -DGGML_F16C=OFF)..."
    CMAKE_FLAGS="-DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_FMA=OFF -DGGML_F16C=OFF"
elif [[ -z "$HAS_AVX2" && -n "$HAS_AVX" ]]; then
    echo "[INFO] AVX detected without AVX2. Building whisper.cpp with -DGGML_AVX2=OFF..."
    CMAKE_FLAGS="-DGGML_AVX2=OFF -DGGML_FMA=OFF"
else
    echo "[INFO] Modern CPU with AVX2 detected. Enabling full vector optimizations."
    CMAKE_FLAGS=""
fi

echo "[INFO] Step 3/6: Setting up installation directory and building whisper.cpp..."
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

if [ ! -d "whisper.cpp" ]; then
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git
fi
cd whisper.cpp
cmake -B build $CMAKE_FLAGS
cmake --build build --config Release -j"$(nproc 2>/dev/null || echo 2)"
echo "[INFO] Downloading GGML model: $WHISPER_MODEL..."
bash ./models/download-ggml-model.sh "$WHISPER_MODEL"

cd "$INSTALL_DIR"
echo "[INFO] Step 4/6: Preparing Python Virtual Environment..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -q telethon python-dotenv PySocks cryptography

echo "[INFO] Installing tg-ws-proxy..."
pip install -q git+https://github.com/Flowseal/tg-ws-proxy.git

echo "[INFO] Step 5/6: Writing Configuration and Systemd Unit..."
# .env
cat << ENV_EOF > "$INSTALL_DIR/.env"
TELEGRAM_API_ID=${USER_API_ID}
TELEGRAM_API_HASH=${USER_API_HASH}
TELEGRAM_PHONE_NUMBER=${USER_PHONE}
TELEGRAM_SESSION_NAME=voice_transcriber_session
PROXY_ENABLED=True
PROXY_TYPE=MTPROTO
AUTO_FETCH_PROXY_SECRET=True
TG_WS_PROXY_SERVICE=tg-ws-proxy.service
MTPROTO_HOST=127.0.0.1
MTPROTO_PORT=1443
MTPROTO_SECRET=dd54defaad7b9d6abf694539af11efe10b
STT_ENGINE=whisper.cpp
WHISPER_DIR=$INSTALL_DIR/whisper.cpp
WHISPER_MODEL_SIZE=${WHISPER_MODEL}
LANGUAGE_MODE=${LANG_MODE}
QUOTE_HEADER=
ACTION_MODE=edit
PROCESS_ROUND_VIDEOS=True
LOG_LEVEL=INFO
ENV_EOF

# Copy source python files if present in current dir, or write them
if [ -f "userbot.py" ] && [ "$PWD" != "$INSTALL_DIR" ]; then
    cp -f config.py proxy_resolver.py userbot.py "$INSTALL_DIR/"
fi

# Systemd service for tg-ws-proxy
cat << PROXY_SERVICE_EOF > /etc/systemd/system/tg-ws-proxy.service
[Unit]
Description=Telegram WebSocket Proxy
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/venv/bin/tg-ws-proxy --host 127.0.0.1 --port 1443 --secret dd54defaad7b9d6abf694539af11efe10b
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
PROXY_SERVICE_EOF

# Systemd service
cat << SERVICE_EOF > /etc/systemd/system/tg-voice-userbot.service
[Unit]
Description=Telethon Voice Transcriber Userbot
After=network.target tg-ws-proxy.service
Wants=tg-ws-proxy.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
ExecStart=$INSTALL_DIR/venv/bin/python userbot.py
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
SERVICE_EOF

systemctl daemon-reload

echo ""
echo "=========================================================="
echo "Step 6/6: Telegram Authorization"
echo "Telethon will now request your Telegram verification code."
echo "=========================================================="
cd "$INSTALL_DIR"
./venv/bin/python userbot.py || true

# Enable and start background service
systemctl enable --now tg-ws-proxy.service
systemctl enable --now tg-voice-userbot.service

echo ""
echo "=========================================================="
echo "Installation completed successfully."
echo "Service is now running in the background."
echo ""
echo "Management commands:"
echo "  • Check status:      systemctl status tg-voice-userbot.service"
echo "  • View live logs:    journalctl -u tg-voice-userbot.service -f"
echo "  • Restart service:   systemctl restart tg-voice-userbot.service"
echo ""
echo "In-Telegram management:"
echo "  • Send '.menu' in any chat or Saved Messages to view/modify settings."
echo "=========================================================="

