FROM python:3.11-slim

# Установка системных зависимостей (ffmpeg необходим для обработки Opus/Ogg)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    git \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Создаем папку для моделей и сессий
RUN mkdir -p /app/models /app/sessions

CMD ["python", "-u", "userbot.py"]
