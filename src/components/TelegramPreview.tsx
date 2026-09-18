import React, { useState, useEffect } from 'react';
import { Play, Pause, ChevronDown, ChevronRight, CheckCheck, Sparkles, Mic, Volume2 } from 'lucide-react';
import { UserbotConfig } from '../types';

interface TelegramPreviewProps {
  config: UserbotConfig;
}

export const TelegramPreview: React.FC<TelegramPreviewProps> = ({ config }) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioProgress, setAudioProgress] = useState<number>(34);

  const sampleTranscriptions: Record<string, string> = {
    ru: 'Привет! Я запушил новый коммит в репозиторий, пофиксил баг с whisper.cpp на процессоре Phenom II и проверил деплой через tg-ws-proxy. Нажми на цитату, чтобы развернуть!',
    'ru+en': 'Привет! Я только что сделал pull request и запушил коммит. Бот на whisper.cpp отлично распознал англицизмы и IT-термины прямо на локальном CPU.',
    en: 'Hello! I just pushed a new commit and deployed the userbot. Everything works directly on the local CPU without external cloud dependencies.',
  };

  const sampleText = sampleTranscriptions[config.languageMode] || sampleTranscriptions.ru;

  useEffect(() => {
    let timer: any;
    if (isPlaying) {
      timer = setInterval(() => {
        setAudioProgress((prev) => {
          if (prev >= 100) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 3;
        });
      }, 100);
    }
    return () => clearInterval(timer);
  }, [isPlaying]);

  return (
    <div id="telegram-preview-card" className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/60 flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-xs font-semibold text-slate-200">
            Превью в Telegram: Свёрнутая цитата
          </span>
        </div>
        <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
          MessageEntityBlockquote(collapsed=True)
        </span>
      </div>

      {/* Telegram Chat Canvas */}
      <div className="p-4 sm:p-5 flex-1 flex flex-col justify-center bg-[#0e1621] relative overflow-hidden">
        {/* Telegram Chat Wallpaper Pattern simulation */}
        <div className="absolute inset-0 opacity-5 pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:16px_16px]"></div>

        <div className="w-full max-w-md ml-auto relative z-10">
          {/* Outgoing Message Bubble (Telegram Blue/Teal) */}
          <div className="bg-[#2b5278] text-white rounded-2xl rounded-tr-xs p-3.5 shadow-lg border border-[#3b6692]/40 relative">
            {/* Voice Message Player Row */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-10 h-10 rounded-full bg-white text-[#2b5278] flex items-center justify-center shrink-0 hover:scale-105 active:scale-95 transition-all shadow-md"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
              </button>

              <div className="flex-1 min-w-0">
                {/* Waveform graphic */}
                <div className="flex items-center gap-0.5 h-6 mb-1">
                  {[40, 60, 25, 80, 100, 45, 70, 90, 30, 85, 65, 40, 95, 75, 50, 30, 85, 60, 40, 70, 30, 50, 80, 20].map((h, i) => {
                    const isPlayed = (i / 24) * 100 <= audioProgress;
                    return (
                      <div
                        key={i}
                        className={`flex-1 rounded-full transition-all duration-150 ${
                          isPlayed ? 'bg-cyan-300' : 'bg-white/40'
                        }`}
                        style={{ height: `${Math.max(15, (h * (isPlaying ? 1 : 0.85)))}%` }}
                      ></div>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between text-[11px] text-cyan-200/90 font-mono">
                  <span>0:{Math.floor((audioProgress * 0.12)).toString().padStart(2, '0')}</span>
                  <span>0:12</span>
                </div>
              </div>
            </div>

            {/* Collapsible Blockquote (Свёрнутая цитата) */}
            <div className="mt-3 pt-2 border-t border-white/15">
              {config.quoteHeader && (
                <div className="text-[11px] font-semibold text-cyan-200 mb-1 flex items-center gap-1">
                  <Mic className="w-3 h-3 text-cyan-300" />
                  <span>{config.quoteHeader}</span>
                </div>
              )}

              {/* The native Telegram Expandable Blockquote UI */}
              <div
                onClick={() => setIsExpanded(!isExpanded)}
                className="group cursor-pointer pl-3 pr-2 py-1.5 border-l-[3px] border-cyan-400 bg-black/20 hover:bg-black/30 rounded-r-lg transition-all"
              >
                <div className="flex items-start justify-between gap-2">
                  <div
                    className={`text-xs text-slate-100 leading-relaxed transition-all ${
                      !isExpanded ? 'line-clamp-2 select-none' : ''
                    }`}
                  >
                    {sampleText}
                  </div>

                  <div className="shrink-0 mt-0.5 text-cyan-300 group-hover:text-white transition-colors">
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>
                </div>

                {/* Telegram expand button / hint */}
                <div className="mt-1 flex items-center justify-between text-[10px] text-cyan-300/80 font-medium select-none">
                  <span>{isExpanded ? 'Свернуть цитату' : 'Показать полностью...'}</span>
                  <span className="text-[9px] bg-cyan-400/20 text-cyan-200 px-1.5 py-0.2 rounded">
                    {config.whisperModelSize} • {config.whisperDevice}
                  </span>
                </div>
              </div>
            </div>

            {/* Message metadata (time & checkmarks) */}
            <div className="mt-1.5 flex items-center justify-end gap-1 text-[10px] text-cyan-200/70">
              <span>19:42</span>
              <CheckCheck className="w-3.5 h-3.5 text-cyan-300 inline" />
            </div>
          </div>

          <div className="mt-2 text-right text-[11px] text-slate-400 flex items-center justify-end gap-1.5">
            <Sparkles className="w-3 h-3 text-cyan-400" />
            <span>Автоматически добавлено юзерботом через {config.proxyType === 'NONE' ? 'прямое' : 'WS/MTProto'} соединение</span>
          </div>
        </div>
      </div>
    </div>
  );
};
