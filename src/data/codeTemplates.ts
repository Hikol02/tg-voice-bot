import { UserbotConfig, ProjectFile } from '../types';

export function generateEnv(cfg: UserbotConfig): string {
  return `# Telegram API Credentials (https://my.telegram.org)
TELEGRAM_API_ID=${cfg.apiId || '12345678'}
TELEGRAM_API_HASH=${cfg.apiHash || '0123456789abcdef0123456789abcdef'}
TELEGRAM_PHONE_NUMBER=${cfg.phoneNumber || '+79991234567'}
TELEGRAM_SESSION_NAME=${cfg.sessionName || 'voice_transcriber_session'}

# Настройки проксирования
PROXY_ENABLED=${cfg.proxyEnabled ? 'True' : 'False'}
PROXY_TYPE=${cfg.proxyType}

# Автоматический перехват динамического secret и port из systemd сервиса tg-ws-proxy
AUTO_FETCH_PROXY_SECRET=${cfg.autoFetchProxySecret ? 'True' : 'False'}
TG_WS_PROXY_SERVICE=${cfg.tgWsProxyService || 'tg-ws-proxy.service'}

# Параметры MTProto прокси (для локального WS mtproto-прокси)
MTPROTO_HOST=${cfg.mtprotoHost || '127.0.0.1'}
MTPROTO_PORT=${cfg.mtprotoPort || 1443}
MTPROTO_SECRET=${cfg.mtprotoSecret || 'dd54defaad7b9d6abf694539af11efe10b'}

# Параметры SOCKS5 (если локальный WS туннель слушает SOCKS5)
SOCKS_HOST=${cfg.socksHost || '127.0.0.1'}
SOCKS_PORT=${cfg.socksPort || 10808}
SOCKS_USERNAME=${cfg.socksUsername || ''}
SOCKS_PASSWORD=${cfg.socksPassword || ''}

# Настройки локальной STT модели Whisper
STT_ENGINE=${cfg.sttEngine || 'whisper.cpp'}
WHISPER_DIR=/opt/tg_voice_userbot/whisper.cpp
WHISPER_MODEL_SIZE=${cfg.whisperModelSize}
LANGUAGE_MODE=${cfg.languageMode || 'ru+en'}
ANGLICISMS_PROMPT="Разговорная русская речь с IT-терминами и англицизмами: commit, push, pull request, bug, fix, deploy, merge, userbot, code, server, dev."
WHISPER_DEVICE=${cfg.whisperDevice}
WHISPER_COMPUTE_TYPE=${cfg.whisperComputeType}
WHISPER_BEAM_SIZE=${cfg.whisperBeamSize}
WHISPER_VAD_FILTER=${cfg.whisperVadFilter ? 'True' : 'False'}
WHISPER_DOWNLOAD_DIR=./models

# Поведение при получении голосового
ACTION_MODE=${cfg.actionMode}
QUOTE_HEADER=
PROCESS_ROUND_VIDEOS=${cfg.processRoundVideos ? 'True' : 'False'}
NOTIFY_IF_EMPTY=${cfg.notifyIfEmpty ? 'True' : 'False'}
LOG_LEVEL=${cfg.logLevel}
`;
}

