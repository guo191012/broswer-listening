/**
 * 共享类型定义
 * background / content 双方都依赖, 严格保持稳定.
 */

export type MatchType = 'exact' | 'substring' | 'regex';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'ANY';

export interface InterfaceConfig {
  id: string;
  name: string;
  pattern: string;
  matchType: MatchType;
  method: HttpMethod;
  enabled: boolean;
}

export interface SiteConfig {
  id: string;
  host: string;
  enabled: boolean;
  interfaces: InterfaceConfig[];
}

export interface AppConfig {
  version: 1;
  sites: SiteConfig[];
  paused: boolean;
}

export interface LogEntry {
  id: string;
  ts: number;
  siteId: string | null;
  siteHost: string;
  interfaceId: string;
  interfaceName: string;
  url: string;
  method: string;
  responseBody?: string | null;
  responseStatus?: number;
}

export const DEFAULT_CONFIG: AppConfig = {
  version: 1,
  sites: [],
  paused: false,
};
