# Telegram Voice Transcriber Userbot (Telethon + faster-whisper)

Полнофункциональный юзербот для Telegram на базе **Telethon**, который автоматически перехватывает ваши исходящие голосовые сообщения (и кружочки), локально транскрибирует их с помощью **faster-whisper** (CTranslate2) и прикрепляет текст в виде красивой **свёрнутой цитаты** (`MessageEntityBlockquote(collapsed=True)`).

Бот работает через **локальный WS/MTProto прокси** и полностью локально обрабатывает речь на сервере без отправки аудио во внешние облачные API.

---

## ⚡ Особенности
- **Локальный STT**: Использование `faster-whisper` с квантованием `int8` (минимальное потребление ОЗУ, высокая скорость на CPU).
- **Свёрнутые цитаты**: Используется нативная сущность Telegram MTProto `MessageEntityBlockquote(collapsed=True)` (пользователь может развернуть цитату по клику).
- **Подключение через прокси**: Поддержка MTProto прокси (включая WS-тунелирование через `mtg`, `telepy`) и SOCKS5/HTTP (через `PySocks`, `xray`, `wstunnel`, `gost`).
- **Редактирование или Ответ**: Возможность добавить расшифровку прямо в подпись голосового или отправить отдельным реплаем.
- **Поддержка кружочков**: Умеет расшифровывать не только голосовые, но и видеосообщения (Round Video Notes).

---

## 🚀 Быстрый старт на Linux / VPS

### 1. Установите системные зависимости
Для распаковки звука из контейнера Opus Telegram требуется `ffmpeg`:
```bash
sudo apt update
sudo apt install -y python3 python3-pip python3-venv ffmpeg git
```

### 2. Склонируйте или загрузите проект
```bash
mkdir -p /opt/tg_voice_userbot
cd /opt/tg_voice_userbot
# Перенесите файлы проекта в эту директорию
```

### 3. Создайте виртуальное окружение и установите библиотеки
```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Настройте конфигурацию (.env)
Скопируйте пример:
```bash
cp .env.example .env
nano .env
```
Заполните:
- `TELEGRAM_API_ID` и `TELEGRAM_API_HASH` (получите на [my.telegram.org](https://my.telegram.org)).
- Параметры вашего локального прокси (`MTPROTO_HOST`, `MTPROTO_PORT`, `MTPROTO_SECRET`).
- `WHISPER_MODEL_SIZE` (по умолчанию `small` — отлично распознаёт русскую речь).

### 5. Предварительная загрузка модели (по желанию)
```bash
python download_model.py
```

### 6. Первый запуск и авторизация
При первом запуске Telethon запросит ваш номер телефона и код подтверждения из Telegram:
```bash
python userbot.py
```
После успешного входа в папке создастся файл сессии `voice_transcriber_session.session`.

---

## 🔄 Автозапуск через Systemd (фоновая служба)

1. Скопируйте файл сервиса:
```bash
sudo cp userbot.service /etc/systemd/system/tg-voice-userbot.service
```

2. Обновите systemd и активируйте сервис:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now tg-voice-userbot
```

3. Просмотр логов:
```bash
journalctl -u tg-voice-userbot -f
```

---

## 🛠 Выбор модели Whisper
| Модель | Размер VRAM/RAM | Скорость на CPU | Качество для русского |
| :--- | :--- | :--- | :--- |
| `tiny` | ~150 MB | Очень быстро | Базовое (могут быть опечатки) |
| `base` | ~250 MB | Быстро | Хорошее для простых фраз |
| `small` | ~600 MB | Оптимально | **Рекомендуется** (отличное качество) |
| `turbo` | ~1.8 GB | Средне | Великолепное качество (Large-v3-Turbo) |
| `large-v3` | ~3.2 GB | Медленнее | Максимальная точность |
