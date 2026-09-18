import React, { useState } from 'react';
import { Copy, Check, Download, FileCode, Terminal, FileText, CheckCircle2 } from 'lucide-react';
import { ProjectFile } from '../types';

interface CodeViewerProps {
  files: ProjectFile[];
  activeFileIndex: number;
  onSelectFile: (index: number) => void;
  onDownloadSingleFile: (file: ProjectFile) => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({
  files,
  activeFileIndex,
  onSelectFile,
  onDownloadSingleFile,
}) => {
  const [copied, setCopied] = useState<boolean>(false);
  const currentFile = files[activeFileIndex] || files[0];

  const handleCopy = () => {
    navigator.clipboard.writeText(currentFile.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getFileIcon = (name: string) => {
    if (name.endsWith('.py')) return <FileCode className="w-3.5 h-3.5 text-cyan-400" />;
    if (name.endsWith('.service') || name.endsWith('.env')) return <Terminal className="w-3.5 h-3.5 text-amber-400" />;
    return <FileText className="w-3.5 h-3.5 text-slate-400" />;
  };

  const lines = currentFile.content.split('\n');

  return (
    <div id="code-viewer" className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden flex flex-col">
      {/* File Navigation Tabs */}
      <div className="flex items-center justify-between border-b border-slate-800 bg-slate-950/80 px-2 pt-2 overflow-x-auto">
        <div className="flex items-center space-x-1 min-w-max pb-0.5">
          {files.map((f, i) => (
            <button
              key={f.path}
              id={`file-tab-${f.name.replace(/[^a-zA-Z0-9]/g, '-')}`}
              onClick={() => onSelectFile(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-t-lg transition-colors ${
                activeFileIndex === i
                  ? 'bg-slate-900 text-cyan-300 border-t-2 border-cyan-500 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-850'
              }`}
            >
              {getFileIcon(f.name)}
              <span>{f.name}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 pb-1.5 pr-2">
          <button
            id="btn-copy-code"
            onClick={handleCopy}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            title="Скопировать содержимое текущего файла"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-emerald-400" />
                <span className="text-emerald-400">Скопировано</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3 text-slate-400" />
                <span>Копировать</span>
              </>
            )}
          </button>

          <button
            id="btn-download-single-file"
            onClick={() => onDownloadSingleFile(currentFile)}
            className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            title="Скачать этот файл"
          >
            <Download className="w-3 h-3 text-slate-400" />
            <span>Скачать</span>
          </button>
        </div>
      </div>

      {/* File Description Header */}
      <div className="px-4 py-2 bg-slate-950/40 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <span className="truncate pr-4">{currentFile.description}</span>
        <span className="font-mono text-[11px] text-slate-500 shrink-0">
          {lines.length} строк • {currentFile.language}
        </span>
      </div>

      {/* Code Display with Line Numbers */}
      <div className="p-3 bg-slate-950 font-mono text-xs overflow-x-auto max-h-[520px] overflow-y-auto leading-relaxed text-slate-200">
        <table className="w-full border-collapse">
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx} className="hover:bg-slate-900/60 group">
                <td className="w-10 pr-3 text-right select-none text-slate-600 group-hover:text-slate-400 text-[11px] align-top">
                  {idx + 1}
                </td>
                <td className="whitespace-pre pl-2 text-slate-200 select-text font-mono">
                  {line || ' '}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
