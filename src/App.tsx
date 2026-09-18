import React, { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { Terminal, Download, Copy, Check, AlertTriangle, Play, Square, RefreshCw, FileText } from 'lucide-react';
import { ConfigPanel } from './components/ConfigPanel';
import { CodeViewer } from './components/CodeViewer';
import { UserbotConfig, ProjectFile } from './types';
import { generateConfigFiles, generateEnv } from './data/codeTemplates';

export default function App() {
  const [config, setConfig] = useState<UserbotConfig>({
    apiId: '',
    apiHash: '',
    phoneNumber: '',
    sessionName: 'voice_transcriber_session',
    proxyEnabled: true,
    proxyType: 'MTPROTO',
    autoFetchProxySecret: true,
    tgWsProxyService: 'tg-ws-proxy.service',
    mtprotoHost: '127.0.0.1',
    mtprotoPort: 1443,
    mtprotoSecret: 'dd54defaad7b9d6abf694539af11efe10b',
    socksHost: '127.0.0.1',
    socksPort: 10808,
    socksUsername: '',
    socksPassword: '',
    whisperModelSize: 'small',
    whisperDevice: 'cpu',
    whisperComputeType: 'int8',
    whisperLanguage: 'ru',
    languageMode: 'ru+en',
    sttEngine: 'whisper.cpp',
    whisperBeamSize: 5,
    whisperVadFilter: true,
    actionMode: 'edit',
    quoteHeader: '',
    processRoundVideos: true,
    notifyIfEmpty: false,
    logLevel: 'INFO',
  });

  const [activeFileIndex, setActiveFileIndex] = useState<number>(0);
  const [copiedEnv, setCopiedEnv] = useState<boolean>(false);
  const [isDownloading, setIsDownloading] = useState<boolean>(false);

  const projectFiles: ProjectFile[] = useMemo(() => {
    return generateConfigFiles(config);
  }, [config]);

  const handleCopyEnv = () => {
    const envContent = generateEnv(config);
    navigator.clipboard.writeText(envContent);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  const handleDownloadSingleFile = (file: ProjectFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadZip = async () => {
    try {
      setIsDownloading(true);
      const zip = new JSZip();

      projectFiles.forEach((file) => {
        zip.file(file.path, file.content);
      });

      const content = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(content);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'tg-voice-transcriber-userbot.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Ошибка при создании ZIP-архива:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-mono text-sm selection:bg-cyan-500/30 selection:text-cyan-200">
      {/* Top Bar */}
      <header id="app-header" className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <Terminal className="w-5 h-5 text-emerald-400" />
          <span className="font-bold text-white tracking-wide">TG-VOICE-USERBOT</span>
          <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
            CLI Daemon
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            id="btn-copy-env"
            onClick={handleCopyEnv}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
          >
            {copiedEnv ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span className="text-emerald-400">Скопировано</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-400" />
                <span>Скопировать .env</span>
              </>
            )}
          </button>

          <button
            id="btn-download-zip"
            onClick={handleDownloadZip}
            disabled={isDownloading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-cyan-600 hover:bg-cyan-500 text-white transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isDownloading ? 'Сборка...' : 'Скачать ZIP'}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 space-y-6">
        {/* Urgent Server Diagnostic Banner */}
        <section id="server-status-banner" className="bg-amber-950/40 border border-amber-500/40 rounded-lg p-4 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                Внимание: Зацикливание systemd и временная блокировка Telegram (FloodWait)
              </h2>
              <p className="text-xs text-amber-200/80 leading-relaxed font-sans">
                Служба <code className="bg-amber-900/60 px-1 py-0.5 rounded text-amber-100">tg-voice-userbot.service</code> сейчас непрерывно падает и перезапускается в фоне (счётчик рестартов &gt; 300), потому что сессия ещё не авторизована, а systemd не может передать ввод кода подтверждения. Это отправляет запросы в цикле и продлевает тайм-аут Telegram.
              </p>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded p-3 text-xs space-y-2">
            <div className="text-slate-400 font-sans font-medium">Выполните на сервере по шагам:</div>
            <div className="space-y-1.5 font-mono text-emerald-400">
              <div><span className="text-slate-500"># 1. Остановите аварийно перезапускающийся сервис:</span></div>
              <div className="bg-slate-900 px-2 py-1 rounded text-slate-100 selection:bg-emerald-500/30">
                systemctl stop tg-voice-userbot.service
              </div>

              <div className="pt-1"><span className="text-slate-500"># 2. Подождите 2-3 минуты (пока спадет блокировка FloodWait 127s)</span></div>

              <div className="pt-1"><span className="text-slate-500"># 3. Запустите юзербот вручную из консоли для однократной авторизации:</span></div>
              <div className="bg-slate-900 px-2 py-1 rounded text-slate-100 selection:bg-emerald-500/30">
                cd /opt/tg_voice_userbot && /opt/tg_voice_userbot/venv/bin/python userbot.py
              </div>
              <div className="text-slate-400 text-[11px] font-sans">
                (Введите код и 2FA пароль прямо в терминале. Когда напишет "Authorized successfully as...", нажмите <kbd className="px-1 py-0.5 bg-slate-800 rounded border border-slate-700">Ctrl+C</kbd>)
              </div>

              <div className="pt-1"><span className="text-slate-500"># 4. Теперь снова включите фоновую службу systemd:</span></div>
              <div className="bg-slate-900 px-2 py-1 rounded text-slate-100 selection:bg-emerald-500/30">
                systemctl start tg-voice-userbot.service
              </div>
            </div>
          </div>
        </section>

        {/* Configuration Editor */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Параметры конфигурации
            </h2>
            <span className="text-xs text-slate-400 font-sans">
              Настройки .env и whisper.cpp
            </span>
          </div>
          <ConfigPanel config={config} onChange={setConfig} />
        </section>

        {/* Project Files Viewer */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <FileText className="w-4 h-4 text-cyan-400" />
              Файлы проекта
              <span className="text-xs px-2 py-0.2 rounded bg-slate-800 text-cyan-300 border border-slate-700 font-normal">
                {projectFiles.length}
              </span>
            </h2>
          </div>

          <CodeViewer
            files={projectFiles}
            activeFileIndex={activeFileIndex}
            onSelectFile={setActiveFileIndex}
            onDownloadSingleFile={handleDownloadSingleFile}
          />
        </section>
      </main>
    </div>
  );
}
