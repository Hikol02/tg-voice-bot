import os
import sys
import logging
import asyncio
import tempfile
import subprocess
from typing import Optional, Tuple
from telethon import TelegramClient, events, connection
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


def run_whisper_cpp(audio_path: str) -> str:
    bin_path = detect_whisper_cpp_binary()
    if not bin_path:
        logger.error("whisper.cpp executable not found.")
        return ""

    model_file = os.path.join(config.WHISPER_DIR, f"models/ggml-{config.WHISPER_MODEL_SIZE}.bin")
    if not os.path.exists(model_file):
        logger.error(f"whisper.cpp model not found: {model_file}")
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

        cmd = [
            bin_path,
            "-m", model_file,
            "-l", lang_arg,
            "-nt",
            "-t", str(os.cpu_count() or 4),
            "-f", wav_path,
        ]
        if prompt_arg:
            cmd.extend(["--prompt", prompt_arg])

        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=180)
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


def run_faster_whisper(audio_path: str) -> str:
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


def transcribe_audio_file(audio_path: str) -> str:
    if config.STT_ENGINE == "whisper.cpp" or faster_model is None:
        return run_whisper_cpp(audio_path)
    else:
        return run_faster_whisper(audio_path)


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


# In-chat settings menu handler (.menu, .model, .lang, .mode, .proxy, .help)
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
        menu_text = (
            "[Voice Transcriber Settings]\n\n"
            f"• Engine: {bin_status}\n"
            f"• Model: {config.WHISPER_MODEL_SIZE}\n"
            f"• Language mode: {config.LANGUAGE_MODE}\n"
            f"• Output mode: {config.ACTION_MODE}\n"
            f"• Round videos: {'Enabled' if config.PROCESS_ROUND_VIDEOS else 'Disabled'}\n"
            f"• Proxy: {proxy_info}\n\n"
            "Commands to change settings:\n"
            "• .model <tiny|base|small|medium> - change Whisper model\n"
            "• .lang <ru+en|ru|auto|en> - change language mode\n"
            "• .mode <edit|reply> - edit voice or reply\n"
            "• .rounds <on|off> - toggle round video notes\n"
            "• .proxy - test proxy connection\n"
            "• .close - delete this menu"
        )
        await event.edit(menu_text)
        return

    if cmd == ".close":
        await event.delete()
        return

    if cmd == ".model":
        if len(parts) > 1:
            new_model = parts[1].lower()
            if new_model in ("tiny", "base", "small", "medium"):
                config.WHISPER_MODEL_SIZE = new_model
                save_env_setting("WHISPER_MODEL_SIZE", new_model)
                await event.edit(f"[Voice Transcriber] Model set to: {new_model}")
            else:
                await event.edit("[Voice Transcriber] Allowed models: tiny, base, small, medium")
        else:
            await event.edit(f"[Voice Transcriber] Current model: {config.WHISPER_MODEL_SIZE}")
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

    logger.info(f"Intercepted outgoing voice message (ID: {event.message.id})")
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as tmp:
            tmp_path = tmp.name

        await event.download_media(file=tmp_path)

        loop = asyncio.get_running_loop()
        transcribed_text = await loop.run_in_executor(None, transcribe_audio_file, tmp_path)

        if not transcribed_text:
            logger.info("Transcription yielded empty result.")
            return

        # No header before the quote (as explicitly requested by user)
        # Transcribed text goes directly inside the collapsible blockquote entity
        header = f"{config.QUOTE_HEADER}\n" if config.QUOTE_HEADER else ""
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


async def main():
    logger.info("Connecting to Telegram...")
    await client.start(phone=config.PHONE_NUMBER if config.PHONE_NUMBER else None)
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
