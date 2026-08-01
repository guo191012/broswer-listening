/**
 * URL / host 匹配
 *  - host: 支持 "example.com" (精确) 与 "*.example.com" (子域通配)
 *  - interface pattern: exact | substring | regex
 */

import type { SiteConfig, InterfaceConfig } from './types';

/** tab URL → host (含端口). 无 host 则返回 null. */
export function extractHost(url: string | undefined | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.host; // 含端口
  } catch {
    return null;
  }
}

export function matchHost(siteHost: string, tabHost: string): boolean {
  if (!siteHost) return false;
  const s = siteHost.trim().toLowerCase();
  const t = tabHost.toLowerCase();
  if (s === t) return true;
  if (s.startsWith('*.')) {
    const base = s.slice(2);
    return t === base || t.endsWith(`.${base}`);
  }
  return false;
}

export function findSiteForHost(sites: SiteConfig[], tabHost: string): SiteConfig | null {
  for (const s of sites) {
    if (s.enabled && matchHost(s.host, tabHost)) return s;
  }
  return null;
}

// 缓存编译后的 regex, 避免每次请求都重新解析
const regexCache = new Map<string, RegExp | null>();

function compileRegex(pattern: string): RegExp | null {
  const cached = regexCache.get(pattern);
  if (cached !== undefined) return cached;
  try {
    const r = new RegExp(pattern);
    regexCache.set(pattern, r);
    return r;
  } catch {
    regexCache.set(pattern, null);
    return null;
  }
}

export function matchInterface(iface: InterfaceConfig, url: string, method: string): boolean {
  if (!iface.enabled) return false;
  if (iface.method !== 'ANY' && iface.method.toUpperCase() !== method.toUpperCase()) {
    return false;
  }
  switch (iface.matchType) {
    case 'exact':
      return url === iface.pattern;
    case 'substring':
      return url.includes(iface.pattern);
    case 'regex': {
      const r = compileRegex(iface.pattern);
      return r ? r.test(url) : false;
    }
    default:
      return false;
  }
}

export function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}
