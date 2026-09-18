export type ProxyType = 'MTPROTO' | 'SOCKS5' | 'NONE';

export type WhisperModelSize = 'tiny' | 'base' | 'small' | 'medium' | 'turbo' | 'large-v3';

export type DeviceType = 'cpu' | 'cuda';

export type ActionMode = 'edit' | 'reply';

export interface UserbotConfig {
  apiId: string;
  apiHash: string;
  phoneNumber: string;
  sessionName: string;
  proxyEnabled: boolean;
  proxyType: ProxyType;
  autoFetchProxySecret: boolean;
  tgWsProxyService: string;
  mtprotoHost: string;
  mtprotoPort: number;
  mtprotoSecret: string;
  socksHost: string;
  socksPort: number;
  socksUsername: string;
  socksPassword: string;
  whisperModelSize: WhisperModelSize;
  whisperDevice: DeviceType;
  whisperComputeType: string;
  whisperLanguage: string;
  languageMode: 'ru+en' | 'ru' | 'auto' | 'en';
  sttEngine: 'whisper.cpp' | 'faster_whisper';
  whisperBeamSize: number;
  whisperVadFilter: boolean;
  actionMode: ActionMode;
  quoteHeader: string;
  processRoundVideos: boolean;
  notifyIfEmpty: boolean;
  logLevel: string;
}

export interface ProjectFile {
  name: string;
  path: string;
  language: string;
  description: string;
  content: string;
}
