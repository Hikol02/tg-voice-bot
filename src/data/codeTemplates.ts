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
import subprocess
import getpass
import random
import json
import urllib.request
from typing import Optional, Tuple, Dict
from telethon import TelegramClient, events, connection, functions, errors
from telethon.tl import types
from telethon.tl.types import MessageEntityBlockquote

import config

# Setup clean, emoji-free logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] [%(name)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("VoiceTranscriber")

# Initialize speech engine
faster_model = None
whisper_cpp_bin = None

def detect_whisper_cpp_binary() -> Optional[str]:
    candidates = [
        os.path.join(config.WHISPER_DIR, "build/bin/whisper-cli"),
        os.path.join(config.WHISPER_DIR, "build/bin/main"),
        os.path.join(config.WHISPER_DIR, "whisper-cli"),
        os.path.join(config.WHISPER_DIR, "main"),
    ]
    for c in candidates:
        if os.path.exists(c) and os.access(c, os.X_OK):
            return c
    return None

if config.STT_ENGINE == "whisper.cpp":
    whisper_cpp_bin = detect_whisper_cpp_binary()
    model_path = os.path.join(config.WHISPER_DIR, f"models/ggml-{config.WHISPER_MODEL_SIZE}.bin")
    if not whisper_cpp_bin:
        logger.warning(
            f"whisper.cpp binary not found in {config.WHISPER_DIR}. "
            "Please compile whisper.cpp or check path."
        )
    else:
        logger.info(f"Using whisper.cpp engine: {whisper_cpp_bin} with model {model_path}")
else:
    try:
        from faster_whisper import WhisperModel
        logger.info(
            f"Loading faster-whisper model '{config.WHISPER_MODEL_SIZE}' "
            f"({config.WHISPER_DEVICE}, {config.WHISPER_COMPUTE_TYPE})..."
        )
        faster_model = WhisperModel(
            config.WHISPER_MODEL_SIZE,
            device=config.WHISPER_DEVICE,
            compute_type=config.WHISPER_COMPUTE_TYPE,
            download_root=config.WHISPER_DOWNLOAD_DIR,
        )
        logger.info("faster-whisper model loaded successfully.")
    except Exception as e:
        logger.warning(f"Could not load faster-whisper ({e}). Falling back to whisper.cpp if available.")
        whisper_cpp_bin = detect_whisper_cpp_binary()


def get_proxy_settings():
    if not config.PROXY_ENABLED or config.PROXY_TYPE == "NONE":
        logger.info("Proxy is disabled. Using direct connection.")
        return None, None

    proxy_type = config.PROXY_TYPE.upper()

    if proxy_type == "MTPROTO":
        if config.AUTO_FETCH_PROXY_SECRET:
            try:
                from proxy_resolver import fetch_tg_ws_proxy_credentials
                logger.info(f"Polling {config.TG_WS_PROXY_SERVICE} for dynamic secret and port...")
                host, port, secret = fetch_tg_ws_proxy_credentials(config.TG_WS_PROXY_SERVICE)
                if secret:
                    config.MTPROTO_SECRET = secret
                    if host:
                        config.MTPROTO_HOST = host
                    if port:
                        config.MTPROTO_PORT = port
                    logger.info(
                        f"Proxy credentials resolved: {config.MTPROTO_HOST}:{config.MTPROTO_PORT} "
                        f"(secret={config.MTPROTO_SECRET[:6]}...)"
                    )
                else:
                    logger.warning("Could not extract secret from journalctl. Using fallback from config.")
            except Exception as e:
                logger.warning(f"Proxy resolver error: {e}")

        logger.info(f"Using MTProto proxy: {config.MTPROTO_HOST}:{config.MTPROTO_PORT}")
        conn_class = connection.ConnectionTcpMTProxyRandomizedIntermediate
        proxy_tuple = (
            config.MTPROTO_HOST,
            config.MTPROTO_PORT,
            config.MTPROTO_SECRET,
        )
        return conn_class, proxy_tuple

    elif proxy_type == "SOCKS5":
        import socks
        logger.info(f"Using SOCKS5 proxy: {config.SOCKS_HOST}:{config.SOCKS_PORT}")
        proxy_tuple = (
            socks.SOCKS5,
            config.SOCKS_HOST,
            config.SOCKS_PORT,
            True,
            config.SOCKS_USERNAME or None,
            config.SOCKS_PASSWORD or None,
        )
        return connection.ConnectionTcpFull, proxy_tuple

    return None, None


