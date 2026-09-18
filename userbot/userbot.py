import os
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
            f.write(f"{key}={value}\n")
        return

    with open(env_path, "r") as f:
        lines = f.readlines()

    found = False
    new_lines = []
    for line in lines:
        if line.strip().startswith(f"{key}="):
            new_lines.append(f"{key}={value}\n")
            found = True
        else:
            new_lines.append(line)

    if not found:
        new_lines.append(f"{key}={value}\n")

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
            for line in res.stdout.split("\n")
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
            "[Voice Transcriber Settings]\n\n"
            f"• Движок: {bin_status}\n"
            f"• Глобальная модель: {config.WHISPER_MODEL_SIZE}\n"
            f"• Модель для этого чата (ID {event.chat_id}): {chat_model_display}\n"
            f"• Языковой режим: {config.LANGUAGE_MODE}\n"
            f"• Режим вывода: {config.ACTION_MODE}\n"
            f"• Кругляшки видео: {'Включены' if config.PROCESS_ROUND_VIDEOS else 'Выключены'}\n"
            f"• Прокси: {proxy_info}\n\n"
            "Команды управления:\n"
            "• .model <имя> — сменить глобальную модель (с автозагрузкой)\n"
            "• .setmodel <имя> — персональная модель для ЭТОГО чата (по ID)\n"
            "• .setmodel reset — сбросить модель чата на глобальную\n"
            "• .chatmodels — список чатов с персональными моделями\n"
            "• .lang <ru+en|ru|auto|en> — языковой режим\n"
            "• .mode <edit|reply> — редактировать голосовое или отвечать\n"
            "• .rounds <on|off> — транскрипция кругляшков\n"
            "• .proxy — проверка прокси\n"
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
            lines.append(f"\nГлобальная по умолчанию: {config.WHISPER_MODEL_SIZE}")
            lines.append("Чтобы сбросить в текущем чате: .setmodel reset")
            await event.edit("\n".join(lines))
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
            cm_str = f"\n• Модель для текущего чата (ID {event.chat_id}): {chat_m}" if chat_m else ""
            await event.edit(
                f"[Voice Transcriber]\n"
                f"• Глобальная модель: {config.WHISPER_MODEL_SIZE}{cm_str}\n\n"
                f"Использование:\n"
                f"• .model <имя> — сменить глобальную (tiny, base, small, medium, large-v3-turbo)\n"
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
            await event.edit(f"[Voice Transcriber] ✅ Для чата ID {chat_id} успешно установлена персональная модель: {new_model}\n(Глобальная по умолчанию: {config.WHISPER_MODEL_SIZE})")
        else:
            chat_m = load_chat_models().get(str(chat_id))
            active_m = f"{chat_m} (персональная)" if chat_m else f"{config.WHISPER_MODEL_SIZE} (глобальная по умолчанию)"
            text_info = (
                f"[Voice Transcriber • Модель чата]\n"
                f"• ID чата: {chat_id}\n"
                f"• Активная модель: {active_m}\n"
                f"• Глобальная модель: {config.WHISPER_MODEL_SIZE}\n\n"
                "Команды:\n"
                f"• .setmodel <tiny|base|small|medium|large-v3-turbo> — привязать модель к этому чату\n"
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
                "[Proxy Status]\n"
                f"• Service: {config.TG_WS_PROXY_SERVICE}\n"
                f"• Host: {h or config.MTPROTO_HOST}\n"
                f"• Port: {p or config.MTPROTO_PORT}\n"
                f"• Secret: {(s or config.MTPROTO_SECRET)[:6]}...{(s or config.MTPROTO_SECRET)[-4:]}\n"
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
