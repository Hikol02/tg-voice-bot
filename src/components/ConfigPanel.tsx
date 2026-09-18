import React, { useState } from 'react';
import {
  Key,
  Network,
  Cpu,
  Settings2,
  HelpCircle,
  Sparkles,
  Info,
  Server,
  Zap,
} from 'lucide-react';
import { UserbotConfig, ProxyType, WhisperModelSize, DeviceType, ActionMode } from '../types';

interface ConfigPanelProps {
  config: UserbotConfig;
  onChange: (cfg: UserbotConfig) => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onChange }) => {
  const [activeTab, setActiveTab] = useState<'creds' | 'proxy' | 'stt' | 'behavior'>('creds');

  const update = <K extends keyof UserbotConfig>(key: K, value: UserbotConfig[K]) => {
    onChange({ ...config, [key]: value });
  };

  return (
    <div id="config-panel" className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full">
      {/* Navigation tabs */}
      <div className="flex border-b border-slate-800 bg-slate-950/60 px-3 pt-3 gap-1.5 overflow-x-auto text-xs">
        <button
          id="tab-creds"
          onClick={() => setActiveTab('creds')}
          className={`flex items-center gap-2 px-3 py-2 rounded-t-xl font-medium transition-colors ${
            activeTab === 'creds'
              ? 'bg-slate-900 text-cyan-400 border-t border-x border-slate-800 -mb-px'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>Telegram API</span>
        </button>

        <button
          id="tab-proxy"
          onClick={() => setActiveTab('proxy')}
          className={`flex items-center gap-2 px-3 py-2 rounded-t-xl font-medium transition-colors ${
            activeTab === 'proxy'
              ? 'bg-slate-900 text-cyan-400 border-t border-x border-slate-800 -mb-px'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Прокси (WS/MTProto)</span>
        </button>

        <button
          id="tab-stt"
          onClick={() => setActiveTab('stt')}
          className={`flex items-center gap-2 px-3 py-2 rounded-t-xl font-medium transition-colors ${
            activeTab === 'stt'
              ? 'bg-slate-900 text-cyan-400 border-t border-x border-slate-800 -mb-px'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-3.5 h-3.5" />
          <span>STT Модель (Whisper)</span>
        </button>

        <button
          id="tab-behavior"
          onClick={() => setActiveTab('behavior')}
          className={`flex items-center gap-2 px-3 py-2 rounded-t-xl font-medium transition-colors ${
            activeTab === 'behavior'
              ? 'bg-slate-900 text-cyan-400 border-t border-x border-slate-800 -mb-px'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Settings2 className="w-3.5 h-3.5" />
          <span>Поведение</span>
        </button>
      </div>

      {/* Tab content */}
      <div className="p-4 sm:p-5 overflow-y-auto max-h-[480px] space-y-4 text-sm">
        {/* 1. TELEGRAM API CREDENTIALS */}
        {activeTab === 'creds' && (
          <div className="space-y-4">
            <div className="p-3 bg-cyan-950/30 border border-cyan-800/40 rounded-xl text-xs text-cyan-200 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
              <div>
                <span>Получить </span>
                <strong className="text-white">API_ID</strong> и <strong className="text-white">API_HASH</strong>
                <span> можно бесплатно на официальном портале Telegram: </span>
                <a
                  href="https://my.telegram.org"
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-cyan-300 font-semibold hover:text-white"
                >
                  my.telegram.org
                </a>
                <span> → раздел «API development tools».</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  TELEGRAM_API_ID
                </label>
                <input
                  type="text"
                  placeholder="Например: 24591024"
                  value={config.apiId}
                  onChange={(e) => update('apiId', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  TELEGRAM_API_HASH
                </label>
                <input
                  type="text"
                  placeholder="32-значный hex хеш"
                  value={config.apiHash}
                  onChange={(e) => update('apiHash', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Номер телефона (опционально)
                </label>
                <input
                  type="text"
                  placeholder="+79991234567"
                  value={config.phoneNumber}
                  onChange={(e) => update('phoneNumber', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Ускоряет первый вход, Telethon сразу запросит SMS/код из Telegram
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Имя файла сессии (.session)
                </label>
                <input
                  type="text"
                  value={config.sessionName}
                  onChange={(e) => update('sessionName', e.target.value)}
                  className="w-full px-3 py-2 bg-slate-800/80 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  Файл сохранится локально на сервере после разовой авторизации
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 2. PROXY SETTINGS */}
        {activeTab === 'proxy' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-slate-800/50 border border-slate-700/60 rounded-xl">
              <div>
                <span className="font-semibold text-xs text-slate-200">Использовать проксирование</span>
                <p className="text-[11px] text-slate-400">
                  Подключение к Telegram через локальный прокси
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.proxyEnabled}
                  onChange={(e) => update('proxyEnabled', e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
              </label>
            </div>

            {config.proxyEnabled && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Тип локального прокси
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => update('proxyType', 'MTPROTO')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        config.proxyType === 'MTPROTO'
                          ? 'border-cyan-500 bg-cyan-950/30 text-cyan-200'
                          : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-semibold text-xs flex items-center gap-1.5">
                        <Zap className="w-3.5 h-3.5 text-cyan-400" />
                        MTProto Proxy (WS / MTG)
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Локальный WebSocket MTProto прокси (mtg, telepy, wstunnel)
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => update('proxyType', 'SOCKS5')}
                      className={`p-3 rounded-xl border text-left transition-all ${
                        config.proxyType === 'SOCKS5'
                          ? 'border-cyan-500 bg-cyan-950/30 text-cyan-200'
                          : 'border-slate-700 bg-slate-800/40 text-slate-300 hover:border-slate-600'
                      }`}
                    >
                      <div className="font-semibold text-xs flex items-center gap-1.5">
                        <Network className="w-3.5 h-3.5 text-cyan-400" />
                        SOCKS5 / HTTP (Xray / Gost)
                      </div>
                      <div className="text-[11px] text-slate-400 mt-1">
                        Локальный клиент WS-туннеля (xray, v2ray, gost)
                      </div>
                    </button>
                  </div>
                </div>

                {config.proxyType === 'MTPROTO' ? (
                  <div className="space-y-3.5 p-3.5 bg-slate-950/40 border border-slate-800 rounded-xl">
                    {/* Auto fetch secret toggle */}
                    <div className="p-3 bg-cyan-950/30 border border-cyan-800/50 rounded-xl flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold text-xs text-cyan-300">
                          <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                          <span>Автоподхват secret и port из tg-ws-proxy</span>
                        </div>
                        <p className="text-[11px] text-cyan-200/80 leading-relaxed">
                          Сервис <code>Flowseal/tg-ws-proxy</code> генерирует новый секрет при каждом перезапуске. Бот автоматически прочитает ссылку <code>tg://proxy?server=...&port=...&secret=...</code> из <code>journalctl</code> при старте!
                        </p>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-0.5">
                        <input
                          type="checkbox"
                          checked={config.autoFetchProxySecret}
                          onChange={(e) => update('autoFetchProxySecret', e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                      </label>
                    </div>

                    {config.autoFetchProxySecret && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Имя systemd сервиса tg-ws-proxy
                        </label>
                        <input
                          type="text"
                          value={config.tgWsProxyService}
                          onChange={(e) => update('tgWsProxyService', e.target.value)}
                          placeholder="tg-ws-proxy.service"
                          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono"
                        />
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Хост MTProto {config.autoFetchProxySecret && <span className="text-[10px] text-slate-400">(запасной)</span>}
                        </label>
                        <input
                          type="text"
                          value={config.mtprotoHost}
                          onChange={(e) => update('mtprotoHost', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Порт {config.autoFetchProxySecret && <span className="text-[10px] text-slate-400">(запасной)</span>}
                        </label>
                        <input
                          type="number"
                          value={config.mtprotoPort}
                          onChange={(e) => update('mtprotoPort', parseInt(e.target.value) || 1443)}
                          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        MTProto Секрет {config.autoFetchProxySecret && <span className="text-[10px] text-slate-400">(запасной)</span>}
                      </label>
                      <input
                        type="text"
                        value={config.mtprotoSecret}
                        onChange={(e) => update('mtprotoSecret', e.target.value)}
                        className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">
                        {config.autoFetchProxySecret
                          ? 'Будет автоматически перезаписан актуальным ключом из journalctl tg-ws-proxy при запуске юзербота.'
                          : 'Telethon использует ConnectionTcpMTProxyRandomizedIntermediate для полной маскировки трафика.'}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 p-3.5 bg-slate-950/40 border border-slate-800 rounded-xl">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="col-span-2">
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Хост SOCKS5
                        </label>
                        <input
                          type="text"
                          value={config.socksHost}
                          onChange={(e) => update('socksHost', e.target.value)}
                          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Порт
                        </label>
                        <input
                          type="number"
                          value={config.socksPort}
                          onChange={(e) => update('socksPort', parseInt(e.target.value) || 10808)}
                          className="w-full px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-xs font-mono"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* 3. STT MODEL (FASTER-WHISPER) */}
        {activeTab === 'stt' && (
          <div className="space-y-4">
            {/* Engine Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Движок распознавания (STT Engine)</span>
                <span className="text-[11px] font-normal text-cyan-400">Автоопределение архитектуры</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => update('sttEngine', 'whisper.cpp')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    config.sttEngine === 'whisper.cpp'
                      ? 'border-cyan-500 bg-cyan-950/30 text-white'
                      : 'border-slate-800 bg-slate-800/30 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span>whisper.cpp (C/C++)</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">Все CPU (Phenom II)</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Компилируется нативно через GCC. Работает без инструкций AVX/AVX2/FMA на любых серверах.
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => update('sttEngine', 'faster_whisper')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    config.sttEngine === 'faster_whisper'
                      ? 'border-cyan-500 bg-cyan-950/30 text-white'
                      : 'border-slate-800 bg-slate-800/30 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5">
                    <span>faster-whisper (CTranslate2)</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">Требует AVX2</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Высокая скорость на современных процессорах Intel/AMD (Core i, Ryzen, Xeon с AVX2).
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Размер модели</span>
                <span className="text-[11px] font-normal text-cyan-400">Локальная обработка на CPU</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { id: 'tiny', name: 'tiny', size: '~75 MB', desc: 'Ультралегкая' },
                  { id: 'base', name: 'base', size: '~145 MB', desc: 'Быстрая' },
                  { id: 'small', name: 'small', size: '~480 MB', desc: 'Оптимально (RU)', badge: 'Хит' },
                  { id: 'medium', name: 'medium', size: '~1.5 GB', desc: 'Высокая точность' },
                  { id: 'turbo', name: 'turbo', size: '~1.6 GB', desc: 'Large-v3-Turbo', badge: 'Топ' },
                  { id: 'large-v3', name: 'large-v3', size: '~3 GB', desc: 'Максимум' },
                ].map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => update('whisperModelSize', m.id as WhisperModelSize)}
                    className={`p-2.5 rounded-xl border text-left relative transition-all ${
                      config.whisperModelSize === m.id
                        ? 'border-cyan-500 bg-cyan-950/30 text-white'
                        : 'border-slate-800 bg-slate-800/30 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    {m.badge && (
                      <span className="absolute top-2 right-2 text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                        {m.badge}
                      </span>
                    )}
                    <div className="font-semibold text-xs">{m.name}</div>
                    <div className="text-[10px] text-slate-400">{m.size}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Устройство вычислений
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      update('whisperDevice', 'cpu');
                      update('whisperComputeType', 'int8');
                    }}
                    className={`p-2 rounded-lg border text-xs font-medium text-center ${
                      config.whisperDevice === 'cpu'
                        ? 'border-cyan-500 bg-cyan-950/30 text-cyan-200'
                        : 'border-slate-800 bg-slate-800/30 text-slate-400'
                    }`}
                  >
                    CPU (Процессор)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      update('whisperDevice', 'cuda');
                      update('whisperComputeType', 'float16');
                    }}
                    className={`p-2 rounded-lg border text-xs font-medium text-center ${
                      config.whisperDevice === 'cuda'
                        ? 'border-cyan-500 bg-cyan-950/30 text-cyan-200'
                        : 'border-slate-800 bg-slate-800/30 text-slate-400'
                    }`}
                  >
                    GPU (NVIDIA CUDA)
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Язык и обработка англицизмов
                </label>
                <select
                  value={config.languageMode}
                  onChange={(e) => update('languageMode', e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-medium"
                >
                  <option value="ru+en">Русский с IT англицизмами (ru+en prompt) — Рекомендуется</option>
                  <option value="ru">Только русский (ru)</option>
                  <option value="auto">Автоопределение языка (auto)</option>
                  <option value="en">Английский (en)</option>
                </select>
                <p className="text-[11px] text-slate-400 mt-1">
                  При режиме <code>ru+en</code> Whisper использует контекстный промпт и корректно распознаёт английские термины (commit, push, dev, fix) без искажений.
                </p>
              </div>
            </div>

            <div className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-semibold text-xs text-slate-200">VAD Фильтр (Silero VAD)</span>
                <p className="text-[11px] text-slate-400">
                  Автоматически отсекает паузы и тишину, повышая скорость и точность
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.whisperVadFilter}
                onChange={(e) => update('whisperVadFilter', e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 bg-slate-800 border-slate-700"
              />
            </div>
          </div>
        )}

        {/* 4. BEHAVIOR & FORMATTING */}
        {activeTab === 'behavior' && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Действие с расшифровкой
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => update('actionMode', 'edit')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    config.actionMode === 'edit'
                      ? 'border-cyan-500 bg-cyan-950/30 text-cyan-200'
                      : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs">Редактировать сообщение (Edit)</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Текст добавляется под плеером голосового сообщения (чисто и нативно)
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => update('actionMode', 'reply')}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    config.actionMode === 'reply'
                      ? 'border-cyan-500 bg-cyan-950/30 text-cyan-200'
                      : 'border-slate-800 bg-slate-800/40 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs">Ответ на сообщение (Reply)</div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    Отправляет отдельное сообщение-ответ со свёрнутой цитатой
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center justify-between">
                <span>Заголовок перед свёрнутой цитатой</span>
                <span className="text-[11px] text-slate-400 font-normal">Оставьте пустым для чистой цитаты без текста и эмодзи</span>
              </label>
              <input
                type="text"
                value={config.quoteHeader}
                onChange={(e) => update('quoteHeader', e.target.value)}
                placeholder="Оставить пустым (только свёрнутая цитата)"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 text-xs focus:outline-none focus:border-cyan-500 font-mono"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Если поле пустое, текст сообщения будет содержать только чистый блок цитаты без лишних префиксов и эмодзи.
              </p>
            </div>

            {/* In-chat .menu commands card */}
            <div className="p-3.5 bg-slate-950/60 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-xs text-cyan-300">Быстрое меню в Telegram: команда .menu</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">.menu</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-relaxed">
                Напишите в любом чате или в Избранном команду <code>.menu</code> — бот мгновенно отредактирует сообщение в интерактивную панель управления с текущими статусами и быстрыми переключателями:
              </p>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[11px] text-slate-400 bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
                <div><code>.model &lt;base|small&gt;</code></div>
                <div><code>.lang &lt;ru+en|ru|auto&gt;</code></div>
                <div><code>.mode &lt;edit|reply&gt;</code></div>
                <div><code>.proxy</code> (статус tg-ws-proxy)</div>
              </div>
            </div>

            <div className="p-3 bg-slate-800/50 border border-slate-700/60 rounded-xl flex items-center justify-between">
              <div>
                <span className="font-semibold text-xs text-slate-200">Расшифровывать кружочки (Video Notes)</span>
                <p className="text-[11px] text-slate-400">
                  Юзербот также будет перехватывать и транскрибировать видеосообщения
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.processRoundVideos}
                onChange={(e) => update('processRoundVideos', e.target.checked)}
                className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-400 bg-slate-800 border-slate-700"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