conn_class, proxy_tuple = get_proxy_settings()

if not config.API_ID or not config.API_HASH:
    logger.error("TELEGRAM_API_ID and TELEGRAM_API_HASH must be configured in .env file.")
    sys.exit(1)

client = TelegramClient(
    config.SESSION_NAME,
    config.API_ID,
    config.API_HASH,
    connection=conn_class,
    proxy=proxy_tuple,
)


def utf16_len(text: str) -> int:
    return len(text.encode("utf-16-le")) // 2


CHAT_MODELS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "chat_models.json")


def load_chat_models() -> Dict[str, str]:
    if not os.path.exists(CHAT_MODELS_FILE):
        return {}
    try:
        with open(CHAT_MODELS_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception as e:
        logger.warning(f"Could not load chat_models.json: {e}")
        return {}


def save_chat_model(chat_id: int, model_name: str) -> None:
    data = load_chat_models()
    data[str(chat_id)] = model_name.lower().strip()
    try:
        with open(CHAT_MODELS_FILE, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        logger.info(f"Saved custom model '{model_name}' for chat ID {chat_id}")
    except Exception as e:
        logger.error(f"Could not save chat model for {chat_id}: {e}")


def delete_chat_model(chat_id: int) -> bool:
    data = load_chat_models()
    if str(chat_id) in data:
        del data[str(chat_id)]
        try:
            with open(CHAT_MODELS_FILE, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
            logger.info(f"Removed custom model for chat ID {chat_id}")
            return True
        except Exception as e:
            logger.error(f"Could not delete custom model for {chat_id}: {e}")
    return False


def get_chat_model(chat_id: int) -> str:
    data = load_chat_models()
    return data.get(str(chat_id), config.WHISPER_MODEL_SIZE)


def is_model_installed(model_name: str) -> bool:
    model_name = model_name.lower().strip()
    model_file = os.path.join(config.WHISPER_DIR, f"models/ggml-{model_name}.bin")
    return os.path.exists(model_file) and os.path.getsize(model_file) > 1000000


def download_whisper_cpp_model(model_name: str) -> Tuple[bool, str]:
    """
    Downloads whisper.cpp model if missing. Uses download-ggml-model.sh
    if available, otherwise falls back to direct download from Hugging Face.
    """
    model_name = model_name.lower().strip()
    models_dir = os.path.join(config.WHISPER_DIR, "models")
    os.makedirs(models_dir, exist_ok=True)
    target_file = os.path.join(models_dir, f"ggml-{model_name}.bin")

    if os.path.exists(target_file) and os.path.getsize(target_file) > 1000000:
        return True, target_file

    logger.info(f"Attempting download of whisper.cpp model '{model_name}'...")

    # Method 1: Using whisper.cpp official download script
    script_path = os.path.join(config.WHISPER_DIR, "models", "download-ggml-model.sh")
    if os.path.exists(script_path):
        try:
            logger.info(f"Executing {script_path} {model_name}...")
            res = subprocess.run(
                ["bash", "./models/download-ggml-model.sh", model_name],
                cwd=config.WHISPER_DIR,
                capture_output=True,
                text=True,
                timeout=900,
            )
            if res.returncode == 0 and os.path.exists(target_file) and os.path.getsize(target_file) > 1000000:
                logger.info(f"Successfully downloaded {model_name} via download-ggml-model.sh.")
                return True, target_file
            else:
                logger.warning(f"download-ggml-model.sh output: {res.stderr or res.stdout}")
        except Exception as e:
            logger.warning(f"Error running download-ggml-model.sh: {e}")

    # Method 2: Direct HTTP download from Hugging Face
    url = f"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-{model_name}.bin"
    tmp_file = target_file + f".part_{os.getpid()}"
    logger.info(f"Downloading {model_name} directly from {url}...")
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; tg-voice-userbot)"}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status != 200:
                return False, f"HTTP Error {resp.status}"
            with open(tmp_file, "wb") as f_out:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f_out.write(chunk)

        if os.path.exists(tmp_file) and os.path.getsize(tmp_file) > 1000000:
            os.replace(tmp_file, target_file)
            logger.info(f"Successfully downloaded ggml-{model_name}.bin ({os.path.getsize(target_file)} bytes).")
            return True, target_file
        else:
            if os.path.exists(tmp_file):
                try:
                    os.remove(tmp_file)
                except Exception:
                    pass
            return False, "Файл загружен не полностью или повреждён (< 1 МБ)"
    except Exception as e:
        if os.path.exists(tmp_file):
            try:
                os.remove(tmp_file)
            except Exception:
                pass
        logger.exception(f"Direct download failed for {model_name}: {e}")
        return False, str(e)


def save_env_setting(key: str, value: str):
    env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env")
    if not os.path.exists(env_path):
        with open(env_path, "w") as f:
            f.write(f"{key}={value}\\n")
        return

    with open(env_path, "r") as f:
        lines = f.readlines()

    found = False
    new_lines = []
    for line in lines:
        if line.strip().startswith(f"{key}="):
            new_lines.append(f"{key}={value}\\n")
            found = True
        else:
            new_lines.append(line)

    if not found:
        new_lines.append(f"{key}={value}\\n")

    with open(env_path, "w") as f:
        f.writelines(new_lines)


def run_whisper_cpp(audio_path: str, model_name: Optional[str] = None) -> str:
    bin_path = detect_whisper_cpp_binary()
    if not bin_path:
        logger.error("whisper.cpp executable not found.")
        return ""

    target_model = (model_name or config.WHISPER_MODEL_SIZE).lower().strip()
    model_file = os.path.join(config.WHISPER_DIR, f"models/ggml-{target_model}.bin")

    # If model is missing, try automatic download
    if not os.path.exists(model_file) or os.path.getsize(model_file) < 1000000:
        logger.warning(f"Model file {model_file} not found. Attempting automatic download of '{target_model}'...")
        ok, res = download_whisper_cpp_model(target_model)
        if not ok or not os.path.exists(model_file):
            logger.error(f"Could not auto-download model '{target_model}'. Falling back to default '{config.WHISPER_MODEL_SIZE}'")
            target_model = config.WHISPER_MODEL_SIZE
            model_file = os.path.join(config.WHISPER_DIR, f"models/ggml-{target_model}.bin")
            if not os.path.exists(model_file):
                logger.error(f"Fallback model also missing: {model_file}")
                return ""

    wav_path = audio_path + ".wav"
    try:
        # Convert audio to 16kHz mono WAV for whisper.cpp
        subprocess.run(
            ["ffmpeg", "-y", "-i", audio_path, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", wav_path],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            check=True,
            timeout=30,
        )

        lang_arg = "ru"
        prompt_arg = None
        if config.LANGUAGE_MODE == "ru+en":
            lang_arg = "ru"
            prompt_arg = config.ANGLICISMS_PROMPT
        elif config.LANGUAGE_MODE == "auto":
            lang_arg = "auto"
        elif config.LANGUAGE_MODE == "en":
            lang_arg = "en"
        elif config.LANGUAGE_MODE == "ru":
            lang_arg = "ru"

        threads = str(os.cpu_count() or 4)
        cmd = [
            bin_path,
            "-m", model_file,
            "-l", lang_arg,
            "-nt",
            "-t", threads,
            "-f", wav_path,
        ]
        if prompt_arg:
            cmd.extend(["--prompt", prompt_arg])

        logger.info(f"Running whisper-cli with model '{target_model}' on {threads} threads...")
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=300)
        lines = [
            line.strip()
            for line in res.stdout.split("\\n")
            if line.strip() and not line.startswith("whisper_") and not line.startswith("main:")
        ]
        return " ".join(lines).strip()
    except Exception as e:
        logger.exception(f"whisper.cpp transcription error: {e}")
        return ""
    finally:
        if os.path.exists(wav_path):
            try:
                os.remove(wav_path)
            except Exception:
                pass


def run_faster_whisper(audio_path: str, model_name: Optional[str] = None) -> str:
    global faster_model
    if not faster_model:
        return ""

    lang_arg = "ru"
    prompt = None
    if config.LANGUAGE_MODE == "ru+en":
        lang_arg = "ru"
        prompt = config.ANGLICISMS_PROMPT
    elif config.LANGUAGE_MODE == "auto":
        lang_arg = None
    elif config.LANGUAGE_MODE == "en":
        lang_arg = "en"
    elif config.LANGUAGE_MODE == "ru":
        lang_arg = "ru"

    segments, _ = faster_model.transcribe(
        audio_path,
        language=lang_arg,
        initial_prompt=prompt,
        beam_size=config.WHISPER_BEAM_SIZE,
        vad_filter=config.WHISPER_VAD_FILTER,
    )
    return " ".join(s.text.strip() for s in segments if s.text.strip()).strip()


def transcribe_audio_file(audio_path: str, model_name: Optional[str] = None) -> str:
    if config.STT_ENGINE == "whisper.cpp" or faster_model is None:
        return run_whisper_cpp(audio_path, model_name)
    else:
        return run_faster_whisper(audio_path, model_name)


def is_target_media(message) -> bool:
    if not message.media:
        return False

    if getattr(message, "voice", False):
        return True

    if hasattr(message.media, "document") and message.media.document:
        for attr in message.media.document.attributes:
            if isinstance(attr, types.DocumentAttributeAudio) and attr.voice:
                return True
            if config.PROCESS_ROUND_VIDEOS and isinstance(attr, types.DocumentAttributeVideo) and getattr(attr, "round_message", False):
                return True
    return False


# In-chat settings menu handler (.menu, .model, .setmodel, .lang, .mode, .proxy, .help)
@client.on(events.NewMessage(outgoing=True))
async def on_command(event):
    text = (event.raw_text or "").strip()
    if not text.startswith("."):
        return

    parts = text.split()
    cmd = parts[0].lower()

    if cmd == ".menu":
        bin_status = "whisper.cpp (native CPU)" if config.STT_ENGINE == "whisper.cpp" else "faster-whisper"
        proxy_info = f"{config.MTPROTO_HOST}:{config.MTPROTO_PORT}" if config.PROXY_ENABLED else "Disabled"
        chat_model = load_chat_models().get(str(event.chat_id))
        chat_model_display = f"{chat_model} (персональная)" if chat_model else f"{config.WHISPER_MODEL_SIZE} (глобальная)"
        menu_text = (
            "[Voice Transcriber Settings]\\n\\n"
            f"• Движок: {bin_status}\\n"
            f"• Глобальная модель: {config.WHISPER_MODEL_SIZE}\\n"
            f"• Модель для этого чата (ID {event.chat_id}): {chat_model_display}\\n"
            f"• Языковой режим: {config.LANGUAGE_MODE}\\n"
            f"• Режим вывода: {config.ACTION_MODE}\\n"
            f"• Кругляшки видео: {'Включены' if config.PROCESS_ROUND_VIDEOS else 'Выключены'}\\n"
            f"• Прокси: {proxy_info}\\n\\n"
            "Команды управления:\\n"
            "• .model <имя> — сменить глобальную модель (с автозагрузкой)\\n"
            "• .setmodel <имя> — персональная модель для ЭТОГО чата (по ID)\\n"
            "• .setmodel reset — сбросить модель чата на глобальную\\n"
            "• .chatmodels — список чатов с персональными моделями\\n"
            "• .lang <ru+en|ru|auto|en> — языковой режим\\n"
            "• .mode <edit|reply> — редактировать голосовое или отвечать\\n"
            "• .rounds <on|off> — транскрипция кругляшков\\n"
            "• .proxy — проверка прокси\\n"
            "• .close — закрыть меню"
        )
        await event.edit(menu_text)
        return

    if cmd == ".close":
        await event.delete()
        return

    if cmd == ".chatmodels":
        all_chats = load_chat_models()
        if not all_chats:
            await event.edit(f"[Voice Transcriber] Нет чатов с персональными моделями. Все чаты используют глобальную модель: {config.WHISPER_MODEL_SIZE}")
        else:
            lines = ["[Персональные модели чатов]"]
            for cid, m in all_chats.items():
                is_here = " ← текущий чат" if str(event.chat_id) == cid else ""
                lines.append(f"• ID {cid}: {m}{is_here}")
            lines.append(f"\\nГлобальная по умолчанию: {config.WHISPER_MODEL_SIZE}")
            lines.append("Чтобы сбросить в текущем чате: .setmodel reset")
            await event.edit("\\n".join(lines))
        return

    if cmd == ".model":
        if len(parts) > 1:
            new_model = parts[1].lower().strip()
            if not is_model_installed(new_model):
                await event.edit(f"[Voice Transcriber] ⏳ Модель '{new_model}' не найдена локально. Начинаю загрузку, пожалуйста, подождите...")
                loop = asyncio.get_running_loop()
                ok, res = await loop.run_in_executor(None, download_whisper_cpp_model, new_model)
                if not ok:
                    await event.edit(f"[Voice Transcriber] ❌ Ошибка загрузки модели '{new_model}': {res}")
                    return
            config.WHISPER_MODEL_SIZE = new_model
            save_env_setting("WHISPER_MODEL_SIZE", new_model)
            await event.edit(f"[Voice Transcriber] ✅ Глобальная модель успешно установлена: {new_model}")
        else:
            chat_m = load_chat_models().get(str(event.chat_id))
            cm_str = f"\\n• Модель для текущего чата (ID {event.chat_id}): {chat_m}" if chat_m else ""
            await event.edit(
                f"[Voice Transcriber]\\n"
                f"• Глобальная модель: {config.WHISPER_MODEL_SIZE}{cm_str}\\n\\n"
                f"Использование:\\n"
                f"• .model <имя> — сменить глобальную (tiny, base, small, medium, large-v3-turbo)\\n"
                f"• .setmodel <имя> — установить модель только для текущего чата"
            )
        return

    if cmd in (".setmodel", ".chatmodel"):
        chat_id = event.chat_id
        if len(parts) > 1:
            arg = parts[1].lower().strip()
            if arg in ("reset", "default", "del", "clear", "remove"):
                deleted = delete_chat_model(chat_id)
                if deleted:
                    await event.edit(f"[Voice Transcriber] 🔄 Для чата ID {chat_id} сброшена персональная модель. Теперь используется глобальная: {config.WHISPER_MODEL_SIZE}")
                else:
                    await event.edit(f"[Voice Transcriber] Для чата ID {chat_id} персональная модель не была установлена (используется глобальная: {config.WHISPER_MODEL_SIZE})")
                return

            new_model = arg
            if not is_model_installed(new_model):
                await event.edit(f"[Voice Transcriber] ⏳ Модель '{new_model}' не найдена локально. Загружаю для чата ID {chat_id}...")
                loop = asyncio.get_running_loop()
                ok, res = await loop.run_in_executor(None, download_whisper_cpp_model, new_model)
                if not ok:
                    await event.edit(f"[Voice Transcriber] ❌ Ошибка загрузки модели '{new_model}': {res}")
                    return

            save_chat_model(chat_id, new_model)
            await event.edit(f"[Voice Transcriber] ✅ Для чата ID {chat_id} успешно установлена персональная модель: {new_model}\\n(Глобальная по умолчанию: {config.WHISPER_MODEL_SIZE})")
        else:
            chat_m = load_chat_models().get(str(chat_id))
            active_m = f"{chat_m} (персональная)" if chat_m else f"{config.WHISPER_MODEL_SIZE} (глобальная по умолчанию)"
            text_info = (
                f"[Voice Transcriber • Модель чата]\\n"
                f"• ID чата: {chat_id}\\n"
                f"• Активная модель: {active_m}\\n"
                f"• Глобальная модель: {config.WHISPER_MODEL_SIZE}\\n\\n"
                "Команды:\\n"
                f"• .setmodel <tiny|base|small|medium|large-v3-turbo> — привязать модель к этому чату\\n"
                f"• .setmodel reset — сбросить и использовать глобальную"
            )
            await event.edit(text_info)
        return

    if cmd == ".lang":
        if len(parts) > 1:
            new_lang = parts[1].lower()
            if new_lang in ("ru+en", "ru", "auto", "en"):
                config.LANGUAGE_MODE = new_lang
                save_env_setting("LANGUAGE_MODE", new_lang)
                await event.edit(f"[Voice Transcriber] Language mode set to: {new_lang}")
            else:
                await event.edit("[Voice Transcriber] Allowed modes: ru+en, ru, auto, en")
        else:
            await event.edit(f"[Voice Transcriber] Current language mode: {config.LANGUAGE_MODE}")
        return

    if cmd == ".mode":
        if len(parts) > 1:
            new_mode = parts[1].lower()
            if new_mode in ("edit", "reply"):
                config.ACTION_MODE = new_mode
                save_env_setting("ACTION_MODE", new_mode)
                await event.edit(f"[Voice Transcriber] Output mode set to: {new_mode}")
            else:
                await event.edit("[Voice Transcriber] Allowed modes: edit, reply")
        else:
            await event.edit(f"[Voice Transcriber] Current output mode: {config.ACTION_MODE}")
        return

    if cmd == ".rounds":
        if len(parts) > 1:
            val = parts[1].lower() in ("on", "true", "1", "yes")
            config.PROCESS_ROUND_VIDEOS = val
            save_env_setting("PROCESS_ROUND_VIDEOS", "True" if val else "False")
            await event.edit(f"[Voice Transcriber] Round videos transcription: {'Enabled' if val else 'Disabled'}")
        else:
            await event.edit(f"[Voice Transcriber] Round videos: {'Enabled' if config.PROCESS_ROUND_VIDEOS else 'Disabled'}")
        return

    if cmd == ".proxy":
        try:
            from proxy_resolver import fetch_tg_ws_proxy_credentials
            h, p, s = fetch_tg_ws_proxy_credentials(config.TG_WS_PROXY_SERVICE)
            status_text = (
                "[Proxy Status]\\n"
                f"• Service: {config.TG_WS_PROXY_SERVICE}\\n"
                f"• Host: {h or config.MTPROTO_HOST}\\n"
                f"• Port: {p or config.MTPROTO_PORT}\\n"
                f"• Secret: {(s or config.MTPROTO_SECRET)[:6]}...{(s or config.MTPROTO_SECRET)[-4:]}\\n"
                f"• Resolved dynamically: {'Yes' if s else 'No (using config fallback)'}"
            )
            await event.edit(status_text)
        except Exception as e:
            await event.edit(f"[Proxy Status] Error: {e}")
        return


# Voice / Video Note handler
@client.on(events.NewMessage(outgoing=True))
async def on_voice_message(event):
    if not is_target_media(event.message):
        return

    chat_id = event.chat_id
    chosen_model = get_chat_model(chat_id)
    logger.info(f"Intercepted outgoing voice message (ID: {event.message.id}) in chat {chat_id}. Using model: '{chosen_model}'")
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
            tmp_path = tmp.name

        await event.download_media(file=tmp_path)

        loop = asyncio.get_running_loop()
        transcribed_text = await loop.run_in_executor(None, transcribe_audio_file, tmp_path, chosen_model)

        if not transcribed_text:
            logger.info("Transcription yielded empty result.")
            return

        # No header before the quote (as explicitly requested by user)
        # Transcribed text goes directly inside the collapsible blockquote entity
        header = ""
        full_text = f"{header}{transcribed_text}"
        quote_entity = MessageEntityBlockquote(
            offset=utf16_len(header),
            length=utf16_len(transcribed_text),
            collapsed=True,
        )

        if config.ACTION_MODE == "edit":
            await event.edit(full_text, formatting_entities=[quote_entity])
            logger.info(f"Message ID {event.message.id} successfully edited with collapsed quote.")
        else:
            await event.reply(full_text, formatting_entities=[quote_entity])
            logger.info(f"Reply sent for message ID {event.message.id}.")

    except Exception as e:
        logger.exception(f"Error processing voice message ID {event.message.id}: {e}")
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


async def _keepalive_worker(stop_event: asyncio.Event):
    """
    Actively pings Telegram server every 2.5 seconds during connection/auth
    to prevent intermediate MTProto/WebSocket proxies and Cloudflare from dropping
    idle TCP connections (which causes '0 bytes read' and AUTH_KEY_UNREGISTERED).
    """
    while not stop_event.is_set():
        try:
            if client.is_connected():
                await client(functions.PingRequest(ping_id=random.randint(1, 0x7FFFFFFF)))
        except Exception:
            pass
        try:
            await asyncio.wait_for(stop_event.wait(), timeout=2.5)
        except asyncio.TimeoutError:
            pass


async def _async_input(prompt: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, input, prompt)


async def _async_getpass(prompt: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, getpass.getpass, prompt)


async def main():
    logger.info("Connecting to Telegram...")
    stop_keepalive = asyncio.Event()
    keepalive_task = asyncio.create_task(_keepalive_worker(stop_keepalive))

    try:
        phone_param = config.PHONE_NUMBER if config.PHONE_NUMBER else lambda: _async_input("Please enter your phone: ")
        await client.start(
            phone=phone_param,
            code_callback=lambda: _async_input("Please enter the code you received: "),
            password=lambda: _async_getpass("Please enter your password: "),
        )
    except errors.AuthKeyUnregisteredError:
        session_path = f"{config.SESSION_NAME}.session"
        logger.error(
            "The authorization session key was invalidated by Telegram. "
            f"Please remove '{session_path}' and restart the userbot to authenticate fresh."
        )
        raise
    finally:
        stop_keepalive.set()
        keepalive_task.cancel()

    me = await client.get_me()
    logger.info(f"Authorized successfully as: {me.first_name} (@{me.username or 'no_username'}, ID: {me.id})")
    logger.info("Userbot is running and listening for outgoing messages.")
    await client.run_until_disconnected()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except (KeyboardInterrupt, SystemExit):
        logger.info("Userbot stopped by user.")
    except Exception as err:
        logger.critical(f"Fatal error: {err}")
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

# Telegram API credentials from my.telegram.org
API_ID: int = int(os.getenv("TELEGRAM_API_ID", "0"))
API_HASH: str = os.getenv("TELEGRAM_API_HASH", "")
SESSION_NAME: str = os.getenv("TELEGRAM_SESSION_NAME", "voice_transcriber_session")
PHONE_NUMBER: str = os.getenv("TELEGRAM_PHONE_NUMBER", "")

# Proxy configuration
PROXY_ENABLED: bool = os.getenv("PROXY_ENABLED", "True").lower() in ("true", "1", "yes")
AUTO_FETCH_PROXY_SECRET: bool = os.getenv("AUTO_FETCH_PROXY_SECRET", "True").lower() in ("true", "1", "yes")
TG_WS_PROXY_SERVICE: str = os.getenv("TG_WS_PROXY_SERVICE", "tg-ws-proxy.service")
PROXY_TYPE: str = os.getenv("PROXY_TYPE", "MTPROTO").upper()

# Fallback MTProto parameters
MTPROTO_HOST: str = os.getenv("MTPROTO_HOST", "127.0.0.1")
MTPROTO_PORT: int = int(os.getenv("MTPROTO_PORT", "1443"))
MTPROTO_SECRET: str = os.getenv("MTPROTO_SECRET", "dd705ef901017a8caa3ed04d10cdb7b2e8")

# Fallback SOCKS5 parameters
SOCKS_HOST: str = os.getenv("SOCKS_HOST", "127.0.0.1")
SOCKS_PORT: int = int(os.getenv("SOCKS_PORT", "10808"))
SOCKS_USERNAME: str = os.getenv("SOCKS_USERNAME", "")
SOCKS_PASSWORD: str = os.getenv("SOCKS_PASSWORD", "")

# Speech recognition settings
# Engine: 'whisper.cpp' (recommended for older CPUs without AVX like Phenom II) or 'faster_whisper'
STT_ENGINE: str = os.getenv("STT_ENGINE", "whisper.cpp").lower()
WHISPER_DIR: str = os.getenv("WHISPER_DIR", "/opt/tg_voice_userbot/whisper.cpp")
WHISPER_MODEL_SIZE: str = os.getenv("WHISPER_MODEL_SIZE", "base")

# Language: 'ru+en' (Russian with English anglicisms), 'ru', 'auto', 'en'
LANGUAGE_MODE: str = os.getenv("LANGUAGE_MODE", "ru+en").lower()

# Initial prompt used by Whisper to accurately transcribe technical terms and anglicisms
ANGLICISMS_PROMPT: str = os.getenv(
    "ANGLICISMS_PROMPT",
    "Разговорная русская речь с IT-терминами и англицизмами: commit, push, pull request, bug, fix, deploy, merge, userbot, code, server, backend, frontend, release, issue, dev."
)

WHISPER_DEVICE: str = os.getenv("WHISPER_DEVICE", "cpu")
WHISPER_COMPUTE_TYPE: str = os.getenv("WHISPER_COMPUTE_TYPE", "int8")
WHISPER_BEAM_SIZE: int = int(os.getenv("WHISPER_BEAM_SIZE", "5"))
WHISPER_VAD_FILTER: bool = os.getenv("WHISPER_VAD_FILTER", "True").lower() in ("true", "1", "yes")
WHISPER_DOWNLOAD_DIR: str = os.getenv("WHISPER_DOWNLOAD_DIR", "./models")

# Userbot behavior
# Header before quote: empty string by default per user request (no emoji, no header)
QUOTE_HEADER: str = os.getenv("QUOTE_HEADER", "")
# Action mode: 'edit' (edits the voice message with quote) or 'reply' (replies with quote)
ACTION_MODE: str = os.getenv("ACTION_MODE", "edit").lower()
PROCESS_ROUND_VIDEOS: bool = os.getenv("PROCESS_ROUND_VIDEOS", "True").lower() in ("true", "1", "yes")

LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")
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
./venv/bin/pip install --upgrade pip -q
./venv/bin/pip install -q certifi psutil cryptography aiohttp websockets pillow customtkinter

# Pre-defined 32-hex secret (in Telegram mtproto URI it gets prefixed with dd)
PROXY_RAW_SECRET="705ef901017a8caa3ed04d10cdb7b2e8"
PROXY_DD_SECRET="dd\${PROXY_RAW_SECRET}"

cat << PROXY_SERVICE > /etc/systemd/system/tg-ws-proxy.service
[Unit]
Description=Telegram WebSocket Proxy Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/tg-ws-proxy
ExecStart=/opt/tg-ws-proxy/venv/bin/python -m proxy.tg_ws_proxy --port 1443 --host 127.0.0.1 --secret \${PROXY_RAW_SECRET}
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

cd "\$INSTALL_DIR"

echo "[INFO] Step 4/6: Preparing Python Virtual Environment..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -q telethon python-dotenv PySocks cryptography "python-socks[asyncio]"

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
MTPROTO_SECRET=dd705ef901017a8caa3ed04d10cdb7b2e8

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
if [ -f "\$ORIG_DIR/userbot/userbot.py" ]; then
    cp -f "\$ORIG_DIR/userbot/config.py" "\$ORIG_DIR/userbot/proxy_resolver.py" "\$ORIG_DIR/userbot/userbot.py" "\$INSTALL_DIR/"
elif [ -f "\$ORIG_DIR/userbot.py" ]; then
    cp -f "\$ORIG_DIR/config.py" "\$ORIG_DIR/proxy_resolver.py" "\$ORIG_DIR/userbot.py" "\$INSTALL_DIR/"
else
    echo "[ERROR] userbot.py not found in \$ORIG_DIR or \$ORIG_DIR/userbot!"
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

# Check if git is initialized
if [ ! -d ".git" ]; then
    git init
    git branch -M main
fi

git add .
git commit -m "Initial commit: Telegram Voice Transcriber with tg-ws-proxy & whisper.cpp support" || true
git remote remove origin 2>/dev/null || true
git remote add origin "\$REPO_URL"
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
