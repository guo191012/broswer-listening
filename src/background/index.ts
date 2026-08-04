/**
 * Background Service Worker
 *  - 监听 chrome.webRequest.onBeforeRequest (命中规则 → 记录日志 + 通知"请求开始")
 *  - 监听 chrome.webRequest.onCompleted / onErrorOccurred (请求结束 → 通知"请求结束", 关闭 pending 状态)
 *  - 这样圆点的"橙色摇头晃脑"能精确绑定到接口请求的真实生命周期:
 *    请求发出 → 开始闪烁, 请求真正完成(SSE 流关闭) → 停止闪烁
 */

import { getConfig } from '../shared/storage';
import { findSiteForHost, extractHost, matchInterface } from '../shared/matcher';
import { MessageType } from '../shared/messaging';
import { formatConsoleMessage } from '../shared/console';
import type { LogEntry, SiteConfig } from '../shared/types';

// 1s 内同 URL 去重 (针对同一 tab), 避免 SPA 频繁请求刷屏
const recentHits = new Map<string, number>();
const DEDUP_WINDOW_MS = 1000;

function shouldDedupe(tabId: number, url: string): boolean {
  const key = `${tabId}:${url}`;
  const now = Date.now();
  const last = recentHits.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentHits.set(key, now);
  // 简单回收
  if (recentHits.size > 500) {
    const cutoff = now - DEDUP_WINDOW_MS;
    for (const [k, t] of recentHits) {
      if (t < cutoff) recentHits.delete(k);
    }
  }
  return false;
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function isTrackedType(type: string): boolean {
  return ['xmlhttprequest', 'fetch', 'ping'].includes(type);
}

/**
 * 解析某请求是否命中配置的规则.
 * 返回命中的 site 与 interface, 否则返回 null.
 */
async function resolveMatch(
  details: { url: string; method: string; tabId: number },
): Promise<{ site: SiteConfig; iface: SiteConfig['interfaces'][number] } | null> {
  const { tabId, url, method } = details;
  if (tabId < 0) return null;

  let tabHost: string | null = null;
  try {
    const tab = await chrome.tabs.get(tabId);
    tabHost = extractHost(tab.url);
  } catch {
    return null;
  }
  if (!tabHost) return null;

  const cfg = await getConfig();
  if (cfg.paused) return null;

  const site = findSiteForHost(cfg.sites, tabHost);
  if (!site) return null;

  for (const iface of site.interfaces) {
    if (matchInterface(iface, url, method)) {
      return { site, iface };
    }
  }
  return null;
}

/** 请求开始: 记录日志 + 通知 content 开启 pending(闪烁) */
function handleRequest(details: chrome.webRequest.WebRequestBodyDetails): void {
  if (!isTrackedType(details.type)) return;

  void (async () => {
    const match = await resolveMatch(details);
    if (!match) return;
    const { site, iface } = match;

    if (shouldDedupe(details.tabId, details.url)) return;

    const entry: LogEntry = {
      id: makeId(),
      ts: Date.now(),
      siteId: site.id,
      siteHost: site.host,
      interfaceId: iface.id,
      interfaceName: iface.name,
      url: details.url,
      method: details.method,
    };

    console.info('[vibcoding-ext]', formatConsoleMessage(entry));

    try {
      await chrome.tabs.sendMessage(details.tabId, {
        type: MessageType.REQUEST_HIT,
        payload: entry,
      });
    } catch {
      // 内容脚本尚未注入 (如 chrome:// 页面) 或已卸载, 忽略
    }

    try {
      await chrome.tabs.sendMessage(details.tabId, {
        type: MessageType.REQUEST_START,
        payload: { url: details.url, method: details.method },
      });
    } catch {
      /* 忽略 */
    }
  })();
}

/** 请求结束(成功): 通知 content 关闭 pending */
function handleCompleted(details: chrome.webRequest.WebResponseCacheDetails): void {
  if (!isTrackedType(details.type)) return;
  void (async () => {
    const match = await resolveMatch(details);
    if (!match) return;
    sendEnd(details.tabId, details.url, details.method);
  })();
}

/** 请求结束(出错/取消): 通知 content 关闭 pending */
function handleError(details: chrome.webRequest.WebResponseErrorDetails): void {
  if (!isTrackedType(details.type)) return;
  void (async () => {
    const match = await resolveMatch(details);
    if (!match) return;
    sendEnd(details.tabId, details.url, details.method);
  })();
}

function sendEnd(tabId: number, url: string, method: string): void {
  chrome.tabs.sendMessage(tabId, {
    type: MessageType.REQUEST_END,
    payload: { url, method },
  }).catch(() => {
    /* 忽略 */
  });
}

chrome.webRequest.onBeforeRequest.addListener(
  handleRequest,
  { urls: ['<all_urls>'] },
  [],
);

chrome.webRequest.onCompleted.addListener(
  handleCompleted,
  { urls: ['<all_urls>'] },
  [],
);

chrome.webRequest.onErrorOccurred.addListener(
  handleError,
  { urls: ['<all_urls>'] },
  [],
);

// 安装/启动时打印一次, 方便排查
chrome.runtime.onInstalled.addListener(() => {
  console.info('[vibcoding-ext] background installed');
});

chrome.runtime.onStartup.addListener(() => {
  console.info('[vibcoding-ext] background started');
});
