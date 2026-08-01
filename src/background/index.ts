/**
 * Background Service Worker
 *  - 监听 chrome.webRequest.onBeforeRequest
 *  - 命中规则 → 构造 LogEntry → 推到对应 tab 的 content script
 *  - 同时打印到 service worker console (开发调试可见)
 */

import { getConfig } from '../shared/storage';
import { findSiteForHost, extractHost, matchInterface } from '../shared/matcher';
import { MessageType } from '../shared/messaging';
import { formatConsoleMessage } from '../shared/console';
import type { LogEntry } from '../shared/types';

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

function handleRequest(details: chrome.webRequest.WebRequestBodyDetails): void {
  if (!['xmlhttprequest', 'fetch', 'ping'].includes(details.type)) {
    return;
  }
  const tabId = details.tabId;
  if (tabId < 0) return; // 不是来自标签页

  // 取 tab URL 判断 host (webRequest 给的 initiatorUrl 不一定可读)
  chrome.tabs
    .get(tabId)
    .then((tab) => {
      const tabHost = extractHost(tab.url);
      if (!tabHost) return;
      void processHit(details, tabHost, tabId);
    })
    .catch(() => {
      /* tab 已关闭等场景, 忽略 */
    });
}

async function processHit(
  details: chrome.webRequest.WebRequestBodyDetails,
  tabHost: string,
  tabId: number,
): Promise<void> {
  const cfg = await getConfig();
  if (cfg.paused) return;

  const site = findSiteForHost(cfg.sites, tabHost);
  if (!site) return;

  for (const iface of site.interfaces) {
    if (matchInterface(iface, details.url, details.method)) {
      if (shouldDedupe(tabId, details.url)) return;

      const entry: LogEntry = {
        id: makeId(),
        ts: Date.now(),
        siteId: site.id,
        siteHost: tabHost,
        interfaceId: iface.id,
        interfaceName: iface.name,
        url: details.url,
        method: details.method,
      };

      console.info('[vibcoding-ext]', formatConsoleMessage(entry));

      try {
        await chrome.tabs.sendMessage(tabId, {
          type: MessageType.REQUEST_HIT,
          payload: entry,
        });
      } catch {
        // 内容脚本尚未注入 (如 chrome:// 页面) 或已卸载, 忽略
      }
      return;
    }
  }
}

chrome.webRequest.onBeforeRequest.addListener(
  handleRequest,
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
