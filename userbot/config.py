import os
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
