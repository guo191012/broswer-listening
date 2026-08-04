import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FloatingDot } from './FloatingDot';
import { SidePanel } from './SidePanel';
import { getConfig, setConfig, appendLog, getLogs, clearLogs } from '../shared/storage';
import { MessageType, isExtensionMessage, type ExtensionMessage } from '../shared/messaging';
import { extractHost } from '../shared/matcher';
import { formatConsoleMessage } from '../shared/console';
import type { AppConfig, LogEntry } from '../shared/types';

const MAX_LOGS = 200;

// 临时存储 inject 推送的响应体，等待 background 推送 REQUEST_HIT 时匹配
// key: `${method}:${url}`, value: { body, status, ts }
const pendingResponses = new Map<string, { body: string | null; status: number; ts: number }>();

/**
 * 标准化 URL 用于匹配：去掉末尾斜杠、hash、query 排序等
 */
function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw);
    u.hash = '';
    return u.origin + u.pathname.replace(/\/$/, '');
  } catch {
    return raw;
  }
}

interface InjectMessage {
  source: 'vibcoding-inject';
  type: 'response' | 'sse-chunk';
  payload: {
    url: string;
    method: string;
    status: number;
    body: string | null;
    data?: string;
    done?: boolean;
  };
}

export function App() {
  const [config, setLocalConfig] = useState<AppConfig | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);
  const pendingCountRef = useRef(0);

  const currentHost = useMemo(() => extractHost(window.location.href), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [cfg, ls] = await Promise.all([getConfig(), getLogs()]);
      if (cancelled) return;
      setLocalConfig(cfg);
      setLogs(ls);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleConfigChange = useCallback(async (next: AppConfig) => {
    console.info('[vibcoding-ext] handleConfigChange 收到新 config, sites=', next.sites.map((s) => `${s.id}:${s.host}:${s.interfaces.length}条`));
    setLocalConfig(next);
    await setConfig(next);
    console.info('[vibcoding-ext] handleConfigChange 已写入 storage');
  }, []);

  const handleTogglePaused = useCallback(
    async (paused: boolean) => {
      if (!config) return;
      const next = { ...config, paused };
      await handleConfigChange(next);
    },
    [config, handleConfigChange],
  );

  const handleClearLogs = useCallback(async () => {
    setLogs([]);
    await clearLogs();
  }, []);

  const handleRemoveLogs = useCallback((siteId: string) => {
    setLogs((prev) => prev.filter((l) => l.siteId !== siteId));
  }, []);

  const handleHit = useCallback(async (entry: LogEntry) => {
    // 先检查是否有 pending 的响应体
    const key = `${entry.method}:${entry.url}`;
    const pending = pendingResponses.get(key);
    if (pending && Date.now() - pending.ts < 10000) {
      // 有缓存的响应体，直接合并
      entry.responseBody = pending.body ?? undefined;
      entry.responseStatus = pending.status;
      pendingResponses.delete(key);
    }

    setLogs((prev) => {
      const dedupKey = `${entry.url}:${entry.method}`;
      const last = prev[0];
      if (last && `${last.url}:${last.method}` === dedupKey && Date.now() - last.ts < 1000) {
        return prev;
      }
      return [entry, ...prev].slice(0, MAX_LOGS);
    });
    await appendLog(entry);
  }, []);

  // 监听 MAIN world 注入脚本的 postMessage: 补充响应体
  // 注意: pending 的开启/关闭由 background 的 REQUEST_START / REQUEST_END 统一驱动,
  // 此处不再操作 pendingCount, 避免与 webRequest 生命周期时序冲突导致提前停止.
  useEffect(() => {
    const messageHandler = (e: MessageEvent) => {
      const msg = e.data as InjectMessage;
      if (!msg || msg.source !== 'vibcoding-inject') return;

      console.log('[vibcoding-ext] 收到 inject postMessage:', msg.type, msg.payload.url);

      if (msg.type === 'response') {
        const { url, method, status, body } = msg.payload;
        console.log('[vibcoding-ext] 响应数据:', { url, method, status, bodyLen: body ? body.length : 0 });
        // 存储响应体到 pending 缓存，等待 background 推送 REQUEST_HIT 时合并
        const key = `${method}:${url}`;
        const ts = Date.now();
        pendingResponses.set(key, { body, status, ts });
        // 10 秒后自动清理
        setTimeout(() => {
          const entry = pendingResponses.get(key);
          if (entry && entry.ts === ts) {
            pendingResponses.delete(key);
          }
        }, 10000);

        // 尝试匹配现有日志条目（inject 晚于 background 到达的场景）
        setLogs((prev) => {
          const now = Date.now();
          const normUrl = normalizeUrl(url);
          const idx = prev.findIndex((l) => {
            if (l.method !== method) return false;
            if (now - l.ts >= 15000) return false;
            // 先精确匹配，再尝试标准化匹配
            return l.url === url || normalizeUrl(l.url) === normUrl;
          });
          if (idx === -1) {
            // 无匹配日志，响应体已存入 pending，等待 background 推送
            return prev;
          }
          console.log('[vibcoding-ext] 找到匹配日志，补充响应体，idx:', idx);
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            responseBody: body,
            responseStatus: status,
          };
          return updated;
        });
      } else if (msg.type === 'sse-chunk') {
        const { url, data } = msg.payload;
        // done 信号但没有数据，忽略 (后续 response 消息会填充完整 body)
        if (!data) return;
        setLogs((prev) => {
          const now = Date.now();
          const idx = prev.findIndex(
            (l) => l.url === url && now - l.ts < 15000,
          );
          if (idx === -1) return prev;
          const updated = [...prev];
          updated[idx] = {
            ...updated[idx],
            responseBody: (updated[idx].responseBody ?? '') + (data ?? ''),
          };
          return updated;
        });
      }
    };

    window.addEventListener('message', messageHandler);
    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  // 监听 background 推送
  useEffect(() => {
    // 记录仍在进行中的请求 url (按 method:url 去重), 避免同一请求重复计数
    const activeRequests = new Set<string>();
    const incPending = () => {
      pendingCountRef.current += 1;
      if (pendingCountRef.current === 1) setIsPending(true);
    };
    const decPending = () => {
      pendingCountRef.current = Math.max(0, pendingCountRef.current - 1);
      if (pendingCountRef.current === 0) setIsPending(false);
    };

    const listener = (msg: unknown) => {
      if (!isExtensionMessage(msg)) return;
      const m = msg as ExtensionMessage;
      if (m.type === MessageType.REQUEST_HIT) {
        console.info('[vibcoding-ext]', formatConsoleMessage(m.payload));
        void handleHit(m.payload);
      } else if (m.type === MessageType.REQUEST_START) {
        const key = `${m.payload.method}:${m.payload.url}`;
        if (activeRequests.has(key)) return;
        activeRequests.add(key);
        incPending();
      } else if (m.type === MessageType.REQUEST_END) {
        const key = `${m.payload.method}:${m.payload.url}`;
        if (!activeRequests.has(key)) return;
        activeRequests.delete(key);
        decPending();
      } else if (m.type === MessageType.CONFIG_UPDATED) {
        setLocalConfig(m.payload);
      } else if (m.type === MessageType.LOG_PAUSED) {
        setLocalConfig((prev) => (prev ? { ...prev, paused: m.payload.paused } : prev));
      }
    };
    chrome.runtime.onMessage.addListener(listener);
    return () => {
      chrome.runtime.onMessage.removeListener(listener);
    };
  }, [handleHit]);

  // storage 变更同步 (用户在另一个 tab 修改了配置)
  useEffect(() => {
    const listener = (
      changes: { [k: string]: chrome.storage.StorageChange },
      area: string,
    ) => {
      if (area === 'sync' && changes['vibcoding:config:v1']) {
        const next = changes['vibcoding:config:v1'].newValue as AppConfig | undefined;
        if (next) setLocalConfig(next);
      }
    };
    chrome.storage.onChanged.addListener(listener);
    return () => {
      chrome.storage.onChanged.removeListener(listener);
    };
  }, []);

  if (!config) return null;

  return (
    <>
      <FloatingDot
        currentHost={currentHost}
        config={config}
        onClick={() => setOpen((v) => !v)}
        isPending={isPending}
      />
      <SidePanel
        open={open}
        currentHost={currentHost}
        config={config}
        logs={logs}
        onClose={() => setOpen(false)}
        onConfigChange={handleConfigChange}
        onClearLogs={handleClearLogs}
        onTogglePaused={handleTogglePaused}
        onRemoveLogs={handleRemoveLogs}
      />
    </>
  );
}
