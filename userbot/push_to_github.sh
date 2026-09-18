#!/usr/bin/env bash
# Script to publish this userbot project to your GitHub repository

set -e

echo "=========================================================="
echo "Publish Telegram Voice Transcriber Userbot to GitHub"
echo "=========================================================="

read -p "Enter your GitHub repository URL (e.g. https://github.com/USERNAME/tg-voice-userbot.git): " REPO_URL
while [[ -z "$REPO_URL" ]]; do
    read -p "Repository URL cannot be empty: " REPO_URL
done

cd "$(dirname "$0")"

# Ensure .gitignore prevents committing private sessions and env
cat << 'GITIGNORE_EOF' > .gitignore
.env
*.session
*.session-journal
venv/
__pycache__/
*.pyc
models/
whisper.cpp/
*.wav
*.ogg
GITIGNORE_EOF

if [ ! -d ".git" ]; then
    git init
    git branch -M main
fi

git add .
git commit -m "Initial commit: Telegram Voice Transcriber Userbot with tg-ws-proxy and whisper.cpp support" || true

git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"

echo ""
echo "[INFO] Pushing code to $REPO_URL..."
git push -u origin main

echo ""
echo "=========================================================="
echo "Project successfully published to GitHub!"
echo "Now anyone or your servers can install it via:"
echo "git clone $REPO_URL && cd tg-voice-userbot && bash install.sh"
echo "=========================================================="
