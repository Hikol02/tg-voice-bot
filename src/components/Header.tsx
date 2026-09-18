import React from 'react';
import { Bot, Mic, ShieldCheck, Download, Copy, Check } from 'lucide-react';

interface HeaderProps {
  onDownloadZip: () => void;
  onCopyEnv: () => void;
  copiedEnv: boolean;
  isDownloading: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  onDownloadZip,
  onCopyEnv,
  copiedEnv,
  isDownloading,
}) => {
  return (
    <header id="app-header" className="bg-slate-900 border-b border-slate-800 text-slate-100 sticky top-0 z-30 shadow-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-bold">
            <Mic className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Telethon Voice Transcriber
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  Python Userbot
                </span>
              </h1>
            </div>
            <p className="text-xs text-slate-400">
              Локальная расшифровка голосовых сообщений (faster-whisper) со свёрнутыми цитатами через WS MTProto
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            id="btn-copy-env-header"
            onClick={onCopyEnv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            {copiedEnv ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Скопировано .env</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Скопировать .env</span>
              </>
            )}
          </button>

          <button
            id="btn-download-zip-header"
            onClick={onDownloadZip}
            disabled={isDownloading}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white shadow-sm shadow-cyan-600/30 transition-all disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isDownloading ? 'Сборка архива...' : 'Скачать проект (.ZIP)'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