export function generateUserbotPy(): string {
  return `import os
import sys
import logging
import asyncio
import tempfile
from typing import Optional

from telethon import TelegramClient, events, connection
from telethon.tl import types
from telethon.tl.types import MessageEntityBlockquote
from faster_whisper import WhisperModel

import config

# Настройка подробного логирования
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("VoiceTranscriberUserbot")

logger.info(
    f"Инициализация faster-whisper (модель: '{config.WHISPER_MODEL_SIZE}', "
    f"device={config.WHISPER_DEVICE}, compute_type={config.WHISPER_COMPUTE_TYPE})..."
)

try:
    whisper_model = WhisperModel(
        config.WHISPER_MODEL_SIZE,
        device=config.WHISPER_DEVICE,
        compute_type=config.WHISPER_COMPUTE_TYPE,
        download_root=config.WHISPER_DOWNLOAD_DIR
    )
    logger.info("Модель faster-whisper успешно загружена в память!")
except Exception as e:
    logger.exception(f"Критическая ошибка при загрузке модели Whisper: {e}")
    sys.exit(1)


def get_proxy_settings():
    """
    Формирует настройки прокси для клиента Telethon.
    Поддерживает:
    - MTProto Proxy (включая локальные WS-прокси, такие как mtg, telepy)
    - SOCKS5 / HTTP прокси (через PySocks / локальный v2ray/xray/wstunnel)
    """
    if not config.PROXY_ENABLED or config.PROXY_TYPE == "NONE":
        logger.info("Прокси отключен, используется прямое подключение.")
        return None, None

    proxy_type = config.PROXY_TYPE.upper()

    if proxy_type == "MTPROTO":
        if config.AUTO_FETCH_PROXY_SECRET:
            try:
                from proxy_resolver import fetch_tg_ws_proxy_credentials
                logger.info(f"Автоматический опрос сервиса '{config.TG_WS_PROXY_SERVICE}' для получения свежего секрета...")
                host, port, secret = fetch_tg_ws_proxy_credentials(config.TG_WS_PROXY_SERVICE)
                if secret:
                    config.MTPROTO_SECRET = secret
                    if host:
                        config.MTPROTO_HOST = host
                    if port:
                        config.MTPROTO_PORT = port
                    logger.info(
                        f"Параметры tg-ws-proxy успешно получены: "
                        f"{config.MTPROTO_HOST}:{config.MTPROTO_PORT} (secret={config.MTPROTO_SECRET[:6]}...)"
                    )
                else:
                    logger.warning(
                        f"Не удалось извлечь secret из логов {config.TG_WS_PROXY_SERVICE}. "
                        f"Используется запасной секрет из .env: {config.MTPROTO_SECRET[:6]}..."
                    )
            except Exception as e:
                logger.warning(f"Ошибка автоподхвата секрета tg-ws-proxy: {e}")

        logger.info(f"Использование MTProto прокси: {config.MTPROTO_HOST}:{config.MTPROTO_PORT}")
        # ConnectionTcpMTProxyRandomizedIntermediate защищает от блокировок и эмулирует TLS
        conn_class = connection.ConnectionTcpMTProxyRandomizedIntermediate
        proxy_tuple = (
            config.MTPROTO_HOST,
            config.MTPROTO_PORT,
            config.MTPROTO_SECRET
        )
        return conn_class, proxy_tuple

    elif proxy_type in ("SOCKS5", "SOCKS4", "HTTP"):
        import socks
        socks_type = {
            "SOCKS5": socks.SOCKS5,
            "SOCKS4": socks.SOCKS4,
            "HTTP": socks.HTTP,
        }[proxy_type]

        logger.info(f"Использование {proxy_type} прокси: {config.SOCKS_HOST}:{config.SOCKS_PORT}")
        proxy_tuple = (
            socks_type,
            config.SOCKS_HOST,
            config.SOCKS_PORT,
            True,  # rdns
            config.SOCKS_USERNAME or None,
            config.SOCKS_PASSWORD or None,
        )
        return None, proxy_tuple

    return None, None


conn_class, proxy_tuple = get_proxy_settings()

client_kwargs = {
    "session": config.SESSION_NAME,
    "api_id": config.API_ID,
    "api_hash": config.API_HASH,
}

if conn_class:
    client_kwargs["connection"] = conn_class
if proxy_tuple:
    client_kwargs["proxy"] = proxy_tuple

client = TelegramClient(**client_kwargs)


def utf16_len(text: str) -> int:
    """
    Telegram MTProto вычисляет смещение и длину форматирующих сущностей
    в UTF-16 code units (для корректной работы с эмодзи и спецсимволами).
    """
    return len(text.encode("utf-16-le")) // 2


def transcribe_audio_file(file_path: str) -> Optional[str]:
    """
    Синхронная транскрибация файла аудио через faster-whisper.
    Запускается в пуле потоков через run_in_executor.
    """
    try:
        segments, info = whisper_model.transcribe(
            file_path,
            beam_size=config.WHISPER_BEAM_SIZE,
            language=config.WHISPER_LANGUAGE if config.WHISPER_LANGUAGE != "auto" else None,
            vad_filter=config.WHISPER_VAD_FILTER,
            vad_parameters=dict(min_silence_duration_ms=500) if config.WHISPER_VAD_FILTER else None
        )
        texts = [segment.text.strip() for segment in segments if segment.text.strip()]
        result = " ".join(texts).strip()
        logger.info(f"Распознан язык: {info.language} ({info.language_probability:.2f}), длина: {len(result)} символов")
        return result
    except Exception as e:
        logger.exception(f"Ошибка транскрибации: {e}")
        return None


def is_target_voice_or_video(message) -> bool:
    """
    Проверяет, является ли сообщение голосовым или кружочком.
    """
    if not message.media:
        return False

    if getattr(message, "voice", False):
        return True

    if hasattr(message.media, "document") and message.media.document:
        for attr in message.media.document.attributes:
            if isinstance(attr, types.DocumentAttributeAudio) and attr.voice:
                return True
            if config.PROCESS_ROUND_VIDEOS and isinstance(attr, types.DocumentAttributeVideo) and attr.round_message:
                return True

    return False


@client.on(events.NewMessage(outgoing=True))
async def handle_my_voice_message(event):
    """
    Перехватывает отправленные вами голосовые сообщения (outgoing=True)
    и добавляет распознанный текст в виде свёрнутой цитаты.
    """
    message = event.message

    if not is_target_voice_or_video(message):
        return

    logger.info(f"Перехвачено исходящее голосовое (ID: {message.id}) в диалоге {event.chat_id}")

    temp_audio_file = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
            temp_audio_file = tmp.name

        logger.debug(f"Скачивание аудио во временный файл {temp_audio_file}...")
        await event.download_media(file=temp_audio_file)

        # Выполняем инференс Whisper в отдельном потоке (без блокировки asyncio)
        loop = asyncio.get_running_loop()
        transcribed_text = await loop.run_in_executor(None, transcribe_audio_file, temp_audio_file)

        if not transcribed_text:
            logger.warning("Речь не обнаружена (тишина или шум).")
            if config.NOTIFY_IF_EMPTY:
                header = f"{config.QUOTE_HEADER}\\n"
                empty_text = "<i>[Речь не распознана]</i>"
                await event.edit(f"{header}{empty_text}", parse_mode="html")
            return

        logger.info(f"Транскрибировано: {transcribed_text[:60]}...")

        # Формируем заголовок и свёрнутую цитату (Collapsible blockquote)
        header = ""
        content = transcribed_text
        full_text = f"{header}{content}"

        # Создаем свёрнутую цитату с помощью нативной сущности MessageEntityBlockquote(collapsed=True)
        offset = utf16_len(header)
        length = utf16_len(content)
        collapsible_entity = MessageEntityBlockquote(offset=offset, length=length, collapsed=True)

        if config.ACTION_MODE == "edit":
            # Редактируем отправленное голосовое сообщение, добавляя расшифровку
            await event.edit(full_text, formatting_entities=[collapsible_entity])
            logger.info("Сообщение успешно отредактировано со свёрнутой цитатой!")
        elif config.ACTION_MODE == "reply":
            # Отправляем цитату отдельным ответом
            await event.reply(full_text, formatting_entities=[collapsible_entity])
            logger.info("Отправлен ответ со свёрнутой цитатой!")

    except Exception as e:
        logger.exception(f"Ошибка при обработке голосового сообщения {message.id}: {e}")
    finally:
        if temp_audio_file and os.path.exists(temp_audio_file):
            try:
                os.remove(temp_audio_file)
            except Exception:
                pass


async def main():
    logger.info("Запуск юзербота Telethon...")
    await client.start(phone=config.PHONE_NUMBER if config.PHONE_NUMBER else None)
    me = await client.get_me()
    name = me.first_name + (f" (@{me.username})" if me.username else "")
    logger.info(f"Авторизация успешна! Аккаунт: {name} (ID: {me.id})")
    logger.info("Юзербот активен. Отправьте голосовое сообщение в любой чат Telegram...")
    await client.run_until_disconnected()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Юзербот остановлен.")
`;
}

