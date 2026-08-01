/**
 * chrome.storage 包装
 * - 配置: chrome.storage.sync (跨设备同步, 8KB/项 100KB 总)
 * - 日志: chrome.storage.local (大, 10MB 总)
 *
 * 设计目标:
 *  1. 类型安全 (AppConfig)
 *  2. 监听变更 → 内存缓存 + 回调广播
 */

import { DEFAULT_CONFIG, type AppConfig, type LogEntry } from './types';

const CONFIG_KEY = 'vibcoding:config:v1';
const LOGS_KEY = 'vibcoding:logs:v1';
const MAX_LOGS = 200;

type ConfigListener = (cfg: AppConfig) => void;

let cachedConfig: AppConfig | null = null;
const configListeners = new Set<ConfigListener>();

function storageArea() {
  return chrome.storage.sync;
}

function logsArea() {
  return chrome.storage.local;
}

export async function getConfig(): Promise<AppConfig> {
  if (cachedConfig) return cachedConfig;
  const raw = await storageArea().get(CONFIG_KEY);
  const cfg = (raw[CONFIG_KEY] as AppConfig | undefined) ?? DEFAULT_CONFIG;
  cachedConfig = cfg;
  return cfg;
}

export async function setConfig(next: AppConfig): Promise<void> {
  cachedConfig = next;
  await storageArea().set({ [CONFIG_KEY]: next });
}

export async function updateConfig(mutator: (cfg: AppConfig) => AppConfig): Promise<AppConfig> {
  const cur = await getConfig();
  const next = mutator(cur);
  await setConfig(next);
  return next;
}

export function onConfigChange(listener: ConfigListener): () => void {
  configListeners.add(listener);
  return () => configListeners.delete(listener);
}

// 监听 storage 变更, 让多上下文保持一致
if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'sync' && changes[CONFIG_KEY]) {
      const newCfg = (changes[CONFIG_KEY].newValue as AppConfig | undefined) ?? DEFAULT_CONFIG;
      cachedConfig = newCfg;
      configListeners.forEach((l) => {
        try {
          l(newCfg);
        } catch (e) {
          console.error('[vibcoding-ext] config listener error', e);
        }
      });
    }
  });
}

// ---------- 日志 ----------

export async function appendLog(entry: LogEntry): Promise<LogEntry[]> {
  const raw = await logsArea().get(LOGS_KEY);
  const list = ((raw[LOGS_KEY] as LogEntry[] | undefined) ?? []).slice(0, MAX_LOGS);
  list.unshift(entry);
  await logsArea().set({ [LOGS_KEY]: list });
  return list;
}

export async function getLogs(): Promise<LogEntry[]> {
  const raw = await logsArea().get(LOGS_KEY);
  return (raw[LOGS_KEY] as LogEntry[] | undefined) ?? [];
}

export async function clearLogs(): Promise<void> {
  await logsArea().set({ [LOGS_KEY]: [] });
}
