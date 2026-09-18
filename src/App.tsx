import React, { useState, useMemo } from 'react';
import JSZip from 'jszip';
import { Header } from './components/Header';
import { ConfigPanel } from './components/ConfigPanel';
import { TelegramPreview } from './components/TelegramPreview';
import { CodeViewer } from './components/CodeViewer';
import { DeploymentGuide } from './components/DeploymentGuide';
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
    whisperModelSize: 'base',
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

  // Generate dynamic project files based on the reactive user configuration
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

      // Add all project files into zip root
      projectFiles.forEach((file) => {
        zip.file(file.path, file.content);
      });

      // Add userbot.service and README.md
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
      <Header
        onDownloadZip={handleDownloadZip}
        onCopyEnv={handleCopyEnv}
        copiedEnv={copiedEnv}
        isDownloading={isDownloading}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Top Grid: Configurator + Live Telegram Expandable Blockquote Preview */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          <div className="lg:col-span-7 flex flex-col">
            <ConfigPanel config={config} onChange={setConfig} />
          </div>
          <div className="lg:col-span-5 flex flex-col">
            <TelegramPreview config={config} />
          </div>
        </section>

        {/* Middle Section: Full Project Code Viewer */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                Исходный код проекта
                <span className="text-xs px-2 py-0.5 rounded font-mono font-normal bg-slate-800 text-cyan-300 border border-slate-700">
                  {projectFiles.length} файлов
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Все файлы обновляются на лету в соответствии с вашими настройками в панели выше.
              </p>
            </div>
          </div>

          <CodeViewer
            files={projectFiles}
            activeFileIndex={activeFileIndex}
            onSelectFile={setActiveFileIndex}
            onDownloadSingleFile={handleDownloadSingleFile}
          />
        </section>

        {/* Bottom Section: Step-by-Step Deployment Guide */}
        <section>
          <DeploymentGuide />
        </section>
      </main>

      <footer className="border-t border-slate-900 bg-slate-950/80 text-slate-500 py-5 text-center text-xs">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Telegram Voice Transcriber Userbot • Telethon + faster-whisper (CTranslate2)
          </span>
          <span className="text-slate-400">
            Локальная STT-обработка без отправки голоса в облачные сервисы
          </span>
        </div>
      </footer>
    </div>
  );
}
