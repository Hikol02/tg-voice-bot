import React, { useState } from 'react';
import { Terminal, Shield, Check, Copy, AlertTriangle, BookOpen, Layers } from 'lucide-react';

export const DeploymentGuide: React.FC = () => {
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

  const copyToClipboard = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIndex(index);
    setTimeout(() => setCopiedIndex(null), 2000);
  };

  const steps = [
    {
      title: '1. Быстрая установка скриптом (Автоопределение CPU и дистрибутива)',
      desc: 'Скрипт install.sh сам определит процессор (если это AMD Phenom II без AVX — скомпилирует whisper.cpp с флагами совместимости), установит нужные пакеты (apt/dnf/pacman) и запросит настройки.',
      code: `curl -sSL https://raw.githubusercontent.com/YOUR_USER/tg-voice-userbot/main/install.sh -o install.sh
sudo bash install.sh`,
    },
    {
      title: '2. Публикация репозитория на GitHub',
      desc: 'Чтобы выложить проект в публичный доступ на GitHub и разворачивать на любых серверах в одну команду, запустите push_to_github.sh:',
      code: `bash push_to_github.sh`,
    },
    {
      title: '3. Управление юзерботом прямо из Telegram через команду .menu',
      desc: 'Отправьте в любой чат или в Избранное (Saved Messages) команду .menu. Бот превратит сообщение в панель настроек со статусом прокси, сменой языка и модели.',
      code: `.menu
.model base
.lang ru+en
.proxy`,
    },
    {
      title: '4. Проверка службы и фоновый режим (Systemd)',
      desc: 'Юзербот работает как системный сервис tg-voice-userbot.service под управлением systemd, автоматически перезапускается и читает динамический secret из tg-ws-proxy.',
      code: `sudo systemctl status tg-voice-userbot.service
sudo journalctl -u tg-voice-userbot.service -f`,
    },
  ];

  return (
    <div id="deployment-guide" className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden p-5 space-y-6">
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2.5">
          <BookOpen className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm sm:text-base font-bold text-slate-100">
            Пошаговое руководство по развертыванию на сервере
          </h2>
        </div>
        <span className="text-xs px-2.5 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800/60 font-medium">
          Linux VPS / Ubuntu 22.04+
        </span>
      </div>

      {/* Architecture Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
            <Layers className="w-3.5 h-3.5" />
            <span>Локальный STT Whisper</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Модель `faster-whisper` работает на CTranslate2 с квантованием `int8`. Скорость транскрибации ~0.4с на процессоре без утечек в сторонние API.
          </p>
        </div>

        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
            <Shield className="w-3.5 h-3.5" />
            <span>Авто-подхват tg-ws-proxy</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Модуль <code>proxy_resolver.py</code> считывает динамический секрет и порт (1443) прямо из systemd-логов <code>tg-ws-proxy</code> при старте бота.
          </p>
        </div>

        <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300">
            <Terminal className="w-3.5 h-3.5" />
            <span>Свёрнутая цитата (Telegram)</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Используется нативная сущность Telegram <code className="text-cyan-200">MessageEntityBlockquote(collapsed=True)</code> со смещением в UTF-16.
          </p>
        </div>
      </div>

      {/* Steps List */}
      <div className="space-y-4">
        {steps.map((step, idx) => (
          <div key={idx} className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs sm:text-sm font-semibold text-slate-200">
                {step.title}
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              {step.desc}
            </p>
            <div className="relative group">
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-cyan-200 overflow-x-auto select-all">
                {step.code}
              </pre>
              <button
                type="button"
                onClick={() => copyToClipboard(step.code, idx)}
                className="absolute top-2 right-2 p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors opacity-90 group-hover:opacity-100"
                title="Скопировать команду"
              >
                {copiedIndex === idx ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