export function generateConfigFiles(cfg: UserbotConfig): ProjectFile[] {
  return [
    {
      name: 'userbot.py',
      path: 'userbot.py',
      language: 'python',
      description: 'Основной скрипт юзербота: перехват голосовых, загрузка аудио, распознавание речи и добавление свёрнутой цитаты.',
      content: generateUserbotPy(),
    },
    {
      name: 'config.py',
      path: 'config.py',
      language: 'python',
      description: 'Модуль конфигурации: читает переменные окружения, настраивает Telethon, Whisper и локальный WS/MTProto прокси.',
      content: `import os
from dotenv import load_dotenv

load_dotenv()

# Telegram API Credentials
API_ID: int = int(os.getenv("TELEGRAM_API_ID", "${cfg.apiId || '0'}"))
API_HASH: str = os.getenv("TELEGRAM_API_HASH", "${cfg.apiHash || ''}")
SESSION_NAME: str = os.getenv("TELEGRAM_SESSION_NAME", "${cfg.sessionName}")
PHONE_NUMBER: str = os.getenv("TELEGRAM_PHONE_NUMBER", "${cfg.phoneNumber}")

# Настройки проксирования
PROXY_ENABLED: bool = os.getenv("PROXY_ENABLED", "${cfg.proxyEnabled ? 'True' : 'False'}").lower() in ("true", "1", "yes")
PROXY_TYPE: str = os.getenv("PROXY_TYPE", "${cfg.proxyType}").upper()

# Автоматический перехват секретного ключа и порта из сервиса tg-ws-proxy
AUTO_FETCH_PROXY_SECRET: bool = os.getenv("AUTO_FETCH_PROXY_SECRET", "${cfg.autoFetchProxySecret ? 'True' : 'False'}").lower() in ("true", "1", "yes")
TG_WS_PROXY_SERVICE: str = os.getenv("TG_WS_PROXY_SERVICE", "${cfg.tgWsProxyService || 'tg-ws-proxy.service'}")

# MTProto прокси (для локального WS прокси)
MTPROTO_HOST: str = os.getenv("MTPROTO_HOST", "${cfg.mtprotoHost}")
MTPROTO_PORT: int = int(os.getenv("MTPROTO_PORT", "${cfg.mtprotoPort}"))
MTPROTO_SECRET: str = os.getenv("MTPROTO_SECRET", "${cfg.mtprotoSecret}")

# SOCKS5 / HTTP прокси
SOCKS_HOST: str = os.getenv("SOCKS_HOST", "${cfg.socksHost}")
SOCKS_PORT: int = int(os.getenv("SOCKS_PORT", "${cfg.socksPort}"))
SOCKS_USERNAME: str = os.getenv("SOCKS_USERNAME", "${cfg.socksUsername}")
SOCKS_PASSWORD: str = os.getenv("SOCKS_PASSWORD", "${cfg.socksPassword}")

# Модель STT faster-whisper
WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "${cfg.whisperModelSize}")
WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "${cfg.whisperDevice}")
WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "${cfg.whisperComputeType}")
WHISPER_LANGUAGE: str = os.getenv("WHISPER_LANGUAGE", "${cfg.whisperLanguage}")
WHISPER_BEAM_SIZE: int = int(os.getenv("WHISPER_BEAM_SIZE", "${cfg.whisperBeamSize}"))
WHISPER_VAD_FILTER: bool = os.getenv("WHISPER_VAD_FILTER", "${cfg.whisperVadFilter ? 'True' : 'False'}").lower() in ("true", "1", "yes")
WHISPER_DOWNLOAD_DIR: str = os.getenv("WHISPER_DOWNLOAD_DIR", "./models")

# Поведение
ACTION_MODE: str = os.getenv("ACTION_MODE", "${cfg.actionMode}").lower()
QUOTE_HEADER: str = os.getenv("QUOTE_HEADER", "${cfg.quoteHeader}")
PROCESS_ROUND_VIDEOS: bool = os.getenv("PROCESS_ROUND_VIDEOS", "${cfg.processRoundVideos ? 'True' : 'False'}").lower() in ("true", "1", "yes")
NOTIFY_IF_EMPTY: bool = os.getenv("NOTIFY_IF_EMPTY", "${cfg.notifyIfEmpty ? 'True' : 'False'}").lower() in ("true", "1", "yes")
LOG_LEVEL: str = os.getenv("LOG_LEVEL", "${cfg.logLevel}")
`,
    },
    {
      name: '.env',
      path: '.env',
      language: 'shell',
      description: 'Файл переменных окружения с вашими ключами API, параметрами прокси и настройками Whisper.',
      content: generateEnv(cfg),
    },
    {
      name: 'requirements.txt',
      path: 'requirements.txt',
      language: 'plaintext',
      description: 'Python зависимости проекта (Telethon, faster-whisper, PySocks, cryptography).',
      content: `telethon>=1.36.0
faster-whisper>=1.0.3
python-dotenv>=1.0.1
PySocks>=1.7.1
cryptography>=42.0.0
`,
    },
    {
      name: 'download_model.py',
      path: 'download_model.py',
      language: 'python',
      description: 'Вспомогательный скрипт для предварительного скачивания модели Whisper на сервер.',
      content: `"""
Скрипт для предварительной загрузки модели faster-whisper в локальную папку.
Запустите перед стартом юзербота: python download_model.py
"""
import os
import sys
from faster_whisper import download_model
import config

print(f"--- Предварительная загрузка модели '{config.WHISPER_MODEL_SIZE}' ---")
print(f"Директория назначения: {os.path.abspath(config.WHISPER_DOWNLOAD_DIR)}")

try:
    os.makedirs(config.WHISPER_DOWNLOAD_DIR, exist_ok=True)
    model_path = download_model(
        config.WHISPER_MODEL_SIZE,
        output_dir=config.WHISPER_DOWNLOAD_DIR
    )
    print(f"\\n[OK] Модель успешно сохранена в: {model_path}")
    print("Теперь можно запускать userbot.py без ожидания скачивания!")
except Exception as e:
    print(f"\\n[ERROR] Ошибка загрузки: {e}", file=sys.stderr)
    sys.exit(1)
`,
    },
    {
      name: 'Dockerfile',
      path: 'Dockerfile',
      language: 'dockerfile',
      description: 'Контейнеризация для изолированного запуска на сервере с поддержкой ffmpeg.',
      content: `FROM python:3.11-slim

# Установка системных зависимостей (ffmpeg необходим для обработки Opus/Ogg)
RUN apt-get update && apt-get install -y --no-install-recommends \\
    ffmpeg \\
    git \\
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/models /app/sessions

CMD ["python", "-u", "userbot.py"]
`,
    },
    {
      name: 'docker-compose.yml',
      path: 'docker-compose.yml',
      language: 'yaml',
      description: 'Docker Compose манифест с network_mode: host для доступа к локальному ws-прокси.',
      content: `version: '3.8'

services:
  userbot:
    build: .
    container_name: tg_voice_transcriber_userbot
    restart: unless-stopped
    network_mode: "host" # Доступ к локальному 127.0.0.1 ws/mtproto прокси
    env_file:
      - .env
    volumes:
      - ./models:/app/models
      - ./sessions:/app
    stdin_open: true
    tty: true
`,
    },
    {
      name: 'proxy_resolver.py',
      path: 'proxy_resolver.py',
      language: 'python',
      description: 'Автоматический захват актуального tg://proxy секрета и порта из логов systemd сервиса tg-ws-proxy при старте.',
      content: `import re
import subprocess
import logging
from typing import Tuple, Optional

logger = logging.getLogger("ProxyResolver")


def fetch_tg_ws_proxy_credentials(
    service_name: str = "${cfg.tgWsProxyService || 'tg-ws-proxy.service'}",
) -> Tuple[Optional[str], Optional[int], Optional[str]]:
    """
    Автоматически извлекает параметры подключения tg://proxy?server=...&port=...&secret=...
    из логов systemd сервиса tg-ws-proxy (https://github.com/Flowseal/tg-ws-proxy).
    """
    service_variants = [service_name]
    if service_name.endswith(".service"):
        service_variants.append(service_name.replace(".service", ""))
    else:
        service_variants.append(f"{service_name}.service")

    commands = []
    for s in service_variants:
        commands.append(["journalctl", "-u", s, "-n", "80", "--no-pager"])
        commands.append(["systemctl", "status", s, "--no-pager"])

    output = ""
    for cmd in commands:
        try:
            proc = subprocess.run(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=4,
            )
            if proc.returncode == 0 and proc.stdout:
                if "tg://proxy" in proc.stdout:
                    output = proc.stdout
                    break
                elif not output and len(proc.stdout) > 50:
                    output = proc.stdout
        except (subprocess.SubprocessError, FileNotFoundError, PermissionError) as e:
            logger.debug(f"Ошибка при вызове {' '.join(cmd)}: {e}")

    if not output:
        logger.warning(
            f"Не удалось прочитать логи сервиса '{service_name}'. "
            "Убедитесь, что сервис запущен ('systemctl status tg-ws-proxy') "
            "и у пользователя есть права на journalctl."
        )
        return None, None, None

    # Поиск шаблона: tg://proxy?server=127.0.0.1&port=1443&secret=dd54defaad7b9d6abf694539af11efe10b
    matches = list(re.finditer(
        r"tg://proxy\\?server=(?P<server>[^&\\s]+)&port=(?P<port>\\d+)&secret=(?P<secret>[a-zA-Z0-9]+)",
        output
    ))

    if matches:
        latest = matches[-1]
        server = latest.group("server").strip()
        port = int(latest.group("port").strip())
        secret = latest.group("secret").strip()

        logger.info(
            f"Успешно извлечены параметры из {service_name}: "
            f"host={server}, port={port}, secret={secret[:6]}...{secret[-4:]}"
        )
        return server, port, secret

    return None, None, None
`,
    },
    {
      name: 'userbot.service',
      path: 'userbot.service',
      language: 'ini',
      description: 'Systemd юнит для автоматического запуска и перезапуска юзербота на Linux сервере.',
      content: `[Unit]
Description=Telethon Voice Transcriber Userbot
After=network.target tg-ws-proxy.service
Wants=tg-ws-proxy.service

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tg_voice_userbot
ExecStart=/opt/tg_voice_userbot/venv/bin/python userbot.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`,
    },
    {
      name: 'install.sh',
      path: 'install.sh',
      language: 'bash',
      description: 'Универсальный интерактивный установщик с автоопределением CPU (Phenom II без AVX / современные процессоры с AVX2) и Linux-дистрибутива.',
      content: `#!/usr/bin/env bash
# Universal Installer for Telegram Voice Transcriber Userbot
# Supports all Linux distributions and automatically detects CPU capabilities (including AMD Phenom II without AVX).

set -e

ORIG_DIR="\$PWD"
INSTALL_DIR="/opt/tg_voice_userbot"

echo "=========================================================="
echo "Telegram Voice Transcriber Userbot - Automatic Installer"
echo "=========================================================="

# 1. Check Root
if [[ \$EUID -ne 0 ]]; then
   echo "[ERROR] This installer must be run as root (use: sudo bash install.sh)."
   exit 1
fi

# 2. Interactive Input
read -p "1. Enter TELEGRAM_API_ID (from my.telegram.org): " USER_API_ID
while [[ -z "\$USER_API_ID" ]]; do
    read -p "   API_ID cannot be empty. Enter API_ID: " USER_API_ID
done

read -p "2. Enter TELEGRAM_API_HASH: " USER_API_HASH
while [[ -z "\$USER_API_HASH" ]]; do
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

case "\$LANG_CHOICE" in
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

case "\$MODEL_CHOICE" in
    2) WHISPER_MODEL="tiny" ;;
    3) WHISPER_MODEL="small" ;;
    *) WHISPER_MODEL="base" ;;
esac

echo ""
echo "[INFO] Step 1/6: Detecting Linux Distribution and Package Manager..."
if command -v apt-get >/dev/null 2>&1; then
    PKG_MGR="apt"
    apt-get update -qq
    apt-get install -y -qq build-essential cmake git ffmpeg python3 python3-pip python3-venv python3-tk curl
elif command -v dnf >/dev/null 2>&1; then
    PKG_MGR="dnf"
    dnf install -y -q gcc gcc-c++ cmake git ffmpeg python3 python3-pip python3-tkinter curl
elif command -v pacman >/dev/null 2>&1; then
    PKG_MGR="pacman"
    pacman -Sy --noconfirm base-devel cmake git ffmpeg python python-pip tk curl
else
    echo "[WARNING] Unknown package manager. Ensure cmake, gcc, git, ffmpeg and python3 are installed."
fi

echo "[INFO] Step 2/6: Detecting CPU Architecture and Instruction Sets..."
HAS_AVX2=\$(grep -m1 -o 'avx2' /proc/cpuinfo || true)
HAS_AVX=\$(grep -m1 -o 'avx' /proc/cpuinfo || true)
CPU_MODEL=\$(grep -m1 'model name' /proc/cpuinfo | cut -d: -f2 | xargs || echo "Generic CPU")

echo "[INFO] CPU detected: \$CPU_MODEL"

CMAKE_FLAGS=""
if [[ -z "\$HAS_AVX2" && -z "\$HAS_AVX" ]]; then
    echo "[INFO] No AVX/AVX2 support found (e.g. AMD Phenom II or legacy hypervisor)."
    echo "[INFO] Building whisper.cpp in pure CPU compatibility mode (-DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_FMA=OFF -DGGML_F16C=OFF)..."
    CMAKE_FLAGS="-DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_FMA=OFF -DGGML_F16C=OFF"
elif [[ -z "\$HAS_AVX2" && -n "\$HAS_AVX" ]]; then
    echo "[INFO] AVX detected without AVX2. Building whisper.cpp with -DGGML_AVX2=OFF..."
    CMAKE_FLAGS="-DGGML_AVX2=OFF -DGGML_FMA=OFF"
else
    echo "[INFO] Modern CPU with AVX2 detected. Enabling full vector optimizations."
    CMAKE_FLAGS=""
fi

echo "[INFO] Step 3/6: Setting up installation directory and building whisper.cpp..."
mkdir -p "\$INSTALL_DIR"
cd "\$INSTALL_DIR"

if [ ! -d "whisper.cpp" ]; then
    git clone --depth 1 https://github.com/ggerganov/whisper.cpp.git
fi

cd whisper.cpp
cmake -B build \$CMAKE_FLAGS
cmake --build build --config Release -j"\$(nproc 2>/dev/null || echo 2)"

echo "[INFO] Downloading GGML model: \$WHISPER_MODEL..."
bash ./models/download-ggml-model.sh "\$WHISPER_MODEL"
cd "\$INSTALL_DIR"

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
cd "\$INSTALL_DIR"

echo "[INFO] Step 4/6: Preparing Python Virtual Environment..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -q telethon python-dotenv PySocks cryptography

echo "[INFO] Step 5/6: Writing Configuration and Systemd Unit..."

# .env
cat << ENV_EOF > "\$INSTALL_DIR/.env"
TELEGRAM_API_ID=\${USER_API_ID}
TELEGRAM_API_HASH=\${USER_API_HASH}
TELEGRAM_PHONE_NUMBER=\${USER_PHONE}
TELEGRAM_SESSION_NAME=voice_transcriber_session

PROXY_ENABLED=True
PROXY_TYPE=MTPROTO
AUTO_FETCH_PROXY_SECRET=True
TG_WS_PROXY_SERVICE=tg-ws-proxy.service

MTPROTO_HOST=127.0.0.1
MTPROTO_PORT=1443
MTPROTO_SECRET=dd54defaad7b9d6abf694539af11efe10b

STT_ENGINE=whisper.cpp
WHISPER_DIR=\$INSTALL_DIR/whisper.cpp
WHISPER_MODEL_SIZE=\${WHISPER_MODEL}
LANGUAGE_MODE=\${LANG_MODE}
QUOTE_HEADER=
ACTION_MODE=edit
PROCESS_ROUND_VIDEOS=True
LOG_LEVEL=INFO
ENV_EOF

# Copy source python files
if [ -f "\$ORIG_DIR/userbot.py" ]; then
    cp -f "\$ORIG_DIR/config.py" "\$ORIG_DIR/proxy_resolver.py" "\$ORIG_DIR/userbot.py" "\$INSTALL_DIR/"
else
    echo "[ERROR] userbot.py not found in \$ORIG_DIR!"
    echo "Please make sure you are running install.sh from the repository folder."
    exit 1
fi

# Systemd service
cat << SERVICE_EOF > /etc/systemd/system/tg-voice-userbot.service
[Unit]
Description=Telethon Voice Transcriber Userbot
After=network.target tg-ws-proxy.service
Wants=tg-ws-proxy.service

[Service]
Type=simple
User=root
WorkingDirectory=\$INSTALL_DIR
ExecStart=\$INSTALL_DIR/venv/bin/python userbot.py
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
cd "\$INSTALL_DIR"
./venv/bin/python userbot.py || true

# Enable and start background service
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
`,
    },
    {
      name: 'push_to_github.sh',
      path: 'push_to_github.sh',
      language: 'bash',
      description: 'Скрипт для мгновенной публикации проекта в ваш публичный или приватный репозиторий GitHub.',
      content: `#!/usr/bin/env bash
# Публикация репозитория в GitHub
set -e

read -p "Введите URL вашего GitHub репозитория (например, https://github.com/USER/tg-voice-userbot.git): " REPO_URL

git init
git branch -M main
git add .
git commit -m "Initial commit: Telegram Voice Transcriber with tg-ws-proxy & whisper.cpp support" || true
git remote remove origin 2>/dev/null || true
git remote add origin "$REPO_URL"
git push -u origin main
echo "[INFO] Проект успешно опубликован на GitHub!"
`,
    },
    {
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
  ];
}
