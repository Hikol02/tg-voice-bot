#!/usr/bin/env bash
# Публикация репозитория в GitHub
set -e

read -p "Введите URL вашего GitHub репозитория (например, https://github.com/USER/tg-voice-userbot.git): " REPO_URL

# Check if git is initialized
if [ ! -d ".git" ]; then
    git init
    git branch -M main
fi

git add .
git commit -m "Initial commit: Telegram Voice Transcriber with tg-ws-proxy & whisper.cpp support" || true
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"
git push -u origin main
echo "[INFO] Проект успешно опубликован на GitHub!"
