"""
Скрипт для предварительной загрузки модели faster-whisper в локальную папку.
Полезно, если на сервере медленный интернет или нужно развернуть модель заранее.
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
    print(f"\nМодель успешно скачана в: {model_path}")
    print("Теперь можно запускать userbot.py без ожидания скачивания!")
except Exception as e:
    print(f"\nОшибка при загрузке: {e}", file=sys.stderr)
    sys.exit(1)
